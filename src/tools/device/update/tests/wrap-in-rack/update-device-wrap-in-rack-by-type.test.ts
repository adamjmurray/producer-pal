// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A wrap says what a container holds when `inst`/`mfx<n>`/`afx<n>` names no
// device in it — the only thing a wrap can say, since it answers with one rack
// for the whole call rather than an entry per device.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  type RegisteredMockObject,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  followMoves,
  registerAudioEffectDevice,
  registerGrowingChainRack,
  registerInstrumentDevice,
  registerTrackingChain,
  registerTempTrackMocks,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";

describe("updateDevice - wrapInRack by device type", () => {
  beforeEach(() => {
    registerTrack0();
    registerAudioEffectDevice("device-0", 0);
    registerMockObject("live-set", { path: livePath.liveSet });
  });

  it("says what the track holds when a device path names nothing", () => {
    expect(() => updateDevice({ path: "t0/inst", wrapInRack: true })).toThrow(
      'wrapInRack found no devices to wrap: nothing at path "t0/inst": t0 has no instrument',
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says what the track holds when toPath names nothing", () => {
    expect(() =>
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t0/inst" }),
    ).toThrow('nothing at toPath "t0/inst": t0 has no instrument');
    expect(capturedWarnings()).toStrictEqual([]);
  });
});

describe("updateDevice - wrapInRack with an instrument and its effects", () => {
  let liveSet: RegisteredMockObject;
  let track0: RegisteredMockObject;

  beforeEach(() => {
    track0 = registerTrack0();
    registerInstrumentDevice("device-0", 0);
    registerAudioEffectDevice("device-1", 1);
    registerInstrumentDevice("device-2", 2);
    registerMockObject("device-3", {
      path: livePath.track(0).device(3),
      type: "RackDevice",
      properties: { type: 4 },
    });
    registerGrowingChainRack(0);
    liveSet = registerTempTrackMocks();
    registerTrackingChain(liveSet);
    followMoves(liveSet, track0, undefined, [
      "device-0",
      "device-1",
      "device-2",
      "device-3",
    ]);
  });

  /**
   * Assert a device moved into the rack's chain at a slot.
   * @param id - The device
   * @param slot - Its slot in the chain
   */
  function expectInChain(id: string, slot: number): void {
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      `id ${id}`,
      "id chain-0",
      slot,
    );
  }

  it("wraps an instrument and an audio effect in series in one chain", () => {
    const result = updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true });

    // Only the instrument is staged; the effect goes straight into the rack.
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id temp-track",
      0,
    );
    expect(liveSet.call).not.toHaveBeenCalledWith(
      "move_device",
      "id device-1",
      "id temp-track",
      0,
    );
    expectInChain("device-0", 0);
    expectInChain("device-1", 1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
    expect(result).toStrictEqual({
      id: "new-rack",
      type: "instrument-rack",
      deviceCount: 2,
    });
  });

  it("puts the instrument before an effect named ahead of it", () => {
    updateDevice({ path: "t0/d1,t0/d0", wrapInRack: true });

    // The rack takes the instrument's slot.
    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Instrument Rack",
      0,
    );
    expectInChain("device-0", 0);
    expectInChain("device-1", 1);
  });

  it("appends the rack to a track the lone instrument left empty", () => {
    followMoves(liveSet, track0, undefined, ["device-0"]);

    updateDevice({ path: "t0/d0", wrapInRack: true });

    // Live refuses index 0 on an empty track, so no index at all
    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Instrument Rack",
    );
    expectInChain("device-0", 0);
  });

  it("appends the rack to an empty track a toPath names at d0", () => {
    const emptyTrack = registerMockObject("track-2", {
      path: livePath.track(2),
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    updateDevice({ path: "t0/d1", wrapInRack: true, toPath: "t2/d0" });

    expect(emptyTrack.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
    );
  });

  it("puts a MIDI effect ahead of the instrument", () => {
    updateDevice({ path: "t0/d0,t0/d3", wrapInRack: true });

    expectInChain("device-3", 0);
    expectInChain("device-0", 1);
  });

  it("still deletes the temp track when an effect move fails", () => {
    const moveFailure = "move_device failed";

    // A rack at a real slot, which could be deleted if the guard let it.
    registerGrowingChainRack(0, livePath.track(0).device(9));

    liveSet.methods.move_device = (deviceId: unknown) => {
      if (deviceId === "id device-1") {
        throw new Error(moveFailure);
      }

      return null;
    };

    expect(() =>
      updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true }),
    ).toThrow(moveFailure);

    // The instrument was already in the rack, so nothing is left to restore.
    expectInChain("device-0", 0);
    expect(liveSet.call).not.toHaveBeenCalledWith(
      "move_device",
      expect.anything(),
      "id track-0",
      expect.anything(),
    );
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
    // The rack holds the instrument, so it must not be deleted.
    expect(track0.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });

  it("moves the instrument back when Live refuses the rack", () => {
    mockNonExistentObjects();
    // Live refuses an insert by answering with no id, not by throwing.
    track0.methods.insert_device = () => ["id", 0];

    expect(() => updateDevice({ path: "t0/d0", wrapInRack: true })).toThrow(
      "wrapInRack: Live refused to insert the Instrument Rack",
    );
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id track-0",
      0,
    );
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("deletes a temp track that came with preset devices", () => {
    // A default track preset can put Channel EQ and Utility on every new track.
    const tempTrack = registerMockObject("temp-track", {
      path: livePath.track(1),
    });
    const presetDevices = ["id channel-eq", "id utility"];

    followMoves(liveSet, tempTrack);
    const moves = tempTrack.get.getMockImplementation() as (p: string) => [];

    tempTrack.get.mockImplementation((prop: string) =>
      prop === "devices"
        ? [...moves(prop), ...presetDevices.flatMap((id) => id.split(" "))]
        : moves(prop),
    );

    const result = updateDevice({ path: "t0/d0", wrapInRack: true });

    expectInChain("device-0", 0);
    expect(liveSet.call).not.toHaveBeenCalledWith(
      "move_device",
      expect.stringMatching(/channel-eq|utility/),
      expect.anything(),
      expect.anything(),
    );
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
    expect(result).toStrictEqual({
      id: "new-rack",
      type: "instrument-rack",
      deviceCount: 1,
    });
  });

  describe("when Live makes no chain", () => {
    beforeEach(() => {
      // A rack at a real slot, so it can be deleted; insert_chain answers 1.
      registerMockObject("new-rack", {
        path: livePath.track(0).device(9),
      }).call.mockReturnValue(1);
    });

    it("deletes the empty rack, then moves the instrument back", () => {
      expect(() => updateDevice({ path: "t0/d0", wrapInRack: true })).toThrow(
        "wrapInRack: Live made no chain in the new rack",
      );

      /**
       * When a mock first got a call matching a predicate.
       * @param mock - The mock
       * @param match - Picks the call
       * @returns The call's place in the order of all mock calls
       */
      const when = (
        mock: RegisteredMockObject,
        match: (c: unknown[]) => boolean,
      ): number =>
        mock.call.mock.invocationCallOrder[
          mock.call.mock.calls.findIndex(match)
        ] as number;

      expect(track0.call).toHaveBeenCalledWith("delete_device", 9);
      expect(when(track0, (c) => c[0] === "delete_device")).toBeLessThan(
        when(liveSet, (c) => c[2] === "id track-0"),
      );
      expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
    });

    it("says so when the empty rack can't be deleted", () => {
      track0.methods.delete_device = () => {
        throw new Error("delete_device failed");
      };

      expect(() => updateDevice({ path: "t0/d0", wrapInRack: true })).toThrow(
        "wrapInRack: Live made no chain in the new rack; the empty new rack t0/d9",
      );
    });
  });

  it("keeps the temp track when Live ignores the instrument's move", () => {
    const toChain = (_id: string, to: string): boolean => to === "id chain-0";
    const ignoreInstrument = (id: string, to: string): boolean =>
      id === "id device-0" && toChain(id, to);

    liveSet = registerTempTrackMocks(ignoreInstrument);
    registerTrackingChain(liveSet, ignoreInstrument);

    const result = updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true });

    // The effect takes the chain's first slot, not the one it was sorted into.
    expectInChain("device-1", 0);
    expect(liveSet.call).not.toHaveBeenCalledWith("delete_track", 1);
    expect(result).toStrictEqual({
      id: "new-rack",
      type: "instrument-rack",
      deviceCount: 1,
      reason:
        'path "t0/d0" is not in the rack: Live didn\'t move it; ' +
        "the instrument was left on new track t1",
    });
  });

  it.each([
    ["the same path twice", { path: "t0/d0,t0/d0" }],
    ["an id and a path", { id: "device-0", path: "t0/d0" }],
  ])("wraps an instrument named as %s once", (_label, args) => {
    expect(updateDevice({ ...args, wrapInRack: true })).toStrictEqual({
      id: "new-rack",
      type: "instrument-rack",
      deviceCount: 1,
    });
  });

  it("says on the rack's entry which devices did not make it in", () => {
    mockNonExistentObjects();
    const result = updateDevice({ id: "device-0,missing", wrapInRack: true });

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "instrument-rack",
      deviceCount: 1,
      reason: 'no device at "missing"',
    });
  });

  it("refuses two instruments, naming only the instruments", () => {
    expect(() =>
      updateDevice({ path: "t0/d0,t0/d1,t0/d2", wrapInRack: true }),
    ).toThrow(
      'wrapInRack can wrap only one instrument at a time; 2 named: path "t0/d0", path "t0/d2"',
    );
    expect(liveSet.call).not.toHaveBeenCalledWith("create_midi_track", -1);
  });
});
