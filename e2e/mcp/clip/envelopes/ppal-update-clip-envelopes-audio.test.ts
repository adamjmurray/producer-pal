// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for envelopes on audio clips. Live keeps an unwarped clip's
 * envelopes but never plays them, so ppal-update-clip refuses to write points
 * to one and ppal-read-clip says an envelope it holds doesn't play.
 *
 * Uses: e2e-test-set — t5 "Audio 2" has free slots s1-s7.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/envelopes/ppal-update-clip-envelopes-audio
 */
import { describe, expect, it } from "vitest";
import { AUDIO_TRACK } from "../../e2e-test-set.ts";
import {
  type CreateClipResult,
  DRUM_LOOP_FILE,
  type ReadClipResult,
  setupMcpTestContext,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import { createUnwarpedDrumLoop } from "../helpers/audio-warp-test-helpers.ts";
import {
  postEnvelopeRoute,
  settledTool,
} from "../helpers/envelope-route-test-helpers.ts";

const TRACK = `t${String(AUDIO_TRACK)}`;
const SLOT_PATH = `${TRACK}/s1`;

const NOTATION = "1|1 0.5 ~ 1|3 0.9";

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-update-clip — envelopes on audio clips",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();

    const update = (id: string, args: Record<string, unknown>) =>
      settledTool<UpdateClipResult>(ctx.client!, "ppal-update-clip", {
        id,
        ...args,
      });

    const readEnvelopes = async (id: string) =>
      (
        await settledTool<ReadClipResult>(ctx.client!, "ppal-read-clip", {
          id,
          include: ["envelopes"],
        })
      ).envelopes;

    const createWarpedDrumLoop = async () =>
      (
        await settledTool<CreateClipResult>(ctx.client!, "ppal-create-clip", {
          sampleFile: DRUM_LOOP_FILE,
          path: SLOT_PATH,
          warping: true,
        })
      ).id;

    it("refuses points on an unwarped clip, and the clip stays without envelopes", async () => {
      const id = await createUnwarpedDrumLoop(ctx.client!, SLOT_PATH);

      expect(
        await update(id, { envelopes: `volume: ${NOTATION}` }),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 0,
          detail:
            'envelope "volume": not written: an unwarped audio clip can\'t play envelopes. Set warping: true on the clip, then write it again',
        }),
      );
      expect(await readEnvelopes(id)).toStrictEqual([]);
    });

    it("writes when the same call turns warping on", async () => {
      const id = await createUnwarpedDrumLoop(ctx.client!, SLOT_PATH);

      expect(
        await update(id, { warping: true, envelopes: `volume: ${NOTATION}` }),
      ).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
      expect(await readEnvelopes(id)).toHaveLength(1);
    });

    it("refuses when the same call turns warping off", async () => {
      const id = await createWarpedDrumLoop();

      expect(
        await update(id, { warping: false, envelopes: `volume: ${NOTATION}` }),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 0,
          detail: expect.stringContaining("unwarped audio clip") as string,
        }),
      );
    });

    it("reads an envelope on an unwarped clip with a note that it doesn't play, and a clear still runs", async () => {
      const id = await createWarpedDrumLoop();

      expect(
        (
          await postEnvelopeRoute("write", {
            track: TRACK,
            slot: 1,
            parameter: "volume",
            points: [
              { time: 0, value: 0.5 },
              { time: 2, value: 0.9 },
            ],
          })
        ).status,
      ).toBe(200);

      await update(id, { warping: false });

      expect(await readEnvelopes(id)).toStrictEqual([
        {
          parameter: expect.any(String),
          id: expect.any(String),
          eventCount: 2,
          events: expect.stringMatching(/^1\|1 0\.5 .*~ 1\|3 0\.9/),
          detail:
            "doesn't play: the clip is unwarped. Turn warping on to hear it",
        },
      ]);

      // Removing an envelope that can't play is allowed, and the line that
      // wrote points beside it is the only one refused.
      expect(
        await update(id, { envelopes: `pan: ${NOTATION}\nvolume:` }),
      ).toStrictEqual(
        expect.objectContaining({
          envelopes: 1,
          detail: expect.stringContaining('envelope "pan":') as string,
        }),
      );
      expect(await readEnvelopes(id)).toStrictEqual([]);
    });
  },
);
