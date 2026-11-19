// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TIMEOUT_MS } from "#src/shared/config.ts";
import { END_OF_CHUNKS } from "#src/shared/mcp-responses.ts";
import {
  callLiveApi,
  handleLiveApiResult,
  setTimeoutForTesting,
} from "../../max-api-adapter.ts";

// Tested on its own. A real undo-step end here holds the queue between tests
// while its request fails, so the next test's write waits.
vi.mock(
  import("#src/mcp-server/rpc/remote-script/forwarded/end-undo-step.ts"),
  () => ({ endUndoStep: vi.fn(() => undefined) }),
);

const FIRST_TIMEOUT_MS = 100;

/**
 * Start a write that will time out, and a second write queued behind it with
 * room to wait out the late-answer cap.
 * @returns The outlet mock and both writes' results
 */
function startTimedOutWrite(): {
  outlet: ReturnType<typeof vi.mocked<typeof Max.outlet>>;
  first: ReturnType<typeof callLiveApi>;
  second: ReturnType<typeof callLiveApi>;
} {
  setTimeoutForTesting(FIRST_TIMEOUT_MS);
  Max.outlet = vi.fn().mockResolvedValue(undefined);

  return {
    outlet: vi.mocked(Max.outlet),
    first: callLiveApi("ppal-create-track", {}),
    second: callLiveApi(
      "ppal-update-clip",
      {},
      { timeoutMs: MAX_TIMEOUT_MS * 2 },
    ),
  };
}

/**
 * @param outlet - The outlet mock
 * @param index - Which call to answer
 */
function answer(
  outlet: ReturnType<typeof vi.mocked<typeof Max.outlet>>,
  index: number,
): void {
  handleLiveApiResult(
    outlet.mock.calls[index]![1],
    JSON.stringify({ content: [] }),
    END_OF_CHUNKS,
  );
}

describe("Max API Adapter: a timed-out write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the next write until V8 answers late", async () => {
    const { outlet, first, second } = startTimedOutWrite();

    await vi.advanceTimersByTimeAsync(FIRST_TIMEOUT_MS);
    const timedOut = await first;

    expect(timedOut.errorCode).toBe("timeout");
    await vi.advanceTimersByTimeAsync(1000);
    expect(outlet).toHaveBeenCalledTimes(1);

    answer(outlet, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(outlet).toHaveBeenCalledTimes(2);
    expect(outlet.mock.calls[1]![2]).toBe("ppal-update-clip");

    answer(outlet, 1);
    const result = await second;

    expect(result.isError).toBeUndefined();
  });

  it("gives up waiting for the late answer after the cap", async () => {
    const { outlet, first, second } = startTimedOutWrite();

    await vi.advanceTimersByTimeAsync(FIRST_TIMEOUT_MS);
    await first;
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS - 1);
    expect(outlet).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(outlet).toHaveBeenCalledTimes(2);

    // A late answer after the cap is for nobody.
    answer(outlet, 0);
    answer(outlet, 1);
    const result = await second;

    expect(result.isError).toBeUndefined();
  });
});
