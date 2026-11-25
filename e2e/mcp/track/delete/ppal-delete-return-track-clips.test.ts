// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-delete naming the clips that go with a return track on
 * Live 13, where a return track holds an envelope clip in a scene's slot.
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * Uses: live-13-test, where s0 holds rt0 "No Envs" and rt1 "With Env". See
 * e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/track/delete/ppal-delete-return-track-clips.test.ts
 */
import { describe, expect, it } from "vitest";
import { callParsed } from "../../clip/read/live-13/call-tool-results";
import { setupMcpTestContext } from "../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../e2e-test-set.ts";

interface DeleteResult {
  id: string;
  deletedPath: string;
  detail?: string;
}

describe.skipIf(!LIVE_13_OR_NEWER)(
  "ppal-delete of return tracks with clips (Live 13)",
  () => {
    const ctx = setupMcpTestContext({
      once: true,
      liveSetPath: LIVE_13_TEST_PATH,
    });

    it("names the clip each return track held, at the path it had", async () => {
      const deleted = await callParsed<DeleteResult[]>(ctx, "ppal-delete", {
        type: "track",
        path: "rt0,rt1",
      });

      expect(deleted).toStrictEqual([
        {
          id: expect.any(String),
          deletedPath: "rt0",
          detail: 'also deleted the clip on this track: rt0/s0 "No Envs"',
        },
        {
          id: expect.any(String),
          deletedPath: "rt1",
          detail: 'also deleted the clip on this track: rt1/s0 "With Env"',
        },
      ]);
    });
  },
);
