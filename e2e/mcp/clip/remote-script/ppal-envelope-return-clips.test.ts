// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for reading and writing the automation envelopes of Live 13's
 * return-track envelope clips, which only the Producer Pal remote script can
 * reach: the same `envelopes` read and write as for a session clip on a regular
 * track, addressed "rt<return>/s<scene>".
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * Uses: live-13-test; rt0 "A-Echo" s0 "No Envs" (no envelopes), rt1
 * "B-Wide Hallway" s0 "With Env" (Predelay: flat until 1.2, ramps up to 1.4,
 * then flat), and t0 "Drums" s1 "Notes". See
 * e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- clip/remote-script/ppal-envelope-return-clips
 */
import { afterEach, describe, expect, it } from "vitest";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../e2e-test-set.ts";
import {
  type ClipEnvelopeResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import { postEnvelopeRoute } from "../helpers/envelope-route-test-helpers.ts";
import { envelopeClipTools } from "../read/live-13/envelope-clip-tools.ts";

const NO_ENVS = "rt0/s0";
const WITH_ENV = "rt1/s0";
const NOTES_CLIP = "t0/s1";

/** A ramp across the first two beats of a 1-bar clip, in raw mixer-volume values. */
const VOLUME_LINE = "volume: 1|1 0.5 / 1|3 0.9";

interface EnvelopeEvent {
  time: number;
  value: number;
}

describe.skipIf(!REMOTE_SCRIPT_E2E || !LIVE_13_OR_NEWER)(
  "return-track envelope clips - automation envelopes (Live 13)",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext({
      once: true,
      liveSetPath: LIVE_13_TEST_PATH,
    });
    const { call } = envelopeClipTools(ctx);

    // The Set is shared, so every write leaves its clip as it found it.
    afterEach(async () => {
      for (const [track, slot] of [
        ["rt0", 0],
        ["t0", 1],
      ] as const) {
        await postEnvelopeRoute("clear", { track, slot });
      }
    });

    /**
     * Read a clip's envelopes.
     * @param path - The clip's path
     * @returns Whatever the clip's `envelopes` came back as
     */
    async function readEnvelopes(
      path: string,
    ): Promise<ReadClipResult["envelopes"]> {
      return (
        await call<ReadClipResult>("ppal-read-clip", {
          path,
          include: ["envelopes"],
        })
      ).envelopes;
    }

    /**
     * Read a clip with the default include, which flags a clip with envelopes.
     * @param path - The clip's path
     * @returns The clip's read result
     */
    async function readClip(path: string): Promise<ReadClipResult> {
      return await call<ReadClipResult>("ppal-read-clip", { path });
    }

    /**
     * Write a clip's envelopes through the tool.
     * @param path - The clip's path
     * @param envelopes - The `envelopes` param
     * @returns The clip's result entry
     */
    async function writeEnvelopes(
      path: string,
      envelopes: string,
    ): Promise<UpdateClipResult> {
      const result = await call<UpdateClipResult>("ppal-update-clip", {
        path,
        envelopes,
      });

      await sleep(100);

      return result;
    }

    /**
     * The id of a device parameter, as ppal-read-device gives it.
     * @param path - The device's path
     * @param search - A name the parameter matches
     * @returns The first match's id
     */
    async function parameterId(path: string, search: string): Promise<string> {
      const device = await call<{ parameters: Array<{ id: string }> }>(
        "ppal-read-device",
        { path, include: ["param-values"], paramSearch: search },
      );

      return device.parameters[0]!.id;
    }

    it("reads the Predelay envelope of 'With Env': flat, a ramp up, flat", async () => {
      const read = (await readEnvelopes(WITH_ENV)) as ClipEnvelopeResult[];
      const predelay = read.find((e) => /predelay/i.test(e.parameter));

      expect(predelay).toStrictEqual(
        expect.objectContaining({
          id: expect.any(String),
          device: expect.stringMatching(/^rt1\/d\d+$/),
          eventCount: expect.any(Number),
          events: expect.any(String),
        }),
      );
      expect(predelay?.eventCount).toBeGreaterThanOrEqual(2);

      // The shape, from the remote script's own events (raw values).
      const device = predelay?.device?.replace(/^rt1\//, "");
      const listed = await postEnvelopeRoute("list", {
        track: "rt1",
        slot: 0,
      });
      const entry = (
        listed.body.envelopes as Array<{
          device?: string;
          parameter_index?: number;
        }>
      ).find((e) => e.device === device);
      const events = (
        await postEnvelopeRoute("read", {
          track: "rt1",
          slot: 0,
          device,
          parameter: entry?.parameter_index,
        })
      ).body.events as EnvelopeEvent[];
      const early = events.filter((e) => e.time <= 1.2 + 0.01);
      const late = events.filter((e) => e.time >= 1.4 - 0.01);

      expect(early.length).toBeGreaterThan(0);
      expect(late.length).toBeGreaterThan(0);
      expect(new Set(early.map((e) => e.value.toFixed(4))).size).toBe(1);
      expect(new Set(late.map((e) => e.value.toFixed(4))).size).toBe(1);
      expect(late[0]!.value).toBeGreaterThan(early[0]!.value);
    });

    it("flags 'With Env' with envs, and 'No Envs' without", async () => {
      expect(await readClip(WITH_ENV)).toHaveProperty("envs", true);
      expect(await readClip(NO_ENVS)).not.toHaveProperty("envs");
    });

    it("reads 'No Envs' as an empty set", async () => {
      expect(await readEnvelopes(NO_ENVS)).toStrictEqual([]);
    });

    it("writes, reads back and clears an envelope on the return's own volume", async () => {
      const written = await writeEnvelopes(NO_ENVS, VOLUME_LINE);

      expect(written.envelopes).toBe(1);

      expect(await readEnvelopes(NO_ENVS)).toStrictEqual([
        {
          parameter: expect.any(String),
          id: expect.any(String),
          eventCount: 2,
          events: expect.stringMatching(/^1\|1 0\.5 .*\/ 1\|3 0\.9/),
        },
      ]);
      expect(await readClip(NO_ENVS)).toHaveProperty("envs", true);

      const cleared = await writeEnvelopes(NO_ENVS, "volume:");

      expect(cleared.envelopes).toBe(1);
      expect(await readEnvelopes(NO_ENVS)).toStrictEqual([]);
      expect(await readClip(NO_ENVS)).not.toHaveProperty("envs");
    });

    it("writes to the return's own device by parameter id", async () => {
      const id = await parameterId("rt0/d0", "Feedback");
      const written = await writeEnvelopes(NO_ENVS, `${id}: 1|1 0.2 / 1|3 0.6`);

      expect(written.envelopes).toBe(1);

      expect(await readEnvelopes(NO_ENVS)).toStrictEqual([
        expect.objectContaining({
          id,
          device: expect.stringMatching(/^rt0\/d\d+$/),
          eventCount: 2,
        }),
      ]);
    });

    it("refuses a parameter that isn't on the clip's own return track", async () => {
      const id = await parameterId("rt1/d0", "Predelay");
      const written = await writeEnvelopes(NO_ENVS, `${id}: 1|1 0.2 / 1|3 0.6`);

      expect(written.envelopes).toBe(0);
      expect(written.detail).toContain("is not on the clip's track (rt0)");
      expect(await readEnvelopes(NO_ENVS)).toStrictEqual([]);
    });

    it("still reads and writes a regular track's clip in the same Set", async () => {
      expect((await writeEnvelopes(NOTES_CLIP, VOLUME_LINE)).envelopes).toBe(1);

      expect(await readEnvelopes(NOTES_CLIP)).toStrictEqual([
        expect.objectContaining({ eventCount: 2 }),
      ]);
      expect(await readClip(NOTES_CLIP)).toHaveProperty("envs", true);

      expect((await writeEnvelopes(NOTES_CLIP, "volume:")).envelopes).toBe(1);
      expect(await readEnvelopes(NOTES_CLIP)).toStrictEqual([]);
    });
  },
);
