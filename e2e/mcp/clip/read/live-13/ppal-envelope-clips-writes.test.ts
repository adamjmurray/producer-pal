// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the write tools on Live 13's envelope clips (the clips in a
 * return track's clip slots): update-clip, duplicate, delete, playback and
 * select act on them by path and by id. Notes and sample work is ignored with a
 * reason; they move and copy only between return slots.
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * One Set serves every test, so each puts back what it changed. Uses:
 * live-13-test, 8 scenes; rt0 "A-Echo" s0 "No Envs", rt1 "B-Wide Hallway" s0
 * "With Env" (a Predelay envelope), other return slots empty; t0 holds clips in
 * s0 and s1. See e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-envelope-clips-writes
 */
import { describe, expect, it } from "vitest";
import { envelopeClipTools } from "./envelope-clip-tools";
import {
  setupMcpTestContext,
  sleep,
  type SkippedTargetResult,
} from "../../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../../e2e-test-set.ts";

const NO_ENVS = "rt0/s0";
const WITH_ENV = "rt1/s0";
const ONLY_RETURN = "an envelope clip can only go to a return-track slot";
const ONLY_ENVELOPE = "a return-track slot only takes an envelope clip";
const IS_ENVELOPE = "the clip is an envelope clip";

/** One clip's entry in an update, duplicate or delete result. */
interface Entry {
  id?: string;
  path?: string;
  color?: string;
  ok?: false;
  detail?: string;
  deletedPath?: string;
}

describe.skipIf(!LIVE_13_OR_NEWER)("envelope clips: writes (Live 13)", () => {
  const ctx = setupMcpTestContext({
    once: true,
    liveSetPath: LIVE_13_TEST_PATH,
  });

  const { call, refusal, readClip } = envelopeClipTools(ctx);

  /**
   * Check a slot holds no clip.
   * @param path - The clip slot's path
   */
  async function expectEmpty(path: string): Promise<void> {
    expect(await refusal("ppal-read-clip", { path })).toContain("no clip");
  }

  /**
   * Wait for Live to start or stop a clip, which it does at its launch
   * quantization.
   * @param path - The clip slot's path
   * @param playing - The state to wait for
   */
  async function waitUntilPlaying(
    path: string,
    playing: boolean,
  ): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (((await readClip({ path })).playing ?? false) === playing) {
        return;
      }

      await sleep(250);
    }

    throw new Error(`${path} never ${playing ? "started" : "stopped"}`);
  }

  describe("ppal-update-clip", () => {
    it.each(["path", "id"] as const)(
      "renames, recolors and loops a clip named by %s, and reads back what landed",
      async (how) => {
        const before = await readClip({ path: NO_ENVS });
        const target = how === "path" ? { path: NO_ENVS } : { id: before.id };

        const updated = await call<Entry>("ppal-update-clip", {
          ...target,
          name: "Renamed",
          color: "#00FF00",
          looping: true,
          length: "2bar",
        });

        expect(updated.path).toBe(NO_ENVS);

        const after = await readClip({ path: NO_ENVS });

        expect(after).toStrictEqual(
          expect.objectContaining({
            type: "envelope",
            name: "Renamed",
            looping: true,
            length: "2bar",
          }),
        );
        expect(after.color).not.toBe(before.color);

        await call("ppal-update-clip", {
          path: NO_ENVS,
          name: before.name,
          color: before.color,
          looping: before.looping,
          length: before.length,
        });

        const restored = await readClip({ path: NO_ENVS });

        expect(restored).toStrictEqual(
          expect.objectContaining({
            name: before.name,
            color: before.color,
            looping: before.looping,
            length: before.length,
          }),
        );
      },
    );

    it("says what each note or sample param did nothing for, and changes nothing", async () => {
      const before = [
        await readClip({ path: NO_ENVS }),
        await readClip({ path: WITH_ENV }),
      ];

      for (const [names, params] of [
        ["notes", { notes: "C3 1|1" }],
        ["transforms", { transforms: "velocity = 100" }],
        ["duplicateLoop", { duplicateLoop: true }],
        ["quantize, quantizeGrid", { quantize: 1, quantizeGrid: "1/16" }],
        ["gainDb", { gainDb: 3 }],
        ["warping", { warping: true }],
        ["scale", { scale: "C Major" }],
      ] as const) {
        const result = await call<SkippedTargetResult[]>("ppal-update-clip", {
          path: `${NO_ENVS},${WITH_ENV}`,
          ...params,
        });

        expect(result.map((entry) => entry.detail)).toStrictEqual([
          `${names} ignored: ${IS_ENVELOPE}`,
          `${names} ignored: ${IS_ENVELOPE}`,
        ]);
      }

      expect([
        await readClip({ path: NO_ENVS }),
        await readClip({ path: WITH_ENV }),
      ]).toStrictEqual(before);
    });

    it("lands the name when notes were sent with it, and says the notes did nothing", async () => {
      const [entry] = await call<Entry[]>("ppal-update-clip", {
        path: `${NO_ENVS},${WITH_ENV}`,
        name: "Named,With Env",
        notes: "C3 1|1",
      });

      expect(entry?.detail).toBe(`notes ignored: ${IS_ENVELOPE}`);
      expect((await readClip({ path: NO_ENVS })).name).toBe("Named");

      await call("ppal-update-clip", { path: NO_ENVS, name: "No Envs" });
      expect((await readClip({ path: NO_ENVS })).name).toBe("No Envs");
    });

    it("moves a clip to another return slot and back, by Live's own copy", async () => {
      const moved = await call<Entry>("ppal-update-clip", {
        path: NO_ENVS,
        toPath: "rt0/s5",
      });

      expect(moved.path).toBe("rt0/s5");
      expect(await readClip({ path: "rt0/s5" })).toStrictEqual(
        expect.objectContaining({ type: "envelope", name: "No Envs" }),
      );
      await expectEmpty(NO_ENVS);

      await call("ppal-update-clip", { path: "rt0/s5", toPath: NO_ENVS });

      expect(await readClip({ path: NO_ENVS })).toStrictEqual(
        expect.objectContaining({ type: "envelope", name: "No Envs" }),
      );
      await expectEmpty("rt0/s5");
    });

    it("won't move one anywhere but a return slot, and won't take a regular clip in", async () => {
      for (const toPath of ["t0/s2", "t0[5|1]"]) {
        expect(
          await refusal("ppal-update-clip", { path: NO_ENVS, toPath }),
        ).toContain(ONLY_RETURN);
      }

      expect(
        await refusal("ppal-update-clip", { path: "t0/s1", toPath: "rt0/s4" }),
      ).toContain(ONLY_ENVELOPE);
      expect((await readClip({ path: NO_ENVS })).name).toBe("No Envs");
      expect((await readClip({ path: "t0/s1" })).name).toBe("Notes");
      await expectEmpty("t0/s2");
      await expectEmpty("rt0/s4");
    });
  });

  describe("ppal-duplicate and ppal-delete", () => {
    it("copies a clip to two return slots, and deletes the copies by path", async () => {
      const copies = await call<Entry[]>("ppal-duplicate", {
        type: "clip",
        path: NO_ENVS,
        toPath: "rt1/s2,rt0/s3",
      });

      expect(copies.map((copy) => copy.path)).toStrictEqual([
        "rt1/s2",
        "rt0/s3",
      ]);

      for (const path of ["rt1/s2", "rt0/s3"]) {
        expect(await readClip({ path })).toStrictEqual(
          expect.objectContaining({ type: "envelope", name: "No Envs" }),
        );
      }

      const deleted = await call<Entry[]>("ppal-delete", {
        type: "clip",
        path: "rt1/s2,rt0/s3",
      });

      expect(deleted.map((entry) => entry.deletedPath)).toStrictEqual([
        "rt1/s2",
        "rt0/s3",
      ]);
      await expectEmpty("rt1/s2");
      await expectEmpty("rt0/s3");
      expect((await readClip({ path: NO_ENVS })).name).toBe("No Envs");
    });

    it("copies a clip named by id, with a name, and deletes the copy by id", async () => {
      const source = await readClip({ path: WITH_ENV });
      const copy = await call<Entry>("ppal-duplicate", {
        type: "clip",
        id: source.id,
        toPath: "rt0/s1",
        name: "Copy",
      });

      expect(copy.path).toBe("rt0/s1");
      expect(await readClip({ id: copy.id })).toStrictEqual(
        expect.objectContaining({
          type: "envelope",
          name: "Copy",
          path: "rt0/s1",
        }),
      );

      const deleted = await call<Entry>("ppal-delete", {
        type: "clip",
        id: copy.id,
      });

      expect(deleted.deletedPath).toBe("rt0/s1");
      await expectEmpty("rt0/s1");
      expect((await readClip({ path: WITH_ENV })).name).toBe("With Env");
    });

    it("won't copy one to a regular slot or the arrangement, or take a regular clip", async () => {
      for (const toPath of ["t0/s2", "t0[5|1]"]) {
        expect(
          await refusal("ppal-duplicate", {
            type: "clip",
            path: NO_ENVS,
            toPath,
          }),
        ).toContain(ONLY_RETURN);
      }

      expect(
        await refusal("ppal-duplicate", {
          type: "clip",
          path: "t0/s1",
          toPath: "rt0/s4",
        }),
      ).toContain(ONLY_ENVELOPE);
      await expectEmpty("t0/s2");
      await expectEmpty("rt0/s4");
    });
  });

  describe("ppal-create-clip", () => {
    it("never makes one, and leaves the slot empty", async () => {
      expect(await refusal("ppal-create-clip", { path: "rt0/s1" })).toContain(
        "envelope clips can't be created; make one in Live",
      );
      await expectEmpty("rt0/s1");
    });
  });

  describe("ppal-playback and ppal-select", () => {
    it("launches and stops a clip by path and by id, which reads as playing", async () => {
      const clip = await readClip({ path: WITH_ENV });

      const launched = await call<{ playing: boolean; clip: Entry }>(
        "ppal-playback",
        { action: "play-session-clips", path: WITH_ENV },
      );

      expect(launched.playing).toBe(true);
      expect(launched.clip).toStrictEqual({ id: clip.id, path: WITH_ENV });
      await waitUntilPlaying(WITH_ENV, true);

      await call("ppal-playback", {
        action: "stop-session-clips",
        id: clip.id,
      });
      await waitUntilPlaying(WITH_ENV, false);

      await call("ppal-playback", {
        action: "play-session-clips",
        id: clip.id,
      });
      await waitUntilPlaying(WITH_ENV, true);

      await call("ppal-playback", {
        action: "stop-session-clips",
        path: WITH_ENV,
      });
      await waitUntilPlaying(WITH_ENV, false);
      await call("ppal-playback", { action: "stop" });
    });

    it("selects a clip by path and by id, in the session view", async () => {
      const clip = await readClip({ path: WITH_ENV });
      const byPath = await call<{
        view?: string;
        selectedClip?: { id: string; path: string };
      }>("ppal-select", { path: WITH_ENV });

      expect(byPath).toStrictEqual(
        expect.objectContaining({
          view: "session",
          selectedClip: { id: clip.id, path: WITH_ENV },
        }),
      );

      await call("ppal-select", { path: "t0/s0" });

      const byId = await call<{ selectedClip?: { path: string } }>(
        "ppal-select",
        { id: clip.id },
      );

      expect(byId.selectedClip?.path).toBe(WITH_ENV);
      expect(
        (await call<{ selectedClip?: { path: string } }>("ppal-select", {}))
          .selectedClip?.path,
      ).toBe(WITH_ENV);
    });
  });
});
