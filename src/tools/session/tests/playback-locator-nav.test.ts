// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { MockSequence } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";

describe("playback locator-nav actions", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  describe("jump-to-next-cue", () => {
    it("calls jump_to_next_cue when can_jump_to_next_cue is truthy", () => {
      liveSet = setupPlaybackLiveSet({
        can_jump_to_next_cue: 1,
        current_song_time: 16,
      });

      playback({ action: "jump-to-next-cue" });

      expect(liveSet.call).toHaveBeenCalledWith("jump_to_next_cue");
    });

    it("throws when can_jump_to_next_cue is falsy (no next locator)", () => {
      liveSet = setupPlaybackLiveSet({
        can_jump_to_next_cue: 0,
        current_song_time: 0,
      });

      expect(() => playback({ action: "jump-to-next-cue" })).toThrow(
        "playback failed: no next locator available",
      );
      expect(liveSet.call).not.toHaveBeenCalledWith("jump_to_next_cue");
    });

    it("updates currentTime in result from re-read current_song_time", () => {
      // MockSequence: first get returns 0 (pre-jump), second returns 16 (post-jump)
      liveSet = setupPlaybackLiveSet({
        can_jump_to_next_cue: 1,
        current_song_time: new MockSequence(0, 16),
        signature_numerator: 4,
        signature_denominator: 4,
      });

      const result = playback({ action: "jump-to-next-cue" });

      // 16 beats in 4/4 = bar 5, beat 1
      expect(result.currentTime).toBe("5|1");
    });
  });

  describe("jump-to-prev-cue", () => {
    it("calls jump_to_prev_cue when can_jump_to_prev_cue is truthy", () => {
      liveSet = setupPlaybackLiveSet({
        can_jump_to_prev_cue: 1,
        current_song_time: 0,
      });

      playback({ action: "jump-to-prev-cue" });

      expect(liveSet.call).toHaveBeenCalledWith("jump_to_prev_cue");
    });

    it("throws when can_jump_to_prev_cue is falsy (no previous locator)", () => {
      liveSet = setupPlaybackLiveSet({
        can_jump_to_prev_cue: 0,
        current_song_time: 0,
      });

      expect(() => playback({ action: "jump-to-prev-cue" })).toThrow(
        "playback failed: no previous locator available",
      );
      expect(liveSet.call).not.toHaveBeenCalledWith("jump_to_prev_cue");
    });

    it("updates currentTime in result from re-read current_song_time", () => {
      // MockSequence: pre-jump 16 beats, post-jump 8 beats (jumped backwards)
      liveSet = setupPlaybackLiveSet({
        can_jump_to_prev_cue: 1,
        current_song_time: new MockSequence(16, 8),
        signature_numerator: 4,
        signature_denominator: 4,
      });

      const result = playback({ action: "jump-to-prev-cue" });

      // 8 beats in 4/4 = bar 3, beat 1
      expect(result.currentTime).toBe("3|1");
    });

    it("preserves is_playing state across jump", () => {
      liveSet = setupPlaybackLiveSet({
        is_playing: 1,
        can_jump_to_prev_cue: 1,
        current_song_time: 0,
      });

      const result = playback({ action: "jump-to-prev-cue" });

      expect(result.playing).toBe(true);
    });
  });

  describe("set-or-delete-cue", () => {
    it("always calls set_or_delete_cue without pre-check", () => {
      // No can_jump_* properties set — defaults from registry are 0
      liveSet = setupPlaybackLiveSet({
        current_song_time: 8,
      });

      playback({ action: "set-or-delete-cue" });

      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
    });

    it("works while transport is playing with existing cue points", () => {
      liveSet = setupPlaybackLiveSet({
        is_playing: 1,
        current_song_time: 8,
        can_jump_to_next_cue: 1,
        can_jump_to_prev_cue: 1,
      });

      const result = playback({ action: "set-or-delete-cue" });

      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.playing).toBe(true);
    });
  });
});
