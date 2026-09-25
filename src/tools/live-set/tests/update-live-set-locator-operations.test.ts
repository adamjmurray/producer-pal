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

    describe("where a locator already is", () => {
      let existing: RegisteredMockObject | undefined;

      beforeEach(() => {
        existing = setupLocatorMocks(liveSet, {
          cuePoints: [{ id: "26", time: 16, name: "Existing" }],
        }).get("26");
      });

      it.each([
        ["no name", {}],
        ["the name it already has", { locatorName: "Existing" }],
      ])("does nothing when sent %s", async (_label, args) => {
        const result = await updateLiveSet({
          locatorOperation: "create",
          locatorTime: "5|1",
          ...args,
        });

        // A toggle there would delete the existing locator.
        expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
        expect(existing?.set).not.toHaveBeenCalled();
        expect(result.locator).toStrictEqual({
          operation: "create",
          id: "26",
          detail: "a locator is already at 5|1",
        });
        expect(capturedWarnings()).toStrictEqual([]);
      });

      it("refuses a different name, and never renames the one there", async () => {
        await expect(
          updateLiveSet({
            locatorOperation: "create",
            locatorTime: "5|1",
            locatorName: "New Locator",
          }),
        ).rejects.toThrow(
          "not created: a locator is already at 5|1; rename it instead",
        );

        expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
        expect(existing?.set).not.toHaveBeenCalled();
      });

      it("reports the refusal on its entry when the call also set tempo", async () => {
        const result = await updateLiveSet({
          tempo: 140,
          locatorOperation: "create",
          locatorTime: "5|1",
          locatorName: "New Locator",
        });

        expect(liveSet.set).toHaveBeenCalledWith("tempo", 140);
        expect(existing?.set).not.toHaveBeenCalled();
        expect(result.locator).toStrictEqual({
          operation: "skipped",
          time: "5|1",
          name: "New Locator",
          ok: false,
          detail: "not created: a locator is already at 5|1; rename it instead",
        });
      });
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

    it("does nothing for a locator ID that isn't there", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "99",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "delete",
        detail: 'nothing to delete: no locator with id "99"',
        id: "99",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("does nothing where no locator is", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "100|1",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "delete",
        detail: "nothing to delete: no locator at 100|1",
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

      await expect(
        updateLiveSet({ locatorOperation: "delete", locatorName: "" }),
      ).rejects.toThrow("locatorName must not be empty");
      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
    });

    it("does nothing when no locator has the name", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "NonExistent",
      });

      expect(liveSet.call).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "delete",
        detail: 'nothing to delete: no locator named "NonExistent"',
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

    it("should rename locator by time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorTime: "5|1",
        locatorName: "New Verse",
      });

      expect(cues.get("27")?.set).toHaveBeenCalledWith("name", "New Verse");
      expect(result.locator).toStrictEqual({ operation: "rename", id: "27" });
    });

    it.each([
      [{ locatorId: "99" }, 'no locator with id "99"'],
      [{ locatorTime: "100|1" }, "no locator at 100|1"],
    ])(
      "refuses a lone rename of %o that finds nothing",
      async (args, message) => {
        await expect(
          updateLiveSet({
            locatorOperation: "rename",
            locatorName: "New Name",
            ...args,
          }),
        ).rejects.toThrow(message);
      },
    );

    it("reports a rename that finds nothing on its entry beside a tempo change", async () => {
      const result = await updateLiveSet({
        tempo: 140,
        locatorOperation: "rename",
        locatorId: "99",
        locatorName: "New Name",
      });

      expect(liveSet.set).toHaveBeenCalledWith("tempo", 140);
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        ok: false,
        detail: 'no locator with id "99"',
        id: "99",
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
  describe("locator operation missing what it needs", () => {
    it.each([
      [{ locatorOperation: "create" }, "locatorTime is required for create"],
      [
        { locatorOperation: "create", locatorName: "A" },
        "locatorTime is required for create",
      ],
      [
        { locatorOperation: "rename", locatorId: "26" },
        "locatorName is required for rename",
      ],
      [
        { locatorOperation: "rename", locatorId: "26,27" },
        "locatorName is required for rename",
      ],
      [
        { locatorOperation: "rename", locatorName: "New Name" },
        "locatorId or locatorTime is required for rename",
      ],
      [
        { locatorOperation: "delete" },
        "locatorId, locatorTime, or locatorName is required for delete",
      ],
      [
        { locatorOperation: "delete", locatorName: "  " },
        "locatorName must not be empty",
      ],
      [
        { locatorOperation: "create", locatorTime: "" },
        "locatorTime must not be empty",
      ],
    ])("refuses %o before writing anything", async (args, message) => {
      setupLocatorMocks(liveSet, {
        cuePoints: [
          { id: "26", time: 0 },
          { id: "27", time: 16 },
        ],
      });

      await expect(
        updateLiveSet({
          tempo: 140,
          timeSignature: "3/4",
          scale: "C Major",
          ...args,
        }),
      ).rejects.toThrow(message);

      expect(liveSet.set).not.toHaveBeenCalled();
      expect(liveSet.call).not.toHaveBeenCalled();
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
