// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../create-clip.ts";
import {
  expectClipCreated,
  expectNotesAdded,
  note,
  setupArrangementClipMocks,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

describe("createClip - advanced features", () => {
  it("should set time signature when provided", async () => {
    const { clip } = setupSessionMocks({
      liveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      timeSignature: "6/8",
    });

    expect(clip.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(clip.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
    });
  });

  it("should calculate correct clip length based on note start position", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "t2 C3 1|1 t3 D3 1|3", // Last note starts at beat 2 (0-based), rounds up to 1 bar = 4 beats
    });

    expectClipCreated(clipSlot, 4);
  });

  it("should return single object for single position and array for multiple positions", async () => {
    setupSessionMocks({
      liveSet: { signature_numerator: 4 },
    });
    registerMockObject("live_set/tracks/0/clip_slots/1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 0 },
    });
    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("live_set/tracks/0/clip_slots/2", {
      path: livePath.track(0).clipSlot(2),
      properties: { has_clip: 0 },
    });
    registerMockObject("live_set/tracks/0/clip_slots/2/clip", {
      path: livePath.track(0).clipSlot(2).clip(),
    });

    const singleResult = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      name: "Single",
    });

    const arrayResult = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "1,2",
      name: "Multiple",
    });

    expect(singleResult).toMatchObject({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 0,
    });
    expect((singleResult as { length?: unknown }).length).toBeUndefined();

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect((arrayResult as object[])[0]).toStrictEqual({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 1,
    });
    expect((arrayResult as object[])[1]).toStrictEqual({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 2,
    });
  });

  it("should filter out v0 notes when creating clips", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "v100 C3 v0 D3 v80 E3 1|1", // D3 should be filtered out
    });

    expectNotesAdded(clip, [note(60, 0, 1), note(64, 0, 1, 80)]);

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 2,
      length: "1:0",
    }); // C3 and E3, D3 filtered out
  });

  it("should handle clips with all v0 notes filtered out", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "v0 C3 D3 E3 1|1", // All notes should be filtered out
    });

    expect(clip.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should set start and firstStart when provided", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      name: "Test Clip",
      notes: "C3 D3",
      start: "1|3",
      firstStart: "1|2",
    });

    // start "1|3" converts to 2 beats (bar 1, beat 3)
    expect(clip.set).toHaveBeenCalledWith("start_marker", 2);
    expect(clip.set).toHaveBeenCalledWith("loop_start", 2);
  });

  describe("switchView functionality", () => {
    it("should switch to session view when creating session clips with switchView=true", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });
      const appView = registerMockObject("app-view", {
        path: "live_app view",
      });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/0/clip",
        trackIndex: 0,
        sceneIndex: 0,
      });
    });

    it("should switch to arrangement view when creating arrangement clips with switchView=true", async () => {
      setupArrangementClipMocks();
      const appView = registerMockObject("app-view", {
        path: "live_app view",
      });

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1",
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
      expect(result).toStrictEqual({
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "1|1",
      });
    });

    it("should not switch views when switchView=false", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });
      const appView = registerMockObject("app-view", {
        path: "live_app view",
      });

      await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        switchView: false,
      });

      expect(appView.call).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });

    it("should work with multiple clips when switchView=true", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });
      registerMockObject("live_set/tracks/0/clip_slots/1", {
        path: livePath.track(0).clipSlot(1),
        properties: { has_clip: 0 },
      });
      registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
        path: livePath.track(0).clipSlot(1).clip(),
      });
      const appView = registerMockObject("app-view", {
        path: "live_app view",
      });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0,1",
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });
});
