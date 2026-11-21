// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for scene duplicate and scene delete on Live 13, where a scene also
 * holds a clip in each return track's slot. A duplicate lists the copied
 * return-track clips and `withoutClips` clears them; a delete names every clip
 * that went with the scene.
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * One Set serves every test, so each deletes the scene it made. Uses:
 * live-13-test, 8 scenes; s0 holds t0 "Step Sequencer", rt0 "No Envs" and rt1
 * "With Env"; s1 holds t0 "Notes"; the rest are empty. See
 * e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/scene/live-13/ppal-scene-return-clips.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  callParsed,
  callRefused,
} from "../../clip/read/live-13/call-tool-results";
import { setupMcpTestContext, sleep } from "../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../e2e-test-set.ts";

const FULL_SCENE_DETAIL =
  'also deleted the 3 clips in this scene: t0/s1 "Step Sequencer", rt0/s1 "No Envs", rt1/s1 "With Env"';

interface CopiedScene {
  id: string;
  path: string;
  clips: Array<{ id: string; path: string }>;
}

interface DeletedScene {
  id: string;
  deletedPath: string;
  detail?: string;
}

interface SceneRead {
  clips?: Array<{ path: string; name?: string; trackName?: string }>;
}

describe.skipIf(!LIVE_13_OR_NEWER)(
  "scenes with return-track clips (Live 13)",
  () => {
    const ctx = setupMcpTestContext({
      once: true,
      liveSetPath: LIVE_13_TEST_PATH,
    });

    /**
     * Call a tool and let Live settle.
     * @param name - Tool name
     * @param args - Tool arguments
     * @returns The parsed result
     */
    async function call<T>(
      name: string,
      args: Record<string, unknown>,
    ): Promise<T> {
      const result = await callParsed<T>(ctx, name, args);

      await sleep(100);

      return result;
    }

    /**
     * How many scenes the Set has.
     * @returns The scene count
     */
    async function sceneCount(): Promise<number> {
      return (await call<{ sceneCount: number }>("ppal-read-live-set", {}))
        .sceneCount;
    }

    it("lists the copied return-track clips, then names every clip a delete removed", async () => {
      const copy = await call<CopiedScene>("ppal-duplicate", {
        type: "scene",
        path: "s0",
      });

      expect(copy.path).toBe("s1");
      expect(copy.clips.map((clip) => clip.path)).toStrictEqual([
        "t0/s1",
        "rt0/s1",
        "rt1/s1",
      ]);
      expect(await sceneCount()).toBe(9);

      const read = await call<SceneRead>("ppal-read-scene", {
        id: copy.id,
        include: ["clips"],
      });

      expect(read.clips).toStrictEqual([
        expect.objectContaining({ path: "t0/s1", name: "Step Sequencer" }),
        expect.objectContaining({
          path: "rt0/s1",
          name: "No Envs",
          trackName: "A-Echo",
        }),
        expect.objectContaining({
          path: "rt1/s1",
          name: "With Env",
          trackName: "B-Wide Hallway",
        }),
      ]);

      const deleted = await call<DeletedScene>("ppal-delete", {
        type: "scene",
        id: copy.id,
      });

      expect(deleted).toStrictEqual({
        id: copy.id,
        deletedPath: "s1",
        detail: FULL_SCENE_DETAIL,
      });
      expect(await sceneCount()).toBe(8);

      // The scene that was s1 is back where it was.
      const notes = await call<SceneRead>("ppal-read-scene", {
        path: "s1",
        include: ["clips"],
      });

      expect(notes.clips).toStrictEqual([
        expect.objectContaining({ path: "t0/s1", name: "Notes" }),
      ]);
    });

    it("clears the return-track clips too when the copy is made without clips", async () => {
      const copy = await call<CopiedScene>("ppal-duplicate", {
        type: "scene",
        path: "s0",
        withoutClips: true,
      });

      expect(copy.clips).toStrictEqual([]);

      const read = await call<SceneRead>("ppal-read-scene", {
        id: copy.id,
        include: ["clips"],
      });

      expect(read.clips).toStrictEqual([]);

      for (const path of ["t0/s1", "rt0/s1", "rt1/s1"]) {
        expect(await callRefused(ctx, "ppal-read-clip", { path })).toContain(
          "no clip",
        );
      }

      // Nothing was in it, so the delete has nothing to name.
      expect(
        await call<DeletedScene>("ppal-delete", { type: "scene", id: copy.id }),
      ).toStrictEqual({ id: copy.id, deletedPath: "s1" });
      expect(await sceneCount()).toBe(8);
    });

    it("leaves an empty scene's delete as it was", async () => {
      const copy = await call<CopiedScene>("ppal-duplicate", {
        type: "scene",
        path: "s7",
      });

      expect(copy).toStrictEqual({ id: copy.id, path: "s8", clips: [] });
      expect(
        await call<DeletedScene>("ppal-delete", { type: "scene", id: copy.id }),
      ).toStrictEqual({ id: copy.id, deletedPath: "s8" });
      expect(await sceneCount()).toBe(8);
    });

    it("gives each scene of one delete the clips it held, at the paths it had", async () => {
      const full = await call<CopiedScene>("ppal-duplicate", {
        type: "scene",
        path: "s0",
      });
      const notes = await call<CopiedScene>("ppal-duplicate", {
        type: "scene",
        path: "s2",
      });

      expect(notes.path).toBe("s3");

      const deleted = await call<DeletedScene[]>("ppal-delete", {
        type: "scene",
        id: `${full.id},${notes.id}`,
      });

      expect(deleted).toStrictEqual([
        { id: full.id, deletedPath: "s1", detail: FULL_SCENE_DETAIL },
        {
          id: notes.id,
          deletedPath: "s3",
          detail: 'also deleted the clip in this scene: t0/s3 "Notes"',
        },
      ]);
      expect(await sceneCount()).toBe(8);
    });
  },
);
