// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import {
  setupLocatorCreationMocks,
  setupLocatorMocks,
} from "./update-live-set-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateLiveSet - locator operations", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  describe("create locator", () => {
    it("should create locator at specified position", async () => {
      const { newCue } = setupLocatorCreationMocks(liveSet, { time: 0 }); // 1|1 = 0 beats

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1",
      });

      expect(liveSet.set).toHaveBeenCalledWith("current_song_time", 0);
      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      // No name provided → the name is not set (guard is `found && name != null`).
      expect(newCue.set.mock.calls.filter((c) => c[0] === "name")).toHaveLength(
        0,
      );
      expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    });

    it("should create locator with name", async () => {
      const { newCue } = setupLocatorCreationMocks(liveSet, { time: 16 }); // 5|1 = 16 beats

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "5|1",
        locatorName: "Verse",
      });

      expect(liveSet.set).toHaveBeenCalledWith("current_song_time", 16);
      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      expect(newCue.set).toHaveBeenCalledWith("name", "Verse");
      expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    });

    it("should stop playback before creating locator", async () => {
      setupLocatorCreationMocks(liveSet, { isPlaying: 1 });

      await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1",
      });

      expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
    });

    it("should skip creation if locator already exists at position", async () => {
      setupLocatorMocks(liveSet, {
        cuePoints: [{ id: "26", time: 16, name: "Existing" }],
      });

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "5|1",
        locatorName: "New Locator",
      });

      // Should NOT call set_or_delete_cue (would delete existing locator)
      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      // The locator asked for is already there, so the create needed no work:
      // the entry says why and carries no `ok`.
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "a locator is already at 5|1",
        time: "5|1",
        existingId: "26",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should skip if locatorTime is missing for create", async () => {
      const result = await updateLiveSet({
        locatorOperation: "create",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        reason: "create needs locatorTime",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });

  describe("delete locator", () => {
    beforeEach(() => {
      setupLocatorMocks(liveSet, {
        cuePoints: [
          { id: "26", time: 0, name: "Intro" },
          { id: "27", time: 16, name: "Verse" },
        ],
      });
    });

    it("should delete locator by ID", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "26",
      });

      expect(liveSet.set).toHaveBeenCalledWith("current_song_time", 0);
      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({ operation: "delete", id: "26" });
    });

    it("names the locator it deleted at a time by its ID", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "5|1",
      });

      expect(liveSet.set).toHaveBeenCalledWith("current_song_time", 16);
      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({ operation: "delete", id: "27" });
    });

    it("should delete all locators by name", async () => {
      setupLocatorMocks(liveSet, {
        cuePoints: [
          { id: "26", time: 0, name: "Verse" },
          { id: "27", time: 16, name: "Chorus" },
          { id: "28", time: 32, name: "Verse" },
        ],
      });

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "Verse",
      });

      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      // Deletes run in reverse time order (32 before 0) so earlier indices
      // don't shift out from under later deletes.
      const cueTimeSets = liveSet.set.mock.calls
        .filter((c) => c[0] === "current_song_time")
        .map((c) => c[1]);

      expect(cueTimeSets).toStrictEqual([32, 0]);
      expect(result.locator).toStrictEqual({
        operation: "delete",
        count: 2,
        name: "Verse",
      });
    });

    it("deletes a locator by an all-digit name", async () => {
      // The match must still find it by its string name.
      setupLocatorMocks(liveSet, {
        cuePoints: [{ id: "26", time: 0, name: 5678 }],
      });

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "5678",
      });

      expect(liveSet.call).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "delete",
        count: 1,
        name: "5678",
      });
    });

    it("prefers locatorId over locatorName when both are given", async () => {
      // The name-delete branch requires BOTH id and time to be null; with an id
      // present we delete that single locator, never every cue sharing the name.
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "26",
        locatorName: "Verse", // the second locator is "Verse" — must be ignored
      });

      expect(result.locator).toStrictEqual({ operation: "delete", id: "26" });
    });

    it("prefers locatorTime over locatorName when both are given", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "5|1", // 16 beats → the second locator
        locatorName: "Intro", // must be ignored
      });

      expect(result.locator).toStrictEqual({ operation: "delete", id: "27" });
    });

    it("should skip if no identifier provided for delete", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        reason: "delete needs locatorId, locatorTime, or locatorName",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should skip if locator ID not found", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "99",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: 'nothing to delete: no locator with id "99"',
        id: "99",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should skip if no locator at specified time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "100|1",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "nothing to delete: no locator at 100|1",
        time: "100|1",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("does not delete every nameless locator when locatorName is empty", async () => {
      // A nameless locator reads back "" — an empty locatorName must not
      // match it (or any other nameless locator), or delete-by-name would
      // wipe every unnamed locator in the Set.
      setupLocatorMocks(liveSet, {
        cuePoints: [
          { id: "26", time: 0 },
          { id: "27", time: 16 },
        ],
      });

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: 'nothing to delete: no locator named ""',
        name: "",
      });
    });

    it("should skip if no locators match name", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "NonExistent",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: 'nothing to delete: no locator named "NonExistent"',
        name: "NonExistent",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });

  describe("rename locator", () => {
    let cues: Map<string, RegisteredMockObject>;

    beforeEach(() => {
      cues = setupLocatorMocks(liveSet, {
        cuePoints: [
          { id: "26", time: 0 },
          { id: "27", time: 16 },
        ],
      });
    });

    it("should rename locator by ID", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorName: "New Intro",
      });

      expect(cues.get("26")?.set).toHaveBeenCalledWith("name", "New Intro");
      expect(result.locator).toStrictEqual({ operation: "rename", id: "26" });
    });

    it("renames by ID and says a new locatorTime can't move it", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorTime: "9|1",
        locatorName: "New Intro",
      });

      expect(cues.get("26")?.set).toHaveBeenCalledWith("name", "New Intro");
      expect(result.locator).toStrictEqual({
        operation: "rename",
        id: "26",
        reason:
          "locatorTime 9|1 ignored: a locator can't be moved; delete it and create one at the new time",
      });
    });

    it("says nothing when locatorTime is the ID's own time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorTime: "1|1",
        locatorName: "New Intro",
      });

      expect(result.locator).toStrictEqual({ operation: "rename", id: "26" });
    });

    it("notes an unreadable locatorTime sent with an ID", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorTime: "later",
        locatorName: "New Intro",
      });

      expect(result.locator).toStrictEqual({
        operation: "rename",
        id: "26",
        reason: expect.stringContaining("locatorTime later ignored"),
      });
    });

    it("should rename locator by time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorTime: "5|1",
        locatorName: "New Verse",
      });

      expect(cues.get("27")?.set).toHaveBeenCalledWith("name", "New Verse");
      expect(result.locator).toStrictEqual({ operation: "rename", id: "27" });
    });

    it("should skip if locatorName is missing for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        reason: "rename needs locatorName",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should skip if no identifier provided for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorName: "New Name",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        reason: "rename needs locatorId or locatorTime",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should skip if locator ID not found for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "99",
        locatorName: "New Name",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        reason: 'no locator with id "99"',
        id: "99",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should skip if no locator found at specified time for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorTime: "100|1",
        locatorName: "New Name",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        reason: "no locator at 100|1",
        time: "100|1",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });

  describe("combined with other operations", () => {
    it("should allow locator operation with tempo change", async () => {
      setupLocatorCreationMocks(liveSet, { time: 0 });

      const result = await updateLiveSet({
        tempo: 140,
        locatorOperation: "create",
        locatorTime: "1|1",
      });

      expect(liveSet.set).toHaveBeenCalledWith("tempo", 140);
      expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    });
  });
  describe("locator args without an operation", () => {
    it.each([
      ["locatorTime", { locatorTime: "45|1" }],
      ["locatorName", { locatorName: "Chorus" }],
      ["locatorId", { locatorId: "26" }],
    ])("refuses a call sending only %s", async (param, args) => {
      await expect(updateLiveSet(args)).rejects.toThrow(
        `${param} require locatorOperation`,
      );
    });

    it("names every locator arg it was sent", async () => {
      await expect(
        updateLiveSet({ locatorTime: "45|1", locatorName: "Chorus" }),
      ).rejects.toThrow(
        'locatorTime, locatorName require locatorOperation ("create", "delete", or "rename")',
      );
    });

    it("refuses before writing anything else the call asked for", async () => {
      await expect(
        updateLiveSet({ tempo: 140, locatorTime: "45|1" }),
      ).rejects.toThrow("locatorTime require locatorOperation");

      expect(liveSet.set).not.toHaveBeenCalled();
    });

    it("leaves a call carrying no locator args alone", async () => {
      const result = await updateLiveSet({ tempo: 140 });

      expect(liveSet.set).toHaveBeenCalledWith("tempo", 140);
      expect(result.locator).toBeUndefined();
    });
  });
});
