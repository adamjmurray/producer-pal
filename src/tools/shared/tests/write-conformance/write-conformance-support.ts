// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { resetLiveApiTracking } from "#src/live-api-adapter/live-api-release.ts";
import { beginWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import {
  type MockWrite,
  getMockWrites,
} from "#src/test/mocks/registry/mock-write-log.ts";
import { type WriteToolAdapter } from "./write-conformance-types.ts";

/** Calls that only read, so they don't count as a write. */
const READ_ONLY_CALL = /^(get_|str_for_value$|guess_playback_length$)/;

/**
 * Start over with an empty Live Set, as `beforeEach` does, so a case can set up
 * the same call twice.
 */
export function freshLive(): void {
  clearMockRegistry();
  resetLiveApiTracking();
  beginWarningCapture();
}

/**
 * Everything the call has written so far: every `set`, and every `call` that
 * isn't a read.
 * @returns The writes, in order
 */
export function writesMade(): MockWrite[] {
  return getMockWrites().filter(
    (write) => write.kind === "set" || !READ_ONLY_CALL.test(write.name),
  );
}

/**
 * Run a tool, turning a throw — sync or async — into a rejection.
 * @param adapter - The tool
 * @param args - The call
 * @returns What the tool returned
 */
export async function runTool(
  adapter: WriteToolAdapter,
  args: Record<string, unknown>,
): Promise<unknown> {
  return await adapter.run(args);
}

/**
 * The entries a call came back with, whether or not it unwrapped a lone one.
 * @param result - What the tool returned
 * @returns One entry per target
 */
export function entriesOf(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : [result]) as Record<
    string,
    unknown
  >[];
}
