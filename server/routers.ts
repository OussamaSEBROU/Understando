import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { QuotaLimitError } from "./quotaGovernor";
import {
  supportedTargetLanguageCodes,
  translateVideo,
  translateVideoSegment,
  VideoTranslationError,
} from "./videoTranslation";

const rethrowVideoTranslationError = (error: unknown): never => {
  if (error instanceof QuotaLimitError) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
  }
  if (error instanceof VideoTranslationError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  video: router({
    translate: publicProcedure
      .input(
        z.object({
          youtubeUrl: z.string().trim().min(1).max(1_024),
          targetLanguage: z.enum(supportedTargetLanguageCodes as [string, ...string[]]),
          durationSec: z.number().positive().max(28_800).optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await translateVideo({
            youtubeUrl: input.youtubeUrl,
            targetLanguage: input.targetLanguage as Parameters<typeof translateVideo>[0]["targetLanguage"],
            durationSec: input.durationSec,
          });
        } catch (error) {
          return rethrowVideoTranslationError(error);
        }
      }),
    translateSegment: publicProcedure
      .input(
        z
          .object({
            youtubeUrl: z.string().trim().min(1).max(1_024),
            targetLanguage: z.enum(supportedTargetLanguageCodes as [string, ...string[]]),
            startSec: z.number().int().min(0).max(28_800),
            endSec: z.number().int().positive().max(28_800),
          })
          .refine(input => input.endSec > input.startSec, {
            message: "The subtitle segment must have a positive duration.",
            path: ["endSec"],
          })
      )
      .mutation(async ({ input }) => {
        try {
          return await translateVideoSegment({
            youtubeUrl: input.youtubeUrl,
            targetLanguage: input.targetLanguage as Parameters<typeof translateVideoSegment>[0]["targetLanguage"],
            startSec: input.startSec,
            endSec: input.endSec,
          });
        } catch (error) {
          return rethrowVideoTranslationError(error);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
