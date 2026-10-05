// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the remote script's envelope routes called directly: clearing
 * every envelope on a clip, and refusing return and master tracks.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/remote-script/ppal-envelope-routes
 */
import { describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import { postEnvelopeRoute } from "../helpers/envelope-route-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const TRACK = `t${String(EMPTY_MIDI_TRACK)}`;

describe.skipIf(!REMOTE_SCRIPT_E2E)("remote script envelope routes", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext();

  /**
   * A 1-bar clip in the first slot of the empty MIDI track, with a volume
   * envelope.
   */
  async function clipWithVolumeEnvelope(): Promise<void> {
    await createClipInSlot(ctx, `${TRACK}/s0`, {
      notes: "C3 1|1",
      length: "1bar",
    });

    const written = await postEnvelopeRoute("write", {
      track: TRACK,
      slot: 0,
      parameter: "volume",
      points: [
        { time: 0, value: 0.5 },
        { time: 2, value: 0.9 },
      ],
    });

    expect(written.status).toBe(200);
  }

  it("clears every envelope with no parameter, and says nothing remains", async () => {
    await clipWithVolumeEnvelope();

    const cleared = await postEnvelopeRoute("clear", {
      track: TRACK,
      slot: 0,
    });

    expect(cleared).toStrictEqual({
      status: 200,
      body: { cleared: true, all: true, remaining: false },
    });
    expect(
      (await postEnvelopeRoute("list", { track: TRACK, slot: 0 })).body,
    ).toStrictEqual({ envelopes: [] });
  });

  it("does not claim a clear when the clip had no envelopes to remove", async () => {
    await createClipInSlot(ctx, `${TRACK}/s0`, {
      notes: "C3 1|1",
      length: "1bar",
    });

    expect(
      await postEnvelopeRoute("clear", { track: TRACK, slot: 0 }),
    ).toStrictEqual({
      status: 200,
      body: { cleared: false, all: true, remaining: false },
    });
  });

  it("refuses return and master tracks, which have no clips", async () => {
    for (const [route, track] of [
      ["list", "rt0"],
      ["write", "mt"],
      ["clear", "rt0"],
    ] as const) {
      const refused = await postEnvelopeRoute(route, {
        track,
        slot: 0,
        parameter: "volume",
        points: [{ time: 0, value: 0.5 }],
      });

      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe(
        "track must be t0, t1... (return and master tracks have no clips)",
      );
    }
  });
});
