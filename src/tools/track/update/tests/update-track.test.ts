// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MONITORING_STATE } from "#src/tools/constants.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateTrack", () => {
  let track123: RegisteredMockObject;
  let track456: RegisteredMockObject;
  let track789: RegisteredMockObject;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: livePath.track(0) });
    track456 = registerMockObject("456", { path: livePath.track(1) });
    track789 = registerMockObject("789", { path: livePath.track(2) });
  });

  it("should update a single track by ID", () => {
    const result = updateTrack({
      id: "123",
      name: "Updated Track",
      color: "#FF0000",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Updated Track");
    expect(track123.set).toHaveBeenCalledWith("color", 16711680);
    expect(track123.set).toHaveBeenCalledWith("mute", true);
    expect(track123.set).toHaveBeenCalledWith("solo", false);
    expect(track123.set).toHaveBeenCalledWith("arm", true);
    expect(result).toStrictEqual({ id: "123", path: "t0" });
  });

  it("should update multiple tracks by comma-separated IDs", () => {
    const result = updateTrack({
      id: "123, 456",
      color: "#00FF00",
      mute: true,
    });

    expect(track123.set).toHaveBeenCalledWith("color", 65280);
    expect(track123.set).toHaveBeenCalledWith("mute", true);
    expect(track123.set).toHaveBeenCalledTimes(2);
    expect(track456.set).toHaveBeenCalledTimes(2);

    expect(result).toStrictEqual([
      { id: "123", path: "t0" },
      { id: "456", path: "t1" },
    ]);
  });

  it("should handle 'id ' prefixed track IDs", () => {
    const result = updateTrack({
      id: "id 123",
      name: "Prefixed ID Track",
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Prefixed ID Track");
    expect(result).toStrictEqual({ id: "123", path: "t0" });
  });

  it("should not update properties when not provided", () => {
    const result = updateTrack({
      id: "123",
      name: "Only Name Update",
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Only Name Update");
    expect(track123.set).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ id: "123", path: "t0" });
  });

  it("should handle boolean false values correctly", () => {
    const result = updateTrack({
      id: "123",
      mute: false,
      solo: false,
      arm: false,
    });

    expect(track123.set).toHaveBeenCalledWith("mute", false);
    expect(track123.set).toHaveBeenCalledWith("solo", false);
    expect(track123.set).toHaveBeenCalledWith("arm", false);
    expect(result).toStrictEqual({ id: "123", path: "t0" });
  });

  it("should refuse the call when id is missing", () => {
    expect(() => updateTrack({})).toThrow("id or path is required");
    expect(() => updateTrack({ name: "Test" })).toThrow(
      "id or path is required",
    );
  });

  // A permanent alias, not a migration: models reach for the plural on their
  // own, so it keeps working.
  it("still updates by the ids alias", () => {
    expect(updateTrack({ ids: "123", name: "Renamed" })).toStrictEqual({
      id: "123",
      path: "t0",
    });
    expect(track123.set).toHaveBeenCalledWith("name", "Renamed");
  });

  it("throws when the one track ID it was given doesn't exist", () => {
    mockNonExistentObjects();

    expect(() => updateTrack({ id: "nonexistent" })).toThrow(
      'id "nonexistent" does not exist',
    );
  });

  it("reports a dead id in its own slot and updates the rest", () => {
    mockNonExistentObjects();

    const result = updateTrack({ id: "123, nonexistent", name: "Test" });

    expect(result).toStrictEqual([
      { id: "123", path: "t0" },
      {
        id: "nonexistent",
        ok: false,
        reason: 'id "nonexistent" does not exist',
      },
    ]);
    // The entry carries it, so the response doesn't say it twice.
    expect(capturedWarnings()).toStrictEqual([]);
    expect(track123.set).toHaveBeenCalledWith("name", "Test");
  });

  it("keeps positional name/color aligned to original ids when one is skipped", () => {
    mockNonExistentObjects();

    // ids[0] is invalid and skipped, but the positional name/color lists must
    // still line up with the ORIGINAL id positions: id "123" is position 1 → B,
    // id "456" is position 2 → C. Before the fix they shifted to A/B.
    const result = updateTrack({
      id: "nonexistent,123,456",
      name: "A,B,C",
      color: "#FF0000,#00FF00,#0000FF",
    });

    expect(result).toStrictEqual([
      {
        id: "nonexistent",
        ok: false,
        reason: 'id "nonexistent" does not exist',
      },
      { id: "123", path: "t0" },
      { id: "456", path: "t1" },
    ]);
    expect(track123.set).toHaveBeenCalledWith("name", "B");
    expect(track123.set).toHaveBeenCalledWith("color", 65280); // #00FF00
    expect(track456.set).toHaveBeenCalledWith("name", "C");
    expect(track456.set).toHaveBeenCalledWith("color", 255); // #0000FF
  });

  // A trailing comma is the commonest typo in a hand-written list. Counting it
  // as an entry made it an empty name, which Live accepts, so the last track
  // lost its name without a word. It is not an entry on either side now, so the
  // two lists agree and the call goes through.
  it("does not clear a name for a trailing comma", () => {
    updateTrack({ id: "123,456", name: "A,B," });

    expect(track123.set).toHaveBeenCalledWith("name", "A");
    expect(track456.set).toHaveBeenCalledWith("name", "B");
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // Which is also why the trailing comma can't hide a real mismatch: it is
  // dropped before the counts are compared, so 3 ids against "A,B," is 3
  // against 2, and refused.
  it("refuses a trailing comma that leaves the lists uneven", () => {
    expect(() => updateTrack({ id: "123,456,789", name: "A,B," })).toThrow(
      "id names 3 entries but name names 2 entries.",
    );
  });

  // A gap in a name list used to mean "leave this one alone", while the same
  // gap in an id list was refused. One rule now: no list takes a hole.
  it("refuses an empty entry in a name list", () => {
    expect(() => updateTrack({ id: "123,456,789", name: "A,,C" })).toThrow(
      'invalid name "A,,C" - it has an empty entry',
    );
    expect(track123.set).not.toHaveBeenCalledWith("name", expect.anything());
  });

  // `name: ""` still clears the name, for every target in the call — the one
  // unambiguous spelling, now that a hole isn't one.
  it("clears every name for a blank name param", () => {
    updateTrack({ id: "123,456", name: "" });

    expect(track123.set).toHaveBeenCalledWith("name", "");
    expect(track456.set).toHaveBeenCalledWith("name", "");
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateTrack({ id: "123", name: "Single" });
    const arrayResult = updateTrack({ id: "123, 456", name: "Multiple" });

    expect(singleResult).toStrictEqual({ id: "123", path: "t0" });
    expect(arrayResult).toStrictEqual([
      { id: "123", path: "t0" },
      { id: "456", path: "t1" },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateTrack({
      id: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toStrictEqual([
      { id: "123", path: "t0" },
      { id: "456", path: "t1" },
      { id: "789", path: "t2" },
    ]);
  });

  // Refusing is atomic: nothing has been set, so the caller retries with the
  // stray comma removed and loses no work.
  it("should refuse an empty ID in a comma-separated list", () => {
    expect(() =>
      updateTrack({
        id: "123,,456,  ,789",
        name: "Filtered",
      }),
    ).toThrow('invalid id "123,,456,  ,789" - it has an empty entry.');

    expect(track123.set).not.toHaveBeenCalled();
    expect(track456.set).not.toHaveBeenCalled();
    expect(track789.set).not.toHaveBeenCalled();
  });

  describe("routing properties", () => {
    it("should update routing properties when provided", () => {
      const result = updateTrack({
        id: "123",
        inputRoutingType: "17",
        inputRoutingChannel: "1",
        outputRoutingType: "25",
        outputRoutingChannel: "26",
      });

      expect(track123.set).toHaveBeenCalledWith(
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(track123.set).toHaveBeenCalledWith(
        "input_routing_channel",
        '{"input_routing_channel":{"identifier":1}}',
      );
      expect(track123.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track123.set).toHaveBeenCalledWith(
        "output_routing_channel",
        '{"output_routing_channel":{"identifier":26}}',
      );

      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    it("should update monitoring state when provided", () => {
      const result = updateTrack({
        id: "123",
        monitoringState: MONITORING_STATE.AUTO,
      });

      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 1);

      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    it("should update monitoring state for all valid values", () => {
      // Test IN state
      updateTrack({
        id: "123",
        monitoringState: MONITORING_STATE.IN,
      });
      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 0);

      // Test OFF state
      updateTrack({
        id: "456",
        monitoringState: MONITORING_STATE.OFF,
      });
      expect(track456.set).toHaveBeenCalledWith("current_monitoring_state", 2);
    });

    it("should warn and skip for invalid monitoring state", () => {
      // Should not throw, just warn and skip the monitoring state update — and
      // crucially NOT write an undefined monitoring value onto the track.
      const result = updateTrack({
        id: "123",
        monitoringState: "invalid",
      });

      expect(track123.set).not.toHaveBeenCalledWith(
        "current_monitoring_state",
        expect.anything(),
      );
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("invalid monitoring state"),
      );
      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    it("should handle mixed routing and basic properties", () => {
      const result = updateTrack({
        id: "123",
        name: "Test Track",
        color: "#FF0000",
        mute: true,
        inputRoutingType: "17",
        monitoringState: MONITORING_STATE.IN,
      });

      expect(track123.set).toHaveBeenCalledWith("name", "Test Track");
      expect(track123.set).toHaveBeenCalledWith("color", 16711680);
      expect(track123.set).toHaveBeenCalledWith("mute", true);
      expect(track123.set).toHaveBeenCalledWith(
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 0);

      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    it("should handle routing properties in bulk operations", () => {
      const result = updateTrack({
        id: "123, 456",
        outputRoutingType: "25",
        monitoringState: MONITORING_STATE.AUTO,
      });

      expect(track123.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track456.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 1);
      expect(track456.set).toHaveBeenCalledWith("current_monitoring_state", 1);

      expect(result).toStrictEqual([
        { id: "123", path: "t0" },
        { id: "456", path: "t1" },
      ]);
    });

    it("should not update routing properties when not provided", () => {
      const result = updateTrack({
        id: "123",
        name: "Only Name Update",
      });

      // Should only have the name call, no routing calls
      expect(track123.set).toHaveBeenCalledTimes(1);
      expect(track123.set).toHaveBeenCalledWith("name", "Only Name Update");

      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    describe("type-guarded routing and monitoring", () => {
      it("warns and skips input routing on a return track but still applies output routing", () => {
        const returnTrack = registerMockObject("ret1", {
          path: livePath.returnTrack(0),
          properties: { can_be_armed: 0 },
        });

        updateTrack({
          id: "ret1",
          inputRoutingType: "17",
          outputRoutingType: "25",
        });

        // Input routing exists only on regular non-group tracks: warn-and-skip.
        expect(returnTrack.set).not.toHaveBeenCalledWith(
          "input_routing_type",
          expect.anything(),
        );
        // Output routing is valid on return tracks and is still applied.
        expect(returnTrack.set).toHaveBeenCalledWith(
          "output_routing_type",
          '{"output_routing_type":{"identifier":25}}',
        );
        expect(capturedWarnings()).toContainEqual(
          expect.stringContaining("input routing is only available"),
        );
      });

      it("warns and skips input routing on a group track", () => {
        const groupTrack = registerMockObject("grp1", {
          path: livePath.track(5),
          properties: { is_foldable: 1 },
        });

        updateTrack({ id: "grp1", inputRoutingType: "17" });

        expect(groupTrack.set).not.toHaveBeenCalledWith(
          "input_routing_type",
          expect.anything(),
        );
        expect(capturedWarnings()).toContainEqual(
          expect.stringContaining("input routing is only available"),
        );
      });

      it("warns and skips monitoring state on a non-armable track", () => {
        const returnTrack = registerMockObject("ret1", {
          path: livePath.returnTrack(0),
          properties: { can_be_armed: 0 },
        });

        updateTrack({ id: "ret1", monitoringState: MONITORING_STATE.IN });

        expect(returnTrack.set).not.toHaveBeenCalledWith(
          "current_monitoring_state",
          expect.anything(),
        );
        expect(capturedWarnings()).toContainEqual(
          expect.stringContaining(
            "monitoringState is only available on armable",
          ),
        );
      });
    });
  });

  // The helper is unit-tested on its own, but nothing checked updateTrack
  // actually routes a return track's name through it — the read tool reports
  // "A-Delay", and writing that back unstripped gives "A-A-Delay".
  describe("return track names", () => {
    it("strips the send letter read-track reported", () => {
      const returnTrack = registerMockObject("ret1", {
        path: livePath.returnTrack(0),
      });

      updateTrack({ id: "ret1", name: "A-Delay" });

      expect(returnTrack.set).toHaveBeenCalledWith("name", "Delay");
    });

    it("leaves a regular track's name alone", () => {
      const track = registerMockObject("trk1", { path: livePath.track(0) });

      const result = updateTrack({ id: "trk1", name: "A-Delay" });

      expect(track.set).toHaveBeenCalledWith("name", "A-Delay");
      expect(result).toStrictEqual({ id: "trk1", path: "t0" });
    });

    it("reports the name Live landed on when it prefixed the letter", () => {
      const returnTrack = registerMockObject("ret3", {
        path: livePath.returnTrack(2),
      });

      const result = updateTrack({ id: "ret3", name: "B-Side" });

      // "B-Side" isn't return C's own letter, so it stays and Live prefixes it.
      expect(returnTrack.set).toHaveBeenCalledWith("name", "B-Side");
      expect(result).toStrictEqual({
        id: "ret3",
        path: "rt2",
        name: "C-B-Side",
        reason: "Live prefixes a return track's name with its send letter",
      });
    });

    it("says nothing when the name lands as asked", () => {
      registerMockObject("ret1", { path: livePath.returnTrack(0) });

      const result = updateTrack({ id: "ret1", name: "A-Delay" });

      expect(result).toStrictEqual({ id: "ret1", path: "rt0" });
    });

    it("reports the letter a bare name comes back with", () => {
      registerMockObject("ret1", { path: livePath.returnTrack(0) });

      const result = updateTrack({ id: "ret1", name: "Tape" });

      expect(result).toStrictEqual({
        id: "ret1",
        path: "rt0",
        name: "A-Tape",
        reason: "Live prefixes a return track's name with its send letter",
      });
    });
  });

  describe("color", () => {
    /**
     * Read a track's color back as Live would after quantizing it.
     * @param track - The registered mock track
     * @param value - The color Live answers with, as its packed integer
     */
    function trackReadsColor(track: RegisteredMockObject, value: number): void {
      track.get.mockImplementation((prop: string) =>
        prop === "color" ? [value] : [0],
      );
    }

    it("reports the palette color Live snapped to on the track's entry", () => {
      trackReadsColor(track123, 16725558); // #FF3636

      expect(updateTrack({ id: "123", color: "#FF0000" })).toStrictEqual({
        id: "123",
        path: "t0",
        color: "#FF3636",
        reason: "color #FF0000 is not in Live's palette; landed as #FF3636",
      });
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("says nothing when the color lands as asked", () => {
      trackReadsColor(track123, 16711680); // #FF0000

      expect(updateTrack({ id: "123", color: "#FF0000" })).toStrictEqual({
        id: "123",
        path: "t0",
      });
    });

    it("answers per track when several were recolored", () => {
      trackReadsColor(track123, 1768495); // #1AFC2F
      trackReadsColor(track456, 1768495);

      expect(updateTrack({ id: "123,456", color: "#00FF00" })).toStrictEqual([
        {
          id: "123",
          path: "t0",
          color: "#1AFC2F",
          reason: "color #00FF00 is not in Live's palette; landed as #1AFC2F",
        },
        {
          id: "456",
          path: "t1",
          color: "#1AFC2F",
          reason: "color #00FF00 is not in Live's palette; landed as #1AFC2F",
        },
      ]);
    });

    it("says nothing about color when the call sent none", () => {
      trackReadsColor(track123, 16725558);

      expect(updateTrack({ id: "123", name: "No color" })).toStrictEqual({
        id: "123",
        path: "t0",
      });
    });

    it("keeps the return track's rename reason alongside the color's", () => {
      const returnTrack = registerMockObject("rt-1", {
        path: livePath.returnTrack(0),
      });

      trackReadsColor(returnTrack, 16725558); // #FF3636

      expect(
        updateTrack({ id: "rt-1", name: "Verb", color: "#FF0000" }),
      ).toStrictEqual({
        id: "rt-1",
        path: "rt0",
        name: "A-Verb",
        color: "#FF3636",
        reason:
          "Live prefixes a return track's name with its send letter; " +
          "color #FF0000 is not in Live's palette; landed as #FF3636",
      });
    });
  });
});
