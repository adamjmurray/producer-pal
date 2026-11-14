// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A path that can't take the device is refused before it makes any rack chain
// (or, for a browser device, the temp track), so the refusal leaves nothing
// behind and never says it did.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type RegisteredMockObject,
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { mockWorkingDeviceMoves } from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import { registerGrowingRack } from "../../../tests/helpers/growing-rack-fixtures.ts";
import { createDevice } from "../../create-device.ts";
import {
  registerTempTrack,
  TEMP_TRACK,
} from "../browser/temp-track-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/** A rack's `type` property: what its chains take only. */
const AUDIO_EFFECT_RACK = 2;
const MIDI_EFFECT_RACK = 4;

/**
 * Register track 0 holding a rack, whose chains would take a device if asked.
 * @param existing - How many chains the rack already has
 * @param rackType - The rack's `type`
 * @returns The rack mock, whose `insert_chain` must stay uncalled
 */
function registerRack(
  existing: number,
  rackType = AUDIO_EFFECT_RACK,
): RegisteredMockObject {
  registerMockObject("track-0", { path: livePath.track(0) });

  return registerGrowingRack({
    track: 0,
    existing,
    rackProperties: { type: rackType },
    chainMethods: { insert_device: () => ["id", "0"] },
  });
}

describe("createDevice — a path refused before it makes any chain", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  describe("native device", () => {
    it.each([
      [
        "an instrument into a chain c+ would make",
        "Operator",
        "t0/d0/c+",
        2,
        AUDIO_EFFECT_RACK,
        'chain t0/d0/c2 takes only audio effects; "Operator" is an instrument',
      ],
      [
        "a MIDI effect into a chain c+ would make",
        "Arpeggiator",
        "t0/d0/c+",
        2,
        AUDIO_EFFECT_RACK,
        'chain t0/d0/c2 takes only audio effects; "Arpeggiator" is a MIDI effect',
      ],
      [
        "an audio effect into a MIDI effect rack's new chain",
        "Compressor",
        "t0/d0/c+",
        1,
        MIDI_EFFECT_RACK,
        'chain t0/d0/c1 takes only MIDI effects; "Compressor" is an audio effect',
      ],
      [
        "an instrument into the last of several chains a c<n> would make",
        "Operator",
        "t0/d0/c4/d+",
        2,
        AUDIO_EFFECT_RACK,
        'chain t0/d0/c4 takes only audio effects; "Operator" is an instrument',
      ],
    ])("refuses %s", async (_, device, path, existing, rackType, reason) => {
      const rack = registerRack(existing, rackType);

      await expect(createDevice({ device, path })).rejects.toHaveProperty(
        "message",
        reason,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    });

    it("refuses a container missing below a chain the path would make", async () => {
      const rack = registerRack(1);

      await expect(
        createDevice({ device: "Compressor", path: "t0/d0/c1/d0/c0/d+" }),
      ).rejects.toThrow(
        /^Device in path "t0\/d0\/c1\/d0\/c0\/d\+" does not exist$/,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    });

    it("refuses an index past the end of a chain the path would make", async () => {
      const rack = registerRack(1);

      await expect(
        createDevice({ device: "Compressor", path: "t0/d0/c3/d5" }),
      ).rejects.toThrow(
        /^"t0\/d0\/c3\/d5" is past the end of a container holding 0 devices$/,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    });

    it("refuses a type-addressed slot that names no device in a chain", async () => {
      const rack = registerRack(1);

      await expect(
        createDevice({ device: "Compressor", path: "t0/d0/c0/inst" }),
      ).rejects.toThrow(
        /^path "t0\/d0\/c0\/inst" names no device to insert at: /,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    });

    it("refuses a track that isn't there below a chain the path would make", async () => {
      await expect(
        createDevice({ device: "Compressor", path: "t9/d0/c+" }),
      ).rejects.toThrow(/^Track in path "t9\/d0\/c\+" does not exist$/);
    });

    it("refuses an index past the end of a chain already there", async () => {
      const rack = registerRack(1);

      await expect(
        createDevice({ device: "Compressor", path: "t0/d0/c0/d5" }),
      ).rejects.toThrow(
        /^"t0\/d0\/c0\/d5" is past the end of a container holding 0 devices$/,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    });

    it("still makes the chain for a device the rack takes", async () => {
      registerMockObject("track-0", { path: livePath.track(0) });
      registerMockObject("made", {
        path: livePath.track(0).device(0).chain(1).device(0),
      });
      const rack = registerGrowingRack({
        track: 0,
        existing: 1,
        rackProperties: { type: AUDIO_EFFECT_RACK },
        chainMethods: { insert_device: () => ["id", "made"] },
      });

      expect(
        await createDevice({ device: "Compressor", path: "t0/d0/c+" }),
      ).toStrictEqual({ id: "made", path: "t0/d0/c1/d0" });
      expect(rack.call).toHaveBeenCalledWith("insert_chain");
    });

    it("skips only the entry that can't be placed, leaving no chain for it", async () => {
      const rack = registerRack(1);

      const result = (await createDevice({
        device: "Operator",
        path: "t0/d0/c+,t0/d0/c7/d9",
      })) as { ok: boolean; detail: string }[];

      expect(result.map((entry) => entry.detail)).toStrictEqual([
        'chain t0/d0/c1 takes only audio effects; "Operator" is an instrument',
        '"t0/d0/c7/d9" is past the end of a container holding 0 devices',
      ]);
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    });
  });

  describe("browser device", () => {
    let liveSet: RegisteredMockObject;
    let tempTrack: RegisteredMockObject;

    /**
     * Have the remote script find an item of the given type.
     * @param itemType - The item's `type`
     */
    function answerRemoteScript(itemType: string): void {
      vi.mocked(requestNode).mockResolvedValue({
        success: true,
        result: {
          available: true,
          item: { type: itemType, path: "x/Pro-Q 4", name: "Pro-Q 4" },
        },
      });
    }

    /** Nothing was loaded: no load request, no temp track. */
    function expectNothingLoaded(): void {
      expect(requestNode).not.toHaveBeenCalledWith(
        REMOTE_SCRIPT_ROUTES.load,
        expect.anything(),
        expect.anything(),
      );
      expect(liveSet.methods.create_midi_track).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      vi.mocked(requestNode).mockReset();
      liveSet = mockWorkingDeviceMoves();
      ({ tempTrack } = registerTempTrack(liveSet));
    });

    it("refuses a track that isn't there below a chain the path would make, before loading", async () => {
      answerRemoteScript("audio-effect");

      await expect(
        createDevice({ device: "Pro-Q 4", path: "t9/d0/c+" }),
      ).rejects.toThrow(/^Track in path "t9\/d0\/c\+" does not exist$/);
      expectNothingLoaded();
    });

    it("refuses a type-addressed slot that names no device, before loading", async () => {
      answerRemoteScript("audio-effect");
      registerRack(1);

      await expect(
        createDevice({ device: "Pro-Q 4", path: "t0/d0/c0/inst" }),
      ).rejects.toThrow(/names no device to insert at: /);
      expectNothingLoaded();
    });

    it("still loads a plug-in, whose kind isn't known, into a chain c+ would make", async () => {
      liveSet.methods.delete_track = vi.fn();
      const rack = registerRack(1);

      vi.mocked(requestNode).mockImplementation(async (route) => {
        if (route === REMOTE_SCRIPT_ROUTES.resolve) {
          return {
            success: true,
            result: {
              available: true,
              item: { type: "plugin", path: "x/Pro-Q 4", name: "Pro-Q 4" },
            },
          };
        }

        registerMockObject("loaded", { path: TEMP_TRACK.device(0) });
        tempTrack.properties.devices = ["id", "loaded"];

        return { success: true, result: { available: true } };
      });

      expect(
        await createDevice({ device: "Pro-Q 4", path: "t0/d0/c+" }),
      ).toStrictEqual({ id: "loaded", path: "t0/d0/c1/d0" });
      expect(rack.call).toHaveBeenCalledWith("insert_chain");
    });

    it("refuses an instrument into a chain c+ would make, before loading", async () => {
      answerRemoteScript("instrument");
      const rack = registerRack(2);

      await expect(
        createDevice({ device: "Pro-Q 4", path: "t0/d0/c+" }),
      ).rejects.toThrow(
        /^chain t0\/d0\/c2 takes only audio effects; "Pro-Q 4" is an instrument$/,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
      expectNothingLoaded();
    });

    it("refuses a container missing below a chain the path would make, before loading", async () => {
      answerRemoteScript("audio-effect");
      const rack = registerRack(1);

      await expect(
        createDevice({ device: "Pro-Q 4", path: "t0/d0/c1/d0/c0/d+" }),
      ).rejects.toThrow(
        /^Device in path "t0\/d0\/c1\/d0\/c0\/d\+" does not exist$/,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
      expectNothingLoaded();
    });

    it("refuses an index past the end of a chain the path would make, before loading", async () => {
      answerRemoteScript("plugin");
      const rack = registerRack(1);

      await expect(
        createDevice({ device: "Pro-Q 4", path: "t0/d0/c3/d5" }),
      ).rejects.toThrow(
        /^"t0\/d0\/c3\/d5" is past the end of a container holding 0 devices$/,
      );
      expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
      expectNothingLoaded();
    });
  });
});
