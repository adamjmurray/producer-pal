// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { type RequestOverrides } from "#src/mcp-server/helpers/request-overrides/request-overrides.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { withWriteQueue } from "./write-queue.ts";

export const WRITE = "ppal-update-clip";
export const READ = "ppal-read-clip";
export const TIMEOUT_MS = 45_000;

export interface Sent {
  tool: string;
  overrides?: RequestOverrides;
  queuedMs?: number;
  answer: (response?: McpResponse) => void;
  fail: (error: Error) => void;
}

/**
 * A stand-in V8 that holds every call until the test answers it.
 * @returns The queued call function and the calls that reached V8
 */
export function setup(): {
  call: ReturnType<typeof withWriteQueue>;
  sent: Sent[];
} {
  const sent: Sent[] = [];
  const send = vi.fn(
    (
      tool: string,
      _args: object,
      overrides?: RequestOverrides,
      queuedMs?: number,
    ) =>
      new Promise<McpResponse>((resolve, reject) => {
        sent.push({
          tool,
          overrides,
          queuedMs,
          answer: (response) =>
            resolve(response ?? { content: [{ type: "text", text: tool }] }),
          fail: reject,
        });
      }),
  );

  return { call: withWriteQueue(send, () => TIMEOUT_MS), sent };
}

/** @returns Nothing, once pending promise callbacks have run */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}
