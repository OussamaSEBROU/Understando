export type FreeQuotaLimits = {
  rpm: number;
  tpm: number;
  rpd: number;
  tpd: number;
};

export type QuotaStatus = FreeQuotaLimits & {
  minuteRequests: number;
  minuteTokens: number;
  dayRequests: number;
  dayTokens: number;
  remainingRequestsToday: number;
  remainingTokensToday: number;
};

type UsageEvent = {
  at: number;
  tokens: number;
};

export class QuotaLimitError extends Error {
  constructor(
    public readonly dimension: "RPM" | "TPM" | "RPD" | "TPD",
    message: string
  ) {
    super(message);
    this.name = "QuotaLimitError";
  }
}

const MINUTE_MS = 60_000;
const DEFAULT_MAX_QUEUE_WAIT_MS = 65_000;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const pacificDayKey = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "00";

  return `${value("year")}-${value("month")}-${value("day")}`;
};

const sum = (events: UsageEvent[]) =>
  events.reduce((total, event) => total + event.tokens, 0);

/**
 * A conservative, in-process governor for the no-cost path. Reservations are
 * serialized so concurrent subtitle chunks cannot race one another and exceed
 * the configured safety budget. Limits are deliberately configurable through
 * environment variables because provider quotas vary by account and model.
 */
export class FreeQuotaGovernor {
  private events: UsageEvent[] = [];
  private currentDay = pacificDayKey(Date.now());
  private dayRequests = 0;
  private dayTokens = 0;
  private serial: Promise<void> = Promise.resolve();

  constructor(
    private readonly limits: FreeQuotaLimits,
    private readonly now: () => number = () => Date.now(),
    private readonly wait: (ms: number) => Promise<void> = sleep,
    private readonly maxQueueWaitMs = DEFAULT_MAX_QUEUE_WAIT_MS
  ) {}

  private async exclusive<T>(task: () => T | Promise<T>): Promise<T> {
    const previous = this.serial;
    let release: (() => void) | undefined;
    this.serial = new Promise<void>(resolve => {
      release = resolve;
    });

    await previous;
    try {
      return await task();
    } finally {
      release?.();
    }
  }

  private resetDayIfNeeded(timestamp: number) {
    const day = pacificDayKey(timestamp);
    if (day !== this.currentDay) {
      this.currentDay = day;
      this.dayRequests = 0;
      this.dayTokens = 0;
    }
  }

  private trimMinute(timestamp: number) {
    this.events = this.events.filter(event => timestamp - event.at < MINUTE_MS);
  }

  /** Reserves an estimated total (prompt + completion) token budget. */
  async reserve(estimatedTotalTokens: number): Promise<void> {
    const tokens = Math.max(1, Math.ceil(estimatedTotalTokens));
    let waitedMs = 0;

    if (tokens > this.limits.tpm || tokens > this.limits.tpd) {
      throw new QuotaLimitError(
        "TPD",
        "The requested subtitle block is larger than the free safety budget. Use a shorter video or smaller blocks."
      );
    }

    for (;;) {
      const waitMs = await this.exclusive(() => {
        const timestamp = this.now();
        this.resetDayIfNeeded(timestamp);
        this.trimMinute(timestamp);

        if (this.dayRequests + 1 > this.limits.rpd) {
          throw new QuotaLimitError(
            "RPD",
            "The free translation budget is reserved for today. Please try again after the daily reset."
          );
        }
        if (this.dayTokens + tokens > this.limits.tpd) {
          throw new QuotaLimitError(
            "TPD",
            "The free token budget is reserved for today. Please try again after the daily reset."
          );
        }

        const minuteRequests = this.events.length;
        const minuteTokens = sum(this.events);
        const nextExitsAt = this.events[0]?.at
          ? this.events[0].at + MINUTE_MS - timestamp + 100
          : 0;

        if (minuteRequests + 1 > this.limits.rpm) {
          return Math.max(100, nextExitsAt);
        }
        if (minuteTokens + tokens > this.limits.tpm) {
          return Math.max(100, nextExitsAt);
        }

        this.events.push({ at: timestamp, tokens });
        this.dayRequests += 1;
        this.dayTokens += tokens;
        return 0;
      });

      if (waitMs === 0) return;
      if (waitedMs + waitMs > this.maxQueueWaitMs) {
        throw new QuotaLimitError(
          "RPM",
          "The translation queue is taking longer than expected. Please retry in a moment."
        );
      }
      waitedMs += waitMs;
      await this.wait(waitMs);
    }
  }

  async status(): Promise<QuotaStatus> {
    return this.exclusive(() => {
      const timestamp = this.now();
      this.resetDayIfNeeded(timestamp);
      this.trimMinute(timestamp);
      const minuteTokens = sum(this.events);
      return {
        ...this.limits,
        minuteRequests: this.events.length,
        minuteTokens,
        dayRequests: this.dayRequests,
        dayTokens: this.dayTokens,
        remainingRequestsToday: Math.max(0, this.limits.rpd - this.dayRequests),
        remainingTokensToday: Math.max(0, this.limits.tpd - this.dayTokens),
      };
    });
  }
}

const positiveInteger = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The defaults are intentionally below unknown free quotas. Deployments can
 * lower them further from environment settings; no paid or Batch mode exists.
 */
export const freeQuotaGovernor = new FreeQuotaGovernor({
  rpm: positiveInteger("FREE_TRANSLATION_RPM", 4),
  tpm: positiveInteger("FREE_TRANSLATION_TPM", 12_000),
  rpd: positiveInteger("FREE_TRANSLATION_RPD", 80),
  tpd: positiveInteger("FREE_TRANSLATION_TPD", 400_000),
});

export const estimateTranslationTokens = (text: string) =>
  Math.max(350, Math.ceil(text.length / 2));
