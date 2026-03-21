// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  registerArrangementClip,
  registerMockObject,
  registerSessionClipDuplication,
  registerTrackWithArrangementDup,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - clip duplication", () => {
  it("should throw an error when clip has no position params", () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });
    expect(() => duplicate({ type: "clip", id: "clip1" })).toThrow(
      "duplicate failed: clip requires toSlot (for session) or arrangementStart/locator (for arrangement)",
    );
  });

  describe("session destination", () => {
    it("should duplicate a single clip to the session view", () => {
      const { sourceClipSlot } = registerSessionClipDuplication({
        destClipProperties: {},
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",

        toSlot: "0/1",
      });

      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );

      expect(result).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/1/clip",
        slot: "0/1",
      });
    });

    it("should duplicate multiple clips to session view with comma-separated toSceneIndex", () => {
      const { sourceClipSlot } = registerSessionClipDuplication();

      registerMockObject("live_set/tracks/0/clip_slots/2", {
        path: livePath.track(0).clipSlot(2),
        properties: { has_clip: 0 },
      });

      const destClip1 = registerMockObject(
        "live_set/tracks/0/clip_slots/1/clip",
        {
          path: livePath.track(0).clipSlot(1).clip(),
        },
      );

      const destClip2 = registerMockObject(
        "live_set/tracks/0/clip_slots/2/clip",
        {
          path: livePath.track(0).clipSlot(2).clip(),
        },
      );

      const result = duplicate({
        type: "clip",
        id: "clip1",

        name: "Custom Clip",
        toSlot: "0/1, 0/2",
      });

      expect(result).toStrictEqual([
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          slot: "0/1",
        },
        {
          id: "live_set/tracks/0/clip_slots/2/clip",
          slot: "0/2",
        },
      ]);

      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );
      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/2",
      );

      expect(destClip1.set).toHaveBeenCalledWith("name", "Custom Clip");
      expect(destClip2.set).toHaveBeenCalledWith("name", "Custom Clip");
    });

    it("should throw an error when trying to duplicate an arrangement clip to session", () => {
      registerMockObject("arrangementClip1", {
        path: livePath.track(0).arrangementClip(0),
      });

      expect(() =>
        duplicate({
          type: "clip",
          id: "arrangementClip1",

          toSlot: "1/2",
        }),
      ).toThrow(
        'unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="arrangementClip1" path="live_set tracks 0 arrangement_clips 0") ',
      );
    });
  });

  describe("arrangement destination", () => {
    it("should duplicate a single clip to the arrangement view", () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 8);

      const result = duplicate({
        type: "clip",
        id: "clip1",

        arrangementStart: "3|1",
      });

      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toStrictEqual({
        id: livePath.track(0).arrangementClip(0),
        trackIndex: 0,
        arrangementStart: "3|1",
      });
    });

    it("should duplicate multiple clips to arrangement view with comma-separated positions", () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 8);
      registerArrangementClip(0, 1, 12);
      registerArrangementClip(0, 2, 16);

      const result = duplicate({
        type: "clip",
        id: "clip1",

        arrangementStart: "3|1,4|1,5|1",
        name: "Custom Clip",
      });

      expect(result).toStrictEqual([
        {
          id: livePath.track(0).arrangementClip(0),
          trackIndex: 0,
          arrangementStart: "3|1",
        },
        {
          id: livePath.track(0).arrangementClip(1),
          trackIndex: 0,
          arrangementStart: "4|1",
        },
        {
          id: livePath.track(0).arrangementClip(2),
          trackIndex: 0,
          arrangementStart: "5|1",
        },
      ]);

      // Clips should be placed at explicit positions
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        12,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );
      expect(track0.call).toHaveBeenCalledTimes(3); // 3 duplicates
    });
  });
});
