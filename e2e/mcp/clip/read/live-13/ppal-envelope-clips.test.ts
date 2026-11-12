// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for Live 13's envelope clips: the clips in a return track's clip
 * slots, which hold automation and no notes or sample. Reads address them as
 * "rt<return>/s<scene>" and list them with their track and scene. Every write
 * tool refuses them for now, by path and by id, and changes nothing.
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * Uses: live-13-test, 8 scenes; rt0 "A-Echo" s0 "No Envs" (no envelopes), rt1
 * "B-Wide Hallway" s0 "With Env" (a Predelay envelope), both 1 bar long. See
 * e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-envelope-clips
 */
import { describe, expect, it } from "vitest";
import { callParsed, callRefused } from "./call-tool-results";
import {
  type ReadClipResult,
  setupMcpTestContext,
  type SkippedTargetResult,
} from "../../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../../e2e-test-set.ts";

const NO_ENVS = "rt0/s0";
const WITH_ENV = "rt1/s0";
const REFUSED = "return-track clips can't be changed yet";

interface SceneRead {
  path: string;
  clipCount?: number;
  clips?: Array<{ path?: string; type?: string; trackName?: string }>;
}

interface TrackRead {
  path?: string;
  sessionClipCount?: number;
  sessionClips?: Array<{
    path?: string;
    type?: string;
    name?: string;
    envs?: boolean;
  }>;
}

describe.skipIf(!LIVE_13_OR_NEWER)("envelope clips (Live 13)", () => {
  const ctx = setupMcpTestContext({
    once: true,
    liveSetPath: LIVE_13_TEST_PATH,
  });

  const call = <T>(name: string, args: Record<string, unknown>): Promise<T> =>
    callParsed<T>(ctx, name, args);
  const refusal = (
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> => callRefused(ctx, name, args);

  /**
   * Read a clip with its timing.
   * @param target - A path or an id, as read-clip's argument
   * @returns The clip
   */
  async function readClip(
    target: Record<string, unknown>,
  ): Promise<ReadClipResult> {
    return await call<ReadClipResult>("ppal-read-clip", {
      ...target,
      include: ["timing"],
    });
  }

  /**
   * Check both clips read as they did at the start, after a refused write.
   */
  async function expectUnchanged(): Promise<void> {
    const noEnvs = await readClip({ path: NO_ENVS });
    const withEnv = await readClip({ path: WITH_ENV });

    expect(noEnvs.name).toBe("No Envs");
    expect(noEnvs.envs).toBeUndefined();
    expect(noEnvs.playing).toBeUndefined();
    expect(withEnv.name).toBe("With Env");
    expect(withEnv.length).toBe("1bar");
  }

  describe("reads", () => {
    it("reads each clip by path as an envelope clip, with its timing in bars", async () => {
      const noEnvs = await readClip({ path: NO_ENVS });
      const withEnv = await readClip({ path: WITH_ENV });

      expect(noEnvs).toStrictEqual(
        expect.objectContaining({
          type: "envelope",
          name: "No Envs",
          path: NO_ENVS,
          timeSignature: "4/4",
          start: "1|1",
          end: "2|1",
          length: "1bar",
        }),
      );
      expect(noEnvs).not.toHaveProperty("notes");
      expect(noEnvs).not.toHaveProperty("gainDb");
      expect(noEnvs).not.toHaveProperty("warpMode");
      expect(withEnv).toStrictEqual(
        expect.objectContaining({
          type: "envelope",
          name: "With Env",
          path: WITH_ENV,
          envs: true,
        }),
      );
    });

    it("reads the same clips by id, with the path of their slot", async () => {
      const byPath = await readClip({ path: WITH_ENV });
      const byId = await readClip({ id: byPath.id });

      expect(byId).toStrictEqual(byPath);
    });

    it("says its envelopes can't be read yet, not that it isn't a session clip", async () => {
      const clip = await call<ReadClipResult>("ppal-read-clip", {
        path: WITH_ENV,
        include: ["envelopes"],
      });

      expect(clip.envelopes).toBe(
        "envelopes on return-track clips can't be read yet",
      );
    });

    it("lists each return track's clip, and counts it", async () => {
      const listed = await call<TrackRead>("ppal-read-track", {
        path: "rt1",
        include: ["session-clips"],
      });
      const counted = await call<TrackRead>("ppal-read-track", { path: "rt0" });

      expect(listed.sessionClips).toStrictEqual([
        expect.objectContaining({
          type: "envelope",
          name: "With Env",
          path: WITH_ENV,
          envs: true,
        }),
      ]);
      expect(counted.sessionClipCount).toBe(1);
    });

    it("lists both return clips in scene 0, after the regular tracks' clips", async () => {
      const first = await call<SceneRead>("ppal-read-scene", {
        path: "s0",
        include: ["clips"],
      });
      const second = await call<SceneRead>("ppal-read-scene", {
        path: "s1",
        include: ["clips"],
      });

      expect(first.clips).toStrictEqual([
        expect.objectContaining({ path: "t0/s0", type: "step-sequencer" }),
        expect.objectContaining({
          path: NO_ENVS,
          type: "envelope",
          trackName: "A-Echo",
        }),
        expect.objectContaining({
          path: WITH_ENV,
          trackName: "B-Wide Hallway",
        }),
      ]);
      // Scene 1 holds only the Drums track's notes clip.
      expect(second.clips).toStrictEqual([
        expect.objectContaining({ path: "t0/s1" }),
      ]);
    });

    it("counts them in the Live Set", async () => {
      const liveSet = await call<{
        scenes: SceneRead[];
        returnTracks: TrackRead[];
      }>("ppal-read-live-set", { include: ["scenes", "tracks"] });

      // Scene 0: the step sequencer clip and both return clips.
      expect(liveSet.scenes[0]?.clipCount).toBe(3);
      expect(liveSet.scenes[1]?.clipCount).toBe(1);
      expect(
        liveSet.returnTracks.map((track) => track.sessionClipCount),
      ).toStrictEqual([1, 1]);
    });

    it("refuses an arrangement position and a take lane on a return track", async () => {
      expect(await refusal("ppal-read-clip", { path: "rt0[1|1]" })).toContain(
        "a song position needs an arrangement lane",
      );
      expect(await refusal("ppal-read-clip", { path: "rt0/l0" })).toContain(
        "only regular tracks have take lanes",
      );
    });
  });

  describe("every write tool refuses them, and changes nothing", () => {
    it.each([
      ["path", { path: NO_ENVS }],
      ["id", { id: "ID" }],
    ])("ppal-update-clip, named by %s", async (how, target) => {
      const args = how === "id" ? await idOf(target) : target;

      expect(
        await refusal("ppal-update-clip", { ...args, name: "Renamed" }),
      ).toContain(REFUSED);
      await expectUnchanged();
    });

    it("ppal-update-clip skips only the envelope clip in a list", async () => {
      const result = await call<Array<{ ok?: false; detail?: string }>>(
        "ppal-update-clip",
        { path: `t0/s1,${NO_ENVS}`, name: "Notes" },
      );

      expect(result[1]).toStrictEqual(
        expect.objectContaining({ ok: false, detail: REFUSED }),
      );
      await expectUnchanged();
    });

    it("ppal-update-clip skips a move into a return slot", async () => {
      expect(
        await refusal("ppal-update-clip", { path: "t0/s1", toPath: "rt0/s1" }),
      ).toContain(REFUSED);
      expect((await readClip({ path: "t0/s1" })).name).toBe("Notes");
    });

    it.each([
      ["path", { path: NO_ENVS }],
      ["id", { id: "ID" }],
    ])("ppal-delete, named by %s", async (how, target) => {
      const args = how === "id" ? await idOf(target) : target;

      expect(await refusal("ppal-delete", { type: "clip", ...args })).toContain(
        REFUSED,
      );
      await expectUnchanged();
    });

    it("ppal-delete skips only the envelope clip in a list", async () => {
      const result = await call<SkippedTargetResult[]>("ppal-delete", {
        type: "clip",
        path: `${NO_ENVS},${WITH_ENV}`,
      });

      expect(result.map((entry) => entry.detail)).toStrictEqual([
        REFUSED,
        REFUSED,
      ]);
      await expectUnchanged();
    });

    it("ppal-duplicate refuses one as the source, and a return slot as the destination", async () => {
      expect(
        await refusal("ppal-duplicate", {
          type: "clip",
          path: NO_ENVS,
          toPath: "t0/s2",
        }),
      ).toContain(REFUSED);
      expect(
        await refusal("ppal-duplicate", {
          type: "clip",
          path: "t0/s1",
          toPath: "rt0/s1",
        }),
      ).toContain(REFUSED);
      await expectUnchanged();
      expect(await refusal("ppal-read-clip", { path: "t0/s2" })).toContain(
        "no clip",
      );
    });

    it("ppal-playback neither launches nor stops one", async () => {
      expect(
        await refusal("ppal-playback", {
          action: "play-session-clips",
          path: NO_ENVS,
        }),
      ).toContain(REFUSED);
      expect(
        await refusal("ppal-playback", {
          action: "stop-session-clips",
          path: WITH_ENV,
        }),
      ).toContain(REFUSED);
      await expectUnchanged();
    });

    it("ppal-select won't select one", async () => {
      expect(await refusal("ppal-select", { path: NO_ENVS })).toContain(
        REFUSED,
      );
    });

    it("ppal-create-clip never makes one", async () => {
      expect(await refusal("ppal-create-clip", { path: "rt0/s1" })).toContain(
        "envelope clips can't be created; make one in Live",
      );
      expect(await refusal("ppal-read-clip", { path: "rt0/s1" })).toContain(
        "no clip",
      );
    });
  });

  /**
   * The id of the clip a path names, in place of the placeholder.
   * @param target - `{ id: "ID" }`, from a test naming a clip by id
   * @returns The same argument with the real id of the clip at NO_ENVS
   */
  async function idOf(
    target: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const clip = await readClip({ path: NO_ENVS });

    return { ...target, id: clip.id };
  }
});
