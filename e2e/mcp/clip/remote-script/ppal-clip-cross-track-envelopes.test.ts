// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what a session clip's copy or move to another track says about
 * its envelopes. Live's own copy keeps the mixer envelopes (volume, pan,
 * sends) and drops every device parameter's, so the target's entry names the
 * device ones it dropped.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track, which gets an Auto Filter
 * and the source clip; t0 "Drums" s6 is an empty slot to copy to, and t3 "Lead"
 * (an instrument, so its lanes can be read) gets an Auto Filter and the
 * arrangement copy.
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- clip/remote-script/ppal-clip-cross-track-envelopes
 */
import { describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  createTestDeviceAt,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import {
  ENVELOPE_WRITE_NEEDS,
  skipBeforeLive,
} from "../../workflow/helpers/server-capability-test-helpers.ts";
import { envelopeClipTools } from "../read/live-13/envelope-clip-tools.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const SOURCE_TRACK = `t${String(EMPTY_MIDI_TRACK)}`;
const SOURCE_SLOT = `${SOURCE_TRACK}/s0`;
const DESTINATION_SLOT = "t0/s6";
/** t3 "Lead": has an instrument, so its arrangement lanes are measurable. */
const ARRANGEMENT_TRACK = "t3";

interface Entry {
  id: string;
  path?: string;
  detail?: string;
}

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "session clip copied or moved to another track - envelopes",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call } = envelopeClipTools(ctx);

    skipBeforeLive(ctx, "12.4", ENVELOPE_WRITE_NEEDS);

    /**
     * One device parameter, matched by its exact name: a search also finds
     * parameters that merely contain it.
     * @param device - The device's path
     * @param name - The parameter's name
     * @returns The parameter's id, and its arrangement automation if any
     */
    async function parameterNamed(
      device: string,
      name: string,
    ): Promise<{ id: string; name: string; automation?: string }> {
      const { parameters } = await call<{
        parameters: Array<{ id: string; name: string; automation?: string }>;
      }>("ppal-read-device", {
        path: device,
        include: ["param-values"],
        paramSearch: name,
      });
      const found = parameters.find((parameter) => parameter.name === name);

      expect(found).toBeDefined();

      return found!;
    }

    /**
     * A clip on the empty MIDI track with an Auto Filter Frequency envelope and
     * a pan envelope.
     * @returns The device's path, where the clip's envelopes name it
     */
    async function automatedClip(): Promise<string> {
      const device = await createTestDeviceAt(
        ctx.client!,
        "Auto Filter",
        SOURCE_TRACK,
      );
      const frequency = await parameterNamed(device, "Frequency");
      const clip = await createClipInSlot(ctx, SOURCE_SLOT, {
        notes: "C3 1|1",
        length: "4bar",
      });
      const written = await call<{ envelopes?: number }>("ppal-update-clip", {
        id: clip,
        envelopes: `${frequency.id}: 1|1 0.2 / 1|3 0.6\npan: 1|1 -0.5 / 1|3 0.5`,
      });

      expect(written.envelopes).toBe(2);

      return device;
    }

    /**
     * Read a clip's envelopes.
     * @param path - The clip's path
     * @returns Each automated parameter's name
     */
    async function envelopeNames(path: string): Promise<string[]> {
      const { envelopes } = await call<{
        envelopes: Array<{ parameter: string }>;
      }>("ppal-read-clip", { path, include: ["envelopes"] });

      return envelopes.map((envelope) => envelope.parameter);
    }

    it("names the device envelope a copy dropped, and keeps the mixer one", async () => {
      const device = await automatedClip();
      const copy = await call<Entry>("ppal-duplicate", {
        type: "clip",
        path: SOURCE_SLOT,
        toPath: DESTINATION_SLOT,
      });

      expect(copy.path).toBe(DESTINATION_SLOT);
      expect(copy.detail).toBe(
        `dropped the device envelopes, which don't copy to another track: Frequency (${device})`,
      );
      expect(await envelopeNames(DESTINATION_SLOT)).toStrictEqual([
        expect.stringMatching(/pan/i),
      ]);
    });

    it("names the device envelope a move dropped", async () => {
      const device = await automatedClip();
      const moved = await call<Entry>("ppal-update-clip", {
        path: SOURCE_SLOT,
        toPath: DESTINATION_SLOT,
      });

      expect(moved.path).toBe(DESTINATION_SLOT);
      expect(moved.detail).toBe(
        `dropped the device envelopes, which don't copy to another track: Frequency (${device})`,
      );
    });

    it("says the lane write and the dropped device envelope for a copy to another track's arrangement", async () => {
      const device = await automatedClip();
      // The destination has its own Auto Filter, which would take the lane.
      const target = await createTestDeviceAt(
        ctx.client!,
        "Auto Filter",
        ARRANGEMENT_TRACK,
      );
      const copy = await call<Entry>("ppal-duplicate", {
        type: "clip",
        path: SOURCE_SLOT,
        toPath: `${ARRANGEMENT_TRACK}[101|1]`,
      });

      expect(copy.detail).toBe(
        "wrote its automation to the track's arrangement lane over this span; " +
          `dropped the device envelopes, which don't copy to another track: Frequency (${device})`,
      );

      // The track follows the arrangement, so its lanes can be read.
      await setConfig({ liveApiEnabled: true });
      await call("ppal-live-api", {
        path: "live_set",
        operations: [
          { type: "call", method: "stop_playing" },
          { type: "set-property", property: "back_to_arranger", value: 0 },
        ],
      });
      await sleep(250);

      const mixer = await call<{ automation?: string[] }>("ppal-read-track", {
        path: ARRANGEMENT_TRACK,
        include: ["mixer"],
      });

      expect(mixer.automation).toStrictEqual(["pan"]);
      expect((await parameterNamed(target, "Frequency")).automation).toBe(
        undefined,
      );
    });

    it("says nothing for a copy within the same track", async () => {
      await automatedClip();

      const copy = await call<Entry>("ppal-duplicate", {
        type: "clip",
        path: SOURCE_SLOT,
        toPath: `${SOURCE_TRACK}/s1`,
      });

      expect(copy.detail).toBeUndefined();
      expect(await envelopeNames(`${SOURCE_TRACK}/s1`)).toHaveLength(2);
    });
  },
);
