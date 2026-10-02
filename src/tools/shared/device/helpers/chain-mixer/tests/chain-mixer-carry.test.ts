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
import {
  carryChainMixer,
  noteChainMixerLeftBehind,
  sourceChain,
} from "../chain-mixer-carry.ts";
import {
  chainApi,
  chainPath,
  rackPath,
  registerChainWithMixer,
  registerReturnChains,
} from "./chain-mixer-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("noteChainMixerLeftBehind", () => {
  const devicePath = chainPath.device(0);
  let destination: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("device-1", {
      path: devicePath,
      type: "SimplerDevice",
    });
    destination = registerMockObject("dest-chain", {
      path: rackPath.chain(2),
      type: "DrumChain",
    });
  });

  it("warns with the mixer values and a pad-move hint for a drum chain", () => {
    registerChainWithMixer({ gainDb: -15 });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(destination.path),
    );

    expect(capturedWarnings()).toContain(
      'chain "Snare" t0/d0/c1 (id chain-1) trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn or move the whole pad instead (update-device with the pad path and toPath)',
    );
  });

  it("omits the pad-move hint when the destination is in another rack", () => {
    // Both pad operations stay within one rack, so offering them here would
    // point at something that gets refused.
    registerChainWithMixer({ gainDb: -15 });

    const otherRack = registerMockObject("other-chain", {
      path: livePath.track(1).device(0).chain(0),
      type: "DrumChain",
    });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(otherRack.path),
    );

    expect(capturedWarnings()).toContain(
      'chain "Snare" t0/d0/c1 (id chain-1) trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("omits the pad-move hint for a regular chain", () => {
    registerChainWithMixer({ pan: 0.5, type: "Chain" });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(destination.path),
    );

    expect(capturedWarnings()).toContain(
      'chain "Snare" t0/d0/c1 (id chain-1) trim (pan 0.5) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("phrases a copy as a copy and points at a pad copy", () => {
    registerChainWithMixer({ gainDb: -15 });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(destination.path),
      true,
    );

    expect(capturedWarnings()).toContain(
      `chain "Snare" t0/d0/c1 (id chain-1) trim (gainDb -15) does not follow the copy — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn or copy the whole pad instead (duplicate type 'drum-pad' with the pad path and toPath), which brings the trim with it`,
    );
  });

  it("points at update-track when the destination is a track", () => {
    registerChainWithMixer({ gainDb: -15 });
    const track = registerMockObject("dest-track", {
      path: livePath.track(2),
      type: "Track",
    });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(track.path),
    );

    expect(capturedWarnings()).toContain(
      'chain "Snare" t0/d0/c1 (id chain-1) trim (gainDb -15) stays behind — reapply on the destination track with update-track gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("counts sends rather than listing them", () => {
    registerChainWithMixer({
      gainDb: -15,
      sends: [
        { value: 0.5, display_value: -12 },
        { value: 0.5, display_value: -6 },
      ],
    });
    registerReturnChains("a D", "b R");

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(destination.path),
    );

    expect(capturedWarnings()).toContain(
      'chain "Snare" t0/d0/c1 (id chain-1) trim (gainDb -15, 2 sends) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn or move the whole pad instead (update-device with the pad path and toPath)',
    );
  });

  it("stays quiet when the chain mixer is at its defaults", () => {
    registerChainWithMixer();

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(destination.path),
    );

    expect(capturedWarnings()).toHaveLength(0);
  });

  it("stays quiet when the device stays in the same chain", () => {
    registerChainWithMixer({ gainDb: -15 });

    noteChainMixerLeftBehind(sourceChain(LiveAPI.from(devicePath)), chainApi());

    expect(capturedWarnings()).toHaveLength(0);
  });

  it("stays quiet when the device is not inside a chain", () => {
    registerMockObject("track-device", {
      path: livePath.track(0).device(3),
      type: "SimplerDevice",
    });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(livePath.track(0).device(3))),
      LiveAPI.from(destination.path),
    );

    expect(capturedWarnings()).toHaveLength(0);
  });

  it("stays quiet when the source chain no longer exists", () => {
    mockNonExistentObjects();
    registerMockObject("device-1", {
      path: devicePath,
      type: "SimplerDevice",
    });

    noteChainMixerLeftBehind(
      sourceChain(LiveAPI.from(devicePath)),
      LiveAPI.from(destination.path),
    );

    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("carryChainMixer", () => {
  const silent = { value: 0, display_value: -70 };
  const carried = {
    from: 'chain "Snare"',
    mixer: {
      gainDb: -15,
      sends: [
        { return: "a Delay", gainDb: -12 },
        { return: "b Reverb", gainDb: -6 },
      ],
    },
  };

  /**
   * Register the destination chain with two sends, naming the rack's returns
   * @param disabledSends - Sends a rack macro owns, by index
   * @param disabled - Mixer parameters a rack macro owns
   * @returns The destination's send parameters
   */
  function registerDestination(
    disabledSends: number[] = [],
    disabled: ("volume" | "panning")[] = [],
  ): RegisteredMockObject[] {
    registerChainWithMixer({ sends: [silent, silent], disabled });
    registerReturnChains("a Delay", "b Reverb");

    return [0, 1].map((i) =>
      registerMockObject(`send-${i}`, {
        type: "DeviceParameter",
        properties: { is_enabled: disabledSends.includes(i) ? 0 : 1 },
      }),
    );
  }

  it("counts only the sends that landed", () => {
    // A rack macro owns the destination's second send, so Live ignores that
    // write. Counting it would name a send the chain never got.
    const [first, second] = registerDestination([1]);

    carryChainMixer(carried, chainApi());

    expect(first?.set).toHaveBeenCalledWith("display_value", -12);
    expect(second?.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'chain "Snare" t0/d0/c1 (id chain-1): send "b Reverb" gainDb is disabled',
      ),
    );
    expect(capturedWarnings()).toContain(
      'chain "Snare" trim (gainDb -15, 1 send) carried onto the destination chain, which was empty and at defaults',
    );
  });

  it("reports nothing carried when neither the gain nor a send lands", () => {
    // Every write is macro-owned, so the send list comes back empty — which is
    // not a carry, however many sends were offered.
    registerDestination([0, 1], ["volume"]);

    carryChainMixer(carried, chainApi());

    expect(capturedWarnings()).toContain(
      'chain "Snare" trim could not be carried onto the destination chain — it stays on the chain the device left',
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("carried onto the destination chain, which was"),
    );
  });
});
