// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A warning has to reach the response of the request that raised it. The Max
// patch used to buffer warnings with no idea which request they belonged to, so
// two in flight — parallel subagent tool calls are routine — could swap them, and
// a warning raised with no request at all rode along on the next one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  END_OF_CHUNKS,
  reassembleChunks,
} from "#src/shared/mcp-response-utils.ts";
import { warn } from "#src/shared/max/v8-max-console.ts";
import { waitUntil } from "#src/shared/max/v8-sleep.ts";
import { installCapturingTask } from "./v8-protocol-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

vi.mock(import("#src/tools/clip/create/create-clip.ts"), () => ({
  createClip: vi.fn(),
}));

vi.mock(import("#src/tools/track/read/read-track.ts"), () => ({
  readTrack: vi.fn(),
}));

// The one thing that warns while a failed request unwinds — the debug build's
// LiveAPI build stats, reported from handleRequest's finally. Stubbed silent by
// default, like a release build.
vi.mock(import("#src/live-api-adapter/live-api-build-stats.ts"), () => ({
  beginLiveApiBuildStats: vi.fn(),
  reportLiveApiBuildStats: vi.fn(),
}));

const { createClip } = await import("#src/tools/clip/create/create-clip.ts");
const { readTrack } = await import("#src/tools/track/read/read-track.ts");
const { reportLiveApiBuildStats } =
  await import("#src/live-api-adapter/live-api-build-stats.ts");
const { requestNode } =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");
const { mcp_request, node_response } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/**
 * The warnings a request's `mcp_response` carried — the `warnings` sidecar in
 * its JSON payload.
 *
 * @param requestId - The request whose response to read
 * @returns The warning strings, or null if that request never responded
 */
function warningsSentFor(requestId: string): string[] | null {
  const call = vi
    .mocked(outlet)
    .mock.calls.find(
      (args) => args[1] === "mcp_response" && args[2] === requestId,
    );

  if (call == null) return null;

  const json = reassembleChunks(call.slice(3));

  return (JSON.parse(json) as { warnings?: string[] }).warnings ?? [];
}

/**
 * The id of the pending `node_request` a tool sent, so a test can answer it.
 *
 * @returns The request id
 */
function pendingNodeRequestId(): string {
  const call = vi
    .mocked(outlet)
    .mock.calls.find((args) => args[1] === "node_request");

  return call?.[2] as string;
}

/**
 * Answer the outstanding `node_request`, resuming the tool that sent it.
 */
function answerNodeRequest(): void {
  node_response(
    pendingNodeRequestId(),
    JSON.stringify({ success: true }),
    END_OF_CHUNKS,
  );
}

describe("warning correlation", () => {
  // Silent by default, like a release build.
  beforeEach(() => {
    vi.mocked(reportLiveApiBuildStats).mockImplementation(() => {});
  });

  it("keeps each request's warnings on its own response", async () => {
    // The only way V8 suspends mid-request is a round trip to Node, so that is
    // where the other request gets to run.
    vi.mocked(createClip).mockImplementation(async () => {
      warn("slow tool, before the round trip");
      await requestNode("any-route");
      warn("slow tool, after the round trip");

      return {};
    });
    vi.mocked(readTrack).mockImplementation(() => {
      warn("fast tool");

      return {};
    });

    const slow = mcp_request("req-slow", "ppal-create-clip", "{}");

    // The slow request is parked on its round trip, so this one runs start to
    // finish inside the gap.
    await mcp_request("req-fast", "ppal-read-track", "{}");

    answerNodeRequest();
    await slow;

    expect(warningsSentFor("req-fast")).toStrictEqual(["fast tool"]);
    expect(warningsSentFor("req-slow")).toStrictEqual([
      "slow tool, before the round trip",
      "slow tool, after the round trip",
    ]);
  });

  // The other way V8 suspends: a Task-backed sleep, reached from any locator op
  // in ppal-update-live-set. The capturing Task parks it until the test fires
  // the callback, the way answerNodeRequest() does for the round trip.
  it("keeps each request's warnings on its own response across a sleep", async () => {
    const captured: Array<() => void> = [];
    const restoreTask = installCapturingTask(captured);

    try {
      vi.mocked(createClip).mockImplementation(async () => {
        warn("slow tool, before the sleep");
        await waitUntil(() => false, { maxRetries: 1 });
        warn("slow tool, after the sleep");

        return {};
      });
      vi.mocked(readTrack).mockImplementation(() => {
        warn("fast tool");

        return {};
      });

      const slow = mcp_request("req-sleeping", "ppal-create-clip", "{}");

      await vi.waitFor(() => expect(captured).toHaveLength(1));

      // The slow request is parked in the sleep, so this one runs start to
      // finish inside the gap.
      await mcp_request("req-awake", "ppal-read-track", "{}");

      captured[0]?.();
      await slow;

      expect(warningsSentFor("req-awake")).toStrictEqual(["fast tool"]);
      expect(warningsSentFor("req-sleeping")).toStrictEqual([
        "slow tool, before the sleep",
        "slow tool, after the sleep",
      ]);
    } finally {
      restoreTask();
    }
  });

  // A throw is a path back out of an awaited section, so the catch has to
  // re-assert too. Without that, a warning raised while the request unwinds
  // rides out on whichever request started in the gap.
  it("keeps a failing request's unwind warnings on its own response", async () => {
    // Stands in for whatever warns while a request unwinds — in a debug build
    // that is the LiveAPI build stats, reported from handleRequest's finally.
    // Each call warns its own text: with both saying the same thing, one warning
    // copied onto both responses would read the same as one landing on each.
    let unwind = 0;

    vi.mocked(reportLiveApiBuildStats).mockImplementation(() => {
      unwind++;
      warn(`unwinding ${unwind}`);
    });
    vi.mocked(createClip).mockImplementation(async () => {
      await requestNode("any-route");

      throw new Error("boom");
    });
    vi.mocked(readTrack).mockReturnValue({} as never);

    const failing = mcp_request("req-failing", "ppal-create-clip", "{}");

    await vi.waitFor(() => expect(pendingNodeRequestId()).toBeDefined());
    answerNodeRequest();

    // Starts in the same tick the failing tool resumes in, so it is the active
    // capture while that request unwinds.
    const other = mcp_request("req-other", "ppal-read-track", "{}");

    await Promise.all([failing, other]);

    // req-other runs start to finish inside the gap, so it has taken the
    // capture and given it back by the time the failing one unwinds. Without a
    // resume in the catch, the failing request's own warning reaches nobody.
    const otherWarnings = warningsSentFor("req-other") ?? [];
    const failingWarnings = warningsSentFor("req-failing") ?? [];

    expect(otherWarnings).toHaveLength(1);
    expect(failingWarnings).toHaveLength(1);
    // Two distinct warnings were raised and each landed once — neither request
    // took the other's, and neither warning was duplicated across both.
    expect(new Set([...otherWarnings, ...failingWarnings])).toStrictEqual(
      new Set(["unwinding 1", "unwinding 2"]),
    );
  });

  it("sends no warnings for a request that raised none", async () => {
    vi.mocked(readTrack).mockReturnValue({} as never);

    await mcp_request("req-quiet", "ppal-read-track", "{}");

    expect(warningsSentFor("req-quiet")).toStrictEqual([]);
  });

  it("sends a warning on the response and nowhere else", async () => {
    vi.mocked(readTrack).mockImplementation(() => {
      warn("mine");

      return {};
    });

    await mcp_request("req-debug", "ppal-read-track", "{}");

    expect(warningsSentFor("req-debug")).toStrictEqual(["mine"]);

    // The response is the only channel. There is no second outlet mirroring
    // warnings, and no patch-side buffer to clear before the response goes out.
    const calls = vi.mocked(outlet).mock.calls;

    expect(calls.every((args) => args[0] === 0)).toBe(true);
    expect(calls.some((args) => args[1] === "zlclear")).toBe(false);
  });

  it("does not attach a warning raised with no request in flight", async () => {
    // What editing the Project Context box on a read-only folder does: the backup
    // is fired and forgotten, so it warns long after its own response went out.
    warn("stray, from no request at all");

    vi.mocked(readTrack).mockImplementation(() => {
      warn("mine");

      return {};
    });

    await mcp_request("req-after-stray", "ppal-read-track", "{}");

    expect(warningsSentFor("req-after-stray")).toStrictEqual(["mine"]);
  });
});
