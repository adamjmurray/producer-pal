// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "../live-api-path-builders.ts";

describe("livePath", () => {
  describe("track", () => {
    it("produces track path string", () => {
      expect(String(livePath.track(0))).toBe("live_set tracks 0");
      expect(String(livePath.track(5))).toBe("live_set tracks 5");
    });

    it("chains device", () => {
      expect(String(livePath.track(0).device(1))).toBe(
        "live_set tracks 0 devices 1",
      );
    });

    it("chains clipSlot", () => {
      expect(String(livePath.track(2).clipSlot(3))).toBe(
        "live_set tracks 2 clip_slots 3",
      );
    });

    it("chains clipSlot then clip", () => {
      expect(livePath.track(0).clipSlot(2).clip()).toBe(
        "live_set tracks 0 clip_slots 2 clip",
      );
    });

    it("chains arrangementClip", () => {
      expect(livePath.track(1).arrangementClip(0)).toBe(
        "live_set tracks 1 arrangement_clips 0",
      );
    });

    it("chains mixerDevice", () => {
      expect(livePath.track(0).mixerDevice()).toBe(
        "live_set tracks 0 mixer_device",
      );
    });
  });

  describe("returnTrack", () => {
    it("produces return track path string", () => {
      expect(String(livePath.returnTrack(0))).toBe("live_set return_tracks 0");
      expect(String(livePath.returnTrack(3))).toBe("live_set return_tracks 3");
    });

    it("chains device", () => {
      expect(String(livePath.returnTrack(1).device(0))).toBe(
        "live_set return_tracks 1 devices 0",
      );
    });

    it("chains mixerDevice", () => {
      expect(livePath.returnTrack(0).mixerDevice()).toBe(
        "live_set return_tracks 0 mixer_device",
      );
    });

    it("chains clipSlot", () => {
      expect(String(livePath.returnTrack(0).clipSlot(1))).toBe(
        "live_set return_tracks 0 clip_slots 1",
      );
    });

    it("chains arrangementClip", () => {
      expect(livePath.returnTrack(0).arrangementClip(2)).toBe(
        "live_set return_tracks 0 arrangement_clips 2",
      );
    });
  });

  describe("masterTrack", () => {
    it("produces master track path string", () => {
      expect(String(livePath.masterTrack())).toBe("live_set master_track");
    });

    it("chains device", () => {
      expect(String(livePath.masterTrack().device(0))).toBe(
        "live_set master_track devices 0",
      );
    });

    it("chains mixerDevice", () => {
      expect(livePath.masterTrack().mixerDevice()).toBe(
        "live_set master_track mixer_device",
      );
    });
  });

  describe("scene", () => {
    it("produces scene path string", () => {
      expect(livePath.scene(0)).toBe("live_set scenes 0");
      expect(livePath.scene(7)).toBe("live_set scenes 7");
    });
  });

  describe("cuePoint", () => {
    it("produces cue point path string", () => {
      expect(livePath.cuePoint(0)).toBe("live_set cue_points 0");
      expect(livePath.cuePoint(3)).toBe("live_set cue_points 3");
    });
  });

  describe("liveSet", () => {
    it("is the root path constant", () => {
      expect(livePath.liveSet).toBe("live_set");
    });
  });

  describe("view", () => {
    it("has song view path", () => {
      expect(livePath.view.song).toBe("live_set view");
    });

    it("has app view path", () => {
      expect(livePath.view.app).toBe("live_app view");
    });

    it("has selectedTrack path", () => {
      expect(livePath.view.selectedTrack).toBe("live_set view selected_track");
    });

    it("has selectedScene path", () => {
      expect(livePath.view.selectedScene).toBe("live_set view selected_scene");
    });

    it("has detailClip path", () => {
      expect(livePath.view.detailClip).toBe("live_set view detail_clip");
    });

    it("has highlightedClipSlot path", () => {
      expect(livePath.view.highlightedClipSlot).toBe(
        "live_set view highlighted_clip_slot",
      );
    });
  });

  describe("device chaining", () => {
    it("chains parameter", () => {
      expect(livePath.track(0).device(0).parameter(1)).toBe(
        "live_set tracks 0 devices 0 parameters 1",
      );
    });

    it("chains chain", () => {
      expect(String(livePath.track(0).device(0).chain(1))).toBe(
        "live_set tracks 0 devices 0 chains 1",
      );
    });

    it("chains returnChain", () => {
      expect(String(livePath.track(0).device(0).returnChain(0))).toBe(
        "live_set tracks 0 devices 0 return_chains 0",
      );
    });

    it("chains drumPad", () => {
      expect(livePath.track(0).device(0).drumPad(36)).toBe(
        "live_set tracks 0 devices 0 drum_pads 36",
      );
    });

    it("chains chain then device for deep nesting", () => {
      expect(String(livePath.track(0).device(0).chain(0).device(1))).toBe(
        "live_set tracks 0 devices 0 chains 0 devices 1",
      );
    });

    it("supports arbitrary nesting depth", () => {
      const path = livePath
        .track(0)
        .device(0)
        .chain(0)
        .device(1)
        .chain(0)
        .device(0);

      expect(String(path)).toBe(
        "live_set tracks 0 devices 0 chains 0 devices 1 chains 0 devices 0",
      );
    });

    it("chains parameter from deeply nested device", () => {
      expect(livePath.track(0).device(0).chain(0).device(1).parameter(3)).toBe(
        "live_set tracks 0 devices 0 chains 0 devices 1 parameters 3",
      );
    });

    it("chains return chain then device", () => {
      expect(String(livePath.track(1).device(0).returnChain(0).device(1))).toBe(
        "live_set tracks 1 devices 0 return_chains 0 devices 1",
      );
    });
  });

  describe("toString coercion", () => {
    it("coerces TrackPath via String()", () => {
      expect(String(livePath.track(0))).toBe("live_set tracks 0");
    });

    it("coerces DevicePath via String()", () => {
      expect(String(livePath.track(0).device(1))).toBe(
        "live_set tracks 0 devices 1",
      );
    });

    it("coerces ClipSlotPath via String()", () => {
      expect(String(livePath.track(0).clipSlot(2))).toBe(
        "live_set tracks 0 clip_slots 2",
      );
    });

    it("coerces ChainPath via String()", () => {
      expect(String(livePath.track(0).device(0).chain(1))).toBe(
        "live_set tracks 0 devices 0 chains 1",
      );
    });
  });
});
