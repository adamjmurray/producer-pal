// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type McpTestContext,
  type ReadClipResult,
} from "../../../mcp-test-helpers";
import { callParsed, callRefused } from "./call-tool-results";

/** The calls an envelope clip test makes, bound to its context. */
export interface EnvelopeClipTools {
  /** Call a tool and parse its result */
  call: <T>(name: string, args: Record<string, unknown>) => Promise<T>;
  /** Call a tool that is refused, and return what it said */
  refusal: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Read a clip by path or id, with its timing and color */
  readClip: (target: Record<string, unknown>) => Promise<ReadClipResult>;
}

/**
 * The tool calls envelope clip tests share.
 * @param ctx - The test context
 * @returns The calls, bound to the context
 */
export function envelopeClipTools(ctx: McpTestContext): EnvelopeClipTools {
  return {
    call: (name, args) => callParsed(ctx, name, args),
    refusal: (name, args) => callRefused(ctx, name, args),
    readClip: (target) =>
      callParsed<ReadClipResult>(ctx, "ppal-read-clip", {
        ...target,
        include: ["timing", "color"],
      }),
  };
}
