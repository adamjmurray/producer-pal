// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device copy into a Live 13 rack that holds its fixed chains is refused only
// once the copy exists, like any destination the move can't reach, so the copy
// has to be deleted again — on both ways of copying a device.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerMockObject,
  setupDeviceDuplicationMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { remoteScriptDown } from "#src/tools/actions/duplicate/helpers/device/remote-script-down-test-helpers.ts";
import { simulateMockDeletes } from "#src/test/mocks/mock-registry.ts";
import { registerFixedChainRack } from "#src/tools/device/tests/helpers/fixed-chain-rack-fixtures.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

const REFUSAL_AFTER_COPY =
  "not copied — Multiband Rack (id rack) has a fixed 3 chains";

describe("duplicate device - into a rack with fixed chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("through the remote script", () => {
    /**
     * A Reverb at t0/d1 with the remote script's copy at d2, and a full rack at
     * t1/d0 to send it to.
     * @returns The track holding the copy
     */
    function registerReverbWithCopy(): {
      track: ReturnType<typeof registerMockObject>;
      rack: ReturnType<typeof registerMockObject>;
    } {
      const track = registerMockObject("track0", {
        path: livePath.track(0),
        properties: { devices: children("eq", "reverb", "reverb-copy") },
      });

      for (const [id, index] of [
        ["reverb", 1],
        ["reverb-copy", 2],
      ] as const) {
        registerMockObject(id, {
          path: livePath.track(0).device(index),
          properties: { name: "Reverb", type: 2 },
        });
      }

      registerMockObject("live_set", { path: livePath.liveSet });
      const rack = registerFixedChainRack(1, "multiband");

      vi.mocked(requestNode).mockResolvedValue({
        success: true,
        result: { available: true, index: 2 },
      });

      return { track, rack };
    }

    it.each(["t1/d0/c+", "t1/d0/c5/d+"])(
      "refuses %s and deletes the copy",
      async (toPath) => {
        const { track, rack } = registerReverbWithCopy();

        simulateMockDeletes();

        await expect(
          duplicate({ type: "device", id: "reverb", toPath }),
        ).rejects.toThrow(REFUSAL_AFTER_COPY);
        expect(track.call).toHaveBeenCalledWith("delete_device", 2);
        expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
      },
    );

    it("says where the copy is left when it can't be deleted", async () => {
      registerReverbWithCopy();

      // Without simulated deletes the copy survives the delete call.
      await expect(
        duplicate({ type: "device", id: "reverb", toPath: "t1/d0/c+" }),
      ).rejects.toThrow(
        /not copied — Multiband Rack \(id rack\).*; the copy may be left at .*t0\/d2.*it wasn't deleted/,
      );
    });
  });

  describe("through a temp track", () => {
    beforeEach(() => {
      remoteScriptDown();
    });

    it.each(["t1/d0/c+", "t1/d0/c5/d+"])(
      "refuses %s and deletes the temp track",
      async (toPath) => {
        const { liveSet } = setupDeviceDuplicationMocks();
        // The temp track lands at t1 and the registry moves the rack along to
        // t2, as Live does.
        const rack = registerFixedChainRack(1, "multiband");

        await expect(
          duplicate({ type: "device", id: "device1", toPath }),
        ).rejects.toThrow(REFUSAL_AFTER_COPY);
        expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
        expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
      },
    );
  });
});
