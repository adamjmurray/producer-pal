// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests that ppal-read-track (mixer) and ppal-read-device (param-values)
 * show which parameters have an arrangement automation lane, and say they
 * can't know while the track plays from Session (Live then reads no lane, even
 * where one exists).
 *
 * The lanes come from copying a session clip with envelopes to the
 * arrangement. Stopping the track's clips with transport stopped puts it in
 * "stopped in Session" (playing_slot_index -2).
 *
 * Uses: e2e-test-set — t3 "Lead" (Drift, Compressor at d1), s4 free.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/remote-script/ppal-read-arrangement-automation
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import { skipBeforeLive } from "../../workflow/helpers/server-capability-test-helpers.ts";
import { callTool } from "../helpers/arrangement-clip-query-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { settledTool } from "../helpers/envelope-route-test-helpers.ts";

// Measured on a track with an instrument: one with no audio output behaves oddly.
const TRACK = 3;
const DEVICE = `t${String(TRACK)}/d1`;
const UNKNOWN =
  "arrangement automation unknown while the track plays from Session";

interface ReadMixerResult {
  automation?: string[];
  detail?: string;
}

interface ReadDeviceResult {
  parameters: { id: string; name: string; automation?: string }[];
  detail?: string;
}

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-read-track — arrangement automation",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext({ once: true });

    skipBeforeLive(ctx, "12.4", "Envelope.create_event, which writes points");

    /** Run operations on a Live object through ppal-live-api. */
    const liveApi = async (
      path: string,
      operations: unknown[],
    ): Promise<void> => {
      await callTool(ctx.client!, "ppal-live-api", { path, operations });
    };

    const readMixer = async (): Promise<ReadMixerResult> =>
      parseToolResult<ReadMixerResult>(
        await callTool(ctx.client!, "ppal-read-track", {
          path: `t${String(TRACK)}`,
          include: ["mixer"],
        }),
      );

    const readThreshold = async (): Promise<ReadDeviceResult> =>
      parseToolResult<ReadDeviceResult>(
        await callTool(ctx.client!, "ppal-read-device", {
          path: DEVICE,
          include: ["param-values"],
          paramSearch: "Threshold",
        }),
      );

    let prepared = false;

    /** The pan lane, written once after the config is set. */
    const prepare = async (): Promise<void> => {
      if (prepared) {
        return;
      }

      prepared = true;

      const threshold = (await readThreshold()).parameters[0]!.id;
      const id = await createClipInSlot(ctx, `t${String(TRACK)}/s4`, {
        notes: "C3 1|1",
        length: "1bar",
      });
      const written = await settledTool<UpdateClipResult>(
        ctx.client!,
        "ppal-update-clip",
        {
          id,
          envelopes: `pan: 1|1 -0.8 / 1|4 -0.1\n${threshold}: 1|1 0.2 / 1|4 0.6`,
        },
      );

      expect(written).toStrictEqual(expect.objectContaining({ envelopes: 2 }));

      await callTool(ctx.client!, "ppal-duplicate", {
        type: "clip",
        id,
        toPath: `t${String(TRACK)}[101|1]`,
      });
      await sleep(300);
    };

    beforeEach(async () => {
      await setConfig({ liveApiEnabled: true });
      await prepare();
    });

    it("shows the lanes while the track follows the arrangement", async () => {
      await liveApi("live_set", [
        { type: "call", method: "stop_playing" },
        { type: "set-property", property: "back_to_arranger", value: 0 },
      ]);
      await sleep(250);

      const mixer = await readMixer();

      expect(mixer.automation).toStrictEqual(["pan"]);
      expect(mixer.detail).toBeUndefined();

      const device = await readThreshold();

      expect(device.parameters[0]!.automation).toBe("active");
      expect(device.detail).toBeUndefined();
    });

    it("says it is unknown once the track is stopped in Session", async () => {
      await liveApi(`live_set tracks ${String(TRACK)}`, [
        { type: "call", method: "stop_all_clips" },
      ]);
      await sleep(250);

      const mixer = await readMixer();

      expect(mixer.automation).toBeUndefined();
      expect(mixer.detail).toBe(UNKNOWN);

      const device = await readThreshold();

      expect(device.parameters[0]!.automation).toBeUndefined();
      expect(device.detail).toBe(UNKNOWN);
    });
  },
);
