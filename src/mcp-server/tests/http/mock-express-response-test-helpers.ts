// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Response } from "express";

/**
 * A Response stub capturing the status + JSON body a rejection writes.
 * @returns The stub response plus the captured status/body state
 */
export function mockRes(): {
  res: Response;
  state: { status: number | null; body: unknown };
} {
  const state: { status: number | null; body: unknown } = {
    status: null,
    body: undefined,
  };
  const res = {
    status(code: number): Response {
      state.status = code;

      return res;
    },
    json(payload: unknown): Response {
      state.body = payload;

      return res;
    },
  } as unknown as Response;

  return { res, state };
}
