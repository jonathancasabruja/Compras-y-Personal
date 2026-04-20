/**
 * tRPC setup. No transformer configured — client uses plain JSON to keep
 * the fetch layer simple and avoid superjson on both sides.
 */

import { initTRPC } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export function createContext(opts: CreateExpressContextOptions) {
  return { req: opts.req, res: opts.res };
}

const t = initTRPC.context<ReturnType<typeof createContext>>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
