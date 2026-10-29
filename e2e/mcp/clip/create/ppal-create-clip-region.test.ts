// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the region a created clip ends up with.
 *
 * create-clip writes the loop brace and the markers one property at a time, and
 * Live's rules decide whether each write lands: it rejects a loop_start past
 * loop_end, drops a start_marker past end_marker, and ignores start_marker
 * while looping is off. Unit tests pin the write order; only real Live says the
 * clip comes out where it was asked to. A clip made at `start: "2|1"` with one
 * bar of length is the case that needs the start written after the end.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track, session and arrangement alike)
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-create-clip-region
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { readRegion } from "../helpers/clip-region-test-helpers.ts";
import { readClipFully } from "../helpers/clip-io-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

beforeEach(async () => {
  await setConfig({ liveApiEnabled: true });
});

// Each case gets its own spot: a slot, or a stretch of the arrangement.
const CASES = [
  { view: "arrangement", looping: true, path: `t${EMPTY_MIDI_TRACK}[601|1]` },
  { view: "arrangement", looping: false, path: `t${EMPTY_MIDI_TRACK}[605|1]` },
  { view: "session", looping: true, path: `t${EMPTY_MIDI_TRACK}/s0` },
  { view: "session", looping: false, path: `t${EMPTY_MIDI_TRACK}/s1` },
];

describe("ppal-create-clip region", () => {
  it.each(CASES)(
    "puts a $view clip with looping $looping at 2|1-3|1",
    async ({ looping, path }) => {
      const created = parseToolResult<CreateClipResult>(
        await ctx.client!.callTool({
          name: "ppal-create-clip",
          arguments: {
            path,
            notes: "C3 2|1",
            start: "2|1",
            length: "1bar",
            looping,
          },
        }),
      );

      await sleep(100);

      const clip = await readClipFully(ctx.client!, { id: created.id });

      expect(clip.looping).toBe(looping);
      expect(clip.start).toBe("2|1");
      expect(clip.end).toBe("3|1");
      expect(clip.length).toBe("1bar");

      // Both pairs, not just the one read-clip shows for this looping state.
      expect(await readRegion(ctx.client!, created.id)).toStrictEqual({
        looping,
        loop_start: 4,
        loop_end: 8,
        start_marker: 4,
        end_marker: 8,
      });
    },
  );
});
