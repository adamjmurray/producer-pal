// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live turns down a device the place can't take with no id and no reason, so
// the call says why instead.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

/**
 * Register a track or main track, as Live reports it, whose insert_device
 * would work.
 * @param id - Mock id, and the id the result names it by
 * @param path - The track's Live API path
 * @param properties - What makes it the kind of track it is
 * @returns The track mock
 */
function registerPlace(
  id: string,
  path: PathLike,
  properties: Record<string, unknown>,
): RegisteredMockObject {
  registerMockObject("made", { path: `${String(path)} devices 0` });

  return registerMockObject(id, {
    path,
    type: "Track",
    properties,
    methods: { insert_device: () => ["id", "made"] },
  });
}

const GROUP = { is_foldable: 1, has_midi_input: 0 };
const AUDIO = { is_foldable: 0, has_midi_input: 0 };
const MIDI = { is_foldable: 0, has_midi_input: 1 };

describe("createDevice — a device the place can't take", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  it("says a group track takes only audio effects, and never asks Live", async () => {
    const group = registerPlace("g9", livePath.track(9), GROUP);

    await expect(
      createDevice({ path: "t9/d+", device: "Operator" }),
    ).rejects.toThrow(
      'group track t9 (id g9) takes only audio effects; "Operator" is an instrument',
    );
    expect(group.call).not.toHaveBeenCalled();
  });

  it("says the same of a MIDI effect", async () => {
    registerPlace("g9", livePath.track(9), GROUP);

    await expect(
      createDevice({ path: "t9/d+", device: "Arpeggiator" }),
    ).rejects.toThrow(
      'group track t9 (id g9) takes only audio effects; "Arpeggiator" is a MIDI effect',
    );
  });

  it("says an audio track takes only audio effects", async () => {
    registerPlace("a4", livePath.track(4), AUDIO);

    await expect(
      createDevice({ path: "t4/d+", device: "Operator" }),
    ).rejects.toThrow(
      'audio track t4 (id a4) takes only audio effects; "Operator" is an instrument',
    );
  });

  it("says a return track takes only audio effects", async () => {
    registerPlace("r0", livePath.returnTrack(0), MIDI);

    await expect(
      createDevice({ path: "rt0/d+", device: "Operator" }),
    ).rejects.toThrow(
      'return track rt0 (id r0) takes only audio effects; "Operator" is an instrument',
    );
  });

  it("says the main track takes only audio effects", async () => {
    registerPlace("main", livePath.masterTrack(), MIDI);

    await expect(
      createDevice({ path: "mt/d+", device: "Arpeggiator" }),
    ).rejects.toThrow(
      'main track mt (id main) takes only audio effects; "Arpeggiator" is a MIDI effect',
    );
  });

  it("puts an audio effect on a group track, and any device on a MIDI track", async () => {
    const group = registerPlace("g9", livePath.track(9), GROUP);
    const midi = registerPlace("m1", livePath.track(1), MIDI);

    await createDevice({ path: "t9/d+", device: "Compressor" });
    await createDevice({ path: "t1/d+", device: "Operator" });

    expect(group.call).toHaveBeenCalledWith("insert_device", "Compressor");
    expect(midi.call).toHaveBeenCalledWith("insert_device", "Operator");
  });

  // One bad place is that target's skip: the rest of the call still runs.
  it("skips only the place that can't take it", async () => {
    registerPlace("g9", livePath.track(9), GROUP);

    const midi = registerPlace("m1", livePath.track(1), MIDI);

    const result = await createDevice({
      path: "t9/d+,t1/d+",
      device: "Operator",
    });

    expect(midi.call).toHaveBeenCalledWith("insert_device", "Operator");
    expect(result).toStrictEqual([
      {
        path: "t9/d+",
        ok: false,
        detail:
          'group track t9 (id g9) takes only audio effects; "Operator" is an instrument',
      },
      { id: "made", path: "t1/d0" },
    ]);
  });

  describe("in a rack's chain", () => {
    /**
     * Register track 0 with a rack of the given type, holding one chain whose
     * insert Live turns down.
     * @param rackType - The rack's `type`: 1, 2 or 4
     * @returns The chain mock
     */
    function registerRefusingChain(rackType: number): RegisteredMockObject {
      registerMockObject("t0", { path: livePath.track(0), type: "Track" });
      registerMockObject("rack", {
        path: livePath.track(0).device(0),
        type: "RackDevice",
        properties: {
          type: rackType,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain0"),
        },
      });

      return registerMockObject("chain0", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: { devices: [] },
        methods: { insert_device: () => ["id", "0"] },
      });
    }

    it("says an audio effect rack's chain takes only audio effects", async () => {
      const chain = registerRefusingChain(2);

      await expect(
        createDevice({ path: "t0/d0/c0/d+", device: "Operator" }),
      ).rejects.toThrow(
        'chain t0/d0/c0 (id chain0) takes only audio effects; "Operator" is an instrument',
      );
      // The rack is only read once Live has turned the insert down.
      expect(chain.call).toHaveBeenCalledWith("insert_device", "Operator");
    });

    it("says a MIDI effect rack's chain takes only MIDI effects", async () => {
      registerRefusingChain(4);

      await expect(
        createDevice({ path: "t0/d0/c0/d+", device: "Compressor" }),
      ).rejects.toThrow(
        'chain t0/d0/c0 (id chain0) takes only MIDI effects; "Compressor" is an audio effect',
      );
    });

    it("leaves an instrument rack's refusal as it was", async () => {
      registerRefusingChain(1);

      await expect(
        createDevice({ path: "t0/d0/c0/d+", device: "Operator" }),
      ).rejects.toThrow(/^could not insert "Operator" at end in path/);
    });
  });
});
