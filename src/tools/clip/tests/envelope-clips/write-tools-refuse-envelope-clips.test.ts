// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Until each write tool learns to act on return-track clips, every one refuses
// them, by path and by id, before writing anything.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { playback } from "#src/tools/session/playback.ts";
import { select } from "#src/tools/session/select.ts";
import {
  type EnvelopeWorld,
  registerEnvelopeWorld,
  registerRegularClip,
  writesToReturns,
} from "./envelope-clip-test-helpers.ts";

const REFUSED = "return-track clips can't be changed yet";
const NEEDS_13 = "return-track clips need Live 13";

describe("write tools - Live 13 return-track clips", () => {
  let world: EnvelopeWorld;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    world = registerEnvelopeWorld();
  });

  describe("update-clip", () => {
    it.each([
      ["path", { path: "rt0/s0" }],
      ["id", { ids: "no-envs" }],
    ])("refuses a lone clip named by %s", async (_how, target) => {
      await expect(updateClip({ ...target, name: "X" })).rejects.toThrow(
        REFUSED,
      );
      expect(writesToReturns(world)).toStrictEqual([]);
    });

    it("skips only that clip in a list", async () => {
      registerRegularClip();

      const result = (await updateClip({
        ids: "regular,no-envs",
        name: "X",
      })) as unknown as Array<Record<string, unknown>>;

      expect(result).toStrictEqual([
        expect.objectContaining({ id: "regular", path: "t0/s0" }),
        expect.objectContaining({ id: "no-envs", ok: false, detail: REFUSED }),
      ]);
      expect(writesToReturns(world)).toStrictEqual([]);
    });

    it("skips a move to a return-track slot, and says why", async () => {
      registerRegularClip();

      await expect(
        updateClip({ ids: "regular", toPath: "rt0/s1" }),
      ).rejects.toThrow(REFUSED);
      expect(writesToReturns(world)).toStrictEqual([]);
    });
  });

  describe("delete", () => {
    it.each([
      ["path", { path: "rt0/s0" }],
      ["id", { ids: "no-envs" }],
    ])("refuses a lone clip named by %s", (_how, target) => {
      expect(() => deleteObject({ type: "clip", ...target })).toThrow(REFUSED);
      expect(writesToReturns(world)).toStrictEqual([]);
    });

    it("skips only that clip in a list", () => {
      registerRegularClip();

      const result = deleteObject({
        type: "clip",
        ids: "no-envs,with-env",
      }) as Array<Record<string, unknown>>;

      expect(result).toStrictEqual([
        expect.objectContaining({ ok: false, detail: REFUSED }),
        expect.objectContaining({ ok: false, detail: REFUSED }),
      ]);
      expect(writesToReturns(world)).toStrictEqual([]);
    });
  });

  describe("duplicate", () => {
    it.each([
      ["path", { path: "rt0/s0" }],
      ["id", { id: "no-envs" }],
    ])(
      "refuses an envelope clip as the source, named by %s",
      async (_how, target) => {
        await expect(
          duplicate({ type: "clip", ...target, toPath: "t0/s2" }),
        ).rejects.toThrow(REFUSED);
        expect(writesToReturns(world)).toStrictEqual([]);
      },
    );

    it("refuses a return-track slot as the destination", async () => {
      registerRegularClip();

      await expect(
        duplicate({ type: "clip", id: "regular", toPath: "rt0/s1" }),
      ).rejects.toThrow(REFUSED);
      expect(writesToReturns(world)).toStrictEqual([]);
    });
  });

  describe("playback", () => {
    it.each([
      ["path", { path: "rt0/s0" }],
      ["id", { id: "no-envs" }],
    ])("refuses to launch a clip named by %s", (_how, target) => {
      expect(() =>
        playback({ action: "play-session-clips", ...target }),
      ).toThrow(REFUSED);
      expect(writesToReturns(world)).toStrictEqual([]);
    });

    it("refuses to stop one, and to play its scene by path", () => {
      expect(() =>
        playback({ action: "stop-session-clips", path: "rt1/s0" }),
      ).toThrow(REFUSED);
      expect(() => playback({ action: "play-scene", path: "rt1/s0" })).toThrow(
        REFUSED,
      );
      expect(writesToReturns(world)).toStrictEqual([]);
    });

    it("skips only that slot beside a regular one", () => {
      registerRegularClip();

      const result = playback({
        action: "play-session-clips",
        path: "t0/s0,rt0/s0",
      });

      expect(result.clip).toStrictEqual([
        expect.objectContaining({ path: "t0/s0" }),
        expect.objectContaining({ path: "rt0/s0", ok: false, detail: REFUSED }),
      ]);
      expect(writesToReturns(world)).toStrictEqual([]);
    });
  });

  describe("select", () => {
    it.each([
      ["path", { path: "rt0/s0" }],
      ["id", { id: "no-envs" }],
    ])("refuses a clip named by %s", (_how, target) => {
      expect(() => select(target)).toThrow(REFUSED);
      expect(writesToReturns(world)).toStrictEqual([]);
    });
  });

  describe("create-clip", () => {
    it("never creates an envelope clip", async () => {
      await expect(createClip({ path: "rt0/s1" })).rejects.toThrow(
        "envelope clips can't be created; make one in Live",
      );
      expect(writesToReturns(world)).toStrictEqual([]);
    });
  });

  it("refuses a return-track slot path on Live 12 for the Live 13 reason", async () => {
    clearMockRegistry();
    world = registerEnvelopeWorld("12.4.15");

    await expect(updateClip({ path: "rt0/s0", name: "X" })).rejects.toThrow(
      NEEDS_13,
    );
    expect(() => deleteObject({ type: "clip", path: "rt0/s0" })).toThrow(
      NEEDS_13,
    );
    expect(() =>
      playback({ action: "play-session-clips", path: "rt0/s0" }),
    ).toThrow(NEEDS_13);
    expect(() => select({ path: "rt0/s0" })).toThrow(NEEDS_13);
    await expect(createClip({ path: "rt0/s1" })).rejects.toThrow(NEEDS_13);
    expect(writesToReturns(world)).toStrictEqual([]);
  });
});
