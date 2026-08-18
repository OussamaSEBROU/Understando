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
  VideoTranslationError,
} from "./videoTranslation";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
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
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await translateVideo({
            youtubeUrl: input.youtubeUrl,
            targetLanguage: input.targetLanguage as Parameters<typeof translateVideo>[0]["targetLanguage"],
          });
        } catch (error) {
          if (error instanceof QuotaLimitError) {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
          }
          if (error instanceof VideoTranslationError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          throw error;
        }
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
