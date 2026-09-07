// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  type RegisteredMockObject,
  children,
  expectValueSet,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Register a Drum Rack at t0/d0 with a single C1 (MIDI 36) pad chain holding
 * `deviceIds`, whose device slot auto-creates a Simpler on insert.
 * @param deviceIds - Ids of the devices already on the pad
 * @returns The C1 chain mock
 */
function registerDrumRackWithC1(...deviceIds: string[]): RegisteredMockObject {
  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
  });

  const chain = registerMockObject("chain-c1", {
    type: "DrumChain",
    properties: { in_note: 36, devices: children(...deviceIds) },
    methods: { insert_device: () => ["id", "new-simpler"] },
  });

  registerMockObject("new-simpler", {
    type: "SimplerDevice",
    properties: { class_display_name: "Simpler", multi_sample_mode: 0 },
  });

  return chain;
}

/**
 * Register a Drum Rack at t0/d0 whose C1 pad already holds a DrumSampler.
 * @returns The C1 chain mock
 */
function registerDrumRackWithDrumSamplerOnC1(): RegisteredMockObject {
  const chain = registerDrumRackWithC1("ds-1");

  registerMockObject("ds-1", {
    type: "Device",
    properties: {
      class_display_name: "DrumSampler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });

  return chain;
}

// A pad's sample has three addresses: the rack plus a "pC1/sample" param name,
// the pad or layer itself, and the instrument's own device path — which is the
// one read-device prints. All three have to say the same thing about the same
// write.

describe("updateDevice - path-prefixed pseudo-params", () => {
  it("loads a sample into a drum pad by addressing the rack", () => {
    const chain = registerDrumRackWithC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/sample", value: "/snare.wav" }],
    });

    expect(chain.call).toHaveBeenCalledWith("insert_device", "Simpler");
    expect(LiveAPI.from("id new-simpler").call).toHaveBeenCalledWith(
      "replace_sample",
      "/snare.wav",
    );
  });

  it("refuses a path-prefixed param with an empty name after '/'", () => {
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: [], can_have_drum_pads: 1 },
    });

    expect(() =>
      updateDevice({
        path: "t0/d0",
        params: [{ name: "pC1/d0/", value: "/snare.wav" }],
      }),
    ).toThrow('params entry "pC1/d0/" has an empty name after "/"');
  });

  it("sets a real slash-named param (Dry/Wet) by name, not as a path", () => {
    registerMockObject("dev1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { parameters: children("drywet-param") },
    });
    // Reverb/Delay/Glue Compressor expose a parameter literally named
    // "Dry/Wet". The "/" must NOT route this to path-prefixed pseudo-param
    // handling (which would split it into prefix "Dry" + param "Wet" and drop
    // the write); it has to resolve as an ordinary DeviceParameter by name.
    const param = registerMockObject("drywet-param", {
      properties: {
        name: "Dry/Wet",
        original_name: "Dry/Wet",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (v: unknown) => `${Math.round(Number(v) * 100)} %`,
      },
    });

    updateDevice({ id: "dev1", params: [{ name: "Dry/Wet", value: "50" }] });

    expect(expectValueSet(param)).toBeCloseTo(0.5, 1);
  });

  it("warn-skips a param whose resolution throws and still applies later params", () => {
    // Drum rack with no chains. Addressing a far-out chain index (c20) forces
    // auto-creating past the cap, which throws. Each param is try-isolated, so
    // the bad one must not abort the following (good) param in the same call.
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        chains: [],
        can_have_drum_pads: 1,
        parameters: children("macro-param"),
      },
    });
    const macro = registerMockObject("macro-param", {
      properties: {
        name: "Macro 1",
        original_name: "Macro 1",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (v: unknown) => `${Number(v)} %` },
    });

    updateDevice({
      path: "t0/d0",
      params: [
        { name: "pC1/c20/sample", value: "/x.wav" }, // throws (exceeds chain cap)
        { name: "Macro 1", value: "0.5" }, // must still be applied
      ],
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("failed to set param"),
    );
    expect(expectValueSet(macro)).toBeCloseTo(0.5, 1);
  });

  it("warns that a general path-prefixed param is deprecated, but still writes it", () => {
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: ["id", "reg-chain"], can_have_drum_pads: 1 },
    });
    registerMockObject("reg-chain", {
      type: "Chain",
      properties: { devices: ["id", "reg-dev"] },
    });
    registerMockObject("reg-dev", {
      type: "Device",
      properties: {
        class_display_name: "Operator",
        parameters: children("reg-param"),
      },
    });
    const param = registerMockObject("reg-param", {
      properties: {
        name: "Volume",
        original_name: "Volume",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (v: unknown) => `${Math.round(Number(v) * 100)} %`,
      },
    });

    updateDevice({
      path: "t0/d0",
      params: [{ name: "c0/d0/Volume", value: "50" }],
    });

    expect(capturedWarnings()).toContainEqual(
      'params name "c0/d0/Volume" is deprecated and will be removed; ' +
        'use path "t0/d0/c0/d0" with name "Volume"',
    );
    expect(expectValueSet(param)).toBeCloseTo(0.5, 1);
  });

  it("does not warn for the drum-pad sample shortcut", () => {
    registerDrumRackWithC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/sample", value: "/snare.wav" }],
    });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("is deprecated"),
    );
  });

  it("advises the working replacement for a slash-named param, even though resolution fails outright", () => {
    // A slash-named param (e.g. Dry/Wet) reached through a path prefix is a
    // known bug: resolution splits on the last "/", so "c0/d0/Dry/Wet" becomes
    // prefix "c0/d0/Dry" + name "Wet", which navigates into nothing. The
    // deprecation warning's advice is built by a DIFFERENT split (from the
    // left, splitForAdvice) so it still names a path and name that work,
    // even though this particular write can't succeed either way.
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: ["id", "reg-chain"], can_have_drum_pads: 1 },
    });
    registerMockObject("reg-chain", {
      // An explicit path, not just a place in the rack's chains list: the
      // follow-up call below addresses it by path, which looks the object up
      // by that literal path rather than walking the chains/devices lists.
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
      properties: { devices: ["id", "reg-dev"] },
    });
    registerMockObject("reg-dev", {
      path: livePath.track(0).device(0).chain(0).device(0),
      type: "Device",
      properties: {
        class_display_name: "Reverb",
        parameters: children("drywet-param"),
      },
    });
    const param = registerMockObject("drywet-param", {
      properties: {
        name: "Dry/Wet",
        original_name: "Dry/Wet",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (v: unknown) => `${Math.round(Number(v) * 100)} %`,
      },
    });

    updateDevice({
      path: "t0/d0",
      params: [{ name: "c0/d0/Dry/Wet", value: "50" }],
    });

    const warnings = capturedWarnings();

    expect(warnings).toContainEqual(
      'params name "c0/d0/Dry/Wet" is deprecated and will be removed; ' +
        'use path "t0/d0/c0/d0" with name "Dry/Wet"',
    );
    expect(warnings).toContainEqual(
      expect.stringContaining('no device at "t0/d0/c0/d0/Dry"'),
    );

    // Proof the advice itself works: the suggested path and name reach the
    // same param directly.
    updateDevice({
      path: "t0/d0/c0/d0",
      params: [{ name: "Dry/Wet", value: "50" }],
    });

    expect(expectValueSet(param)).toBeCloseTo(0.5, 1);
  });
});

describe("updateDevice - pad instrument guard", () => {
  it("skips a sample write onto a pad instrument and keeps the device", () => {
    const chain = registerDrumRackWithDrumSamplerOnC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/sample", value: "/snare.wav" }],
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("sample write SKIPPED on pad t0/d0/pC1"),
    );
    expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
    expect(chain.call).not.toHaveBeenCalledWith("insert_device", "Simpler");
  });

  // The skip goes in the param's own entry, not only the warning: a params
  // list that came back a name short is one the caller has to diff against its
  // own request to read.
  it("carries the skip reason in the param's result entry", () => {
    registerDrumRackWithDrumSamplerOnC1();

    const result = updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/sample", value: "/snare.wav" }],
    });

    expect(result).toStrictEqual({
      id: "drum-rack",
      path: "t0/d0",
      params: [
        {
          name: "pC1/sample",
          reason: expect.stringContaining(
            "sample write SKIPPED on pad t0/d0/pC1",
          ) as unknown as string,
        },
      ],
    });
  });

  it("swaps the instrument for a Simpler and loads the sample under force", () => {
    const chain = registerDrumRackWithDrumSamplerOnC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/sample", value: "/snare.wav" }],
      force: true,
    });

    expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    expect(LiveAPI.from("id new-simpler").call).toHaveBeenCalledWith(
      "replace_sample",
      "/snare.wav",
    );
  });
});

const KICK = "/Library/kick.wav";

/**
 * Register a Drum Rack on t0/d0 whose C1 pad holds `layers` chains, each
 * empty and ready to auto-create a Simpler.
 * @param layers - How many chains sit on the pad
 * @returns The pad's chains, in rack order
 */
function registerPadRack(layers = 1): RegisteredMockObject[] {
  const chainIds = Array.from({ length: layers }, (_, i) => `chain-${i}`);

  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children(...chainIds),
      drum_pads: children("pad-36"),
    },
  });
  registerMockObject("pad-36", {
    path: livePath.track(0).device(0).drumPad(36),
    type: "DrumPad",
    properties: { note: 36 },
  });

  return chainIds.map((id, index) =>
    registerMockObject(id, {
      path: livePath.track(0).device(0).chain(index),
      type: "DrumChain",
      properties: { in_note: 36, devices: children() },
      methods: { insert_device: () => ["id", "new-simpler"] },
    }),
  );
}

/**
 * The same rack with the pad's chain not made yet. `insert_chain` hands it back
 * the way Live does: appended to the rack, its note set afterwards.
 * @returns The rack mock
 */
function registerUnbuiltPadChain(): RegisteredMockObject {
  registerPadRack();
  registerCreatedSimpler();

  // A re-registration replaces the property bag, so this restates the rack.
  const rack = registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children(),
      drum_pads: children("pad-36"),
    },
    methods: {
      insert_chain: () => {
        rack.properties.chains = children("chain-0");

        return null;
      },
    },
  });

  return rack;
}

/**
 * Register the Simpler a pad chain auto-creates, with a sample that reads back
 * whatever `replace_sample` was handed.
 * @param chainIndex - Which layer it lands in
 * @returns The Simpler mock
 */
function registerCreatedSimpler(chainIndex = 0): RegisteredMockObject {
  const sample = registerMockObject("new-sample", {
    type: "Sample",
    properties: { file_path: "", gain: 0.5 },
  });
  const simpler = registerMockObject("new-simpler", {
    path: livePath.track(0).device(0).chain(chainIndex).device(0),
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      sample: children("new-sample"),
    },
  });

  simpler.call.mockImplementation((method: string, value: unknown) => {
    if (method === "replace_sample") sample.properties.file_path = value;
  });

  return simpler;
}

/**
 * Put an instrument whose sample can't be set on a pad layer.
 * @param chain - The layer's chain mock
 * @param chainIndex - Its index in the rack
 * @returns The instrument mock
 */
function registerDrumSamplerOn(
  chain: RegisteredMockObject,
  chainIndex = 0,
): RegisteredMockObject {
  chain.properties.devices = children("ds-1");

  return registerMockObject("ds-1", {
    path: livePath.track(0).device(0).chain(chainIndex).device(0),
    type: "Device",
    properties: {
      class_display_name: "Drum Sampler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });
}

/** The reason a pad holding a Drum Sampler gives, whichever way it's addressed. */
const SWAP_REASON =
  "sample write SKIPPED on pad t0/d0/pC1/c0 — it holds a Drum Sampler, " +
  "whose sample the Live API can't set. Honoring the write REPLACES it with " +
  "a Simpler, losing all its settings. Ask the user before passing " +
  "force:true. To keep it: load the sample on another pad, or copy the " +
  'instrument to a free pad first (ppal-duplicate type:"device").';

describe("updateDevice - a sample addressed by the pad's own path", () => {
  it("creates a Simpler on an empty pad and reports what it loaded", () => {
    const [chain] = registerPadRack();

    registerCreatedSimpler();

    const result = updateDevice({
      path: "t0/d0/pC1",
      params: [{ name: "sample", value: KICK }],
    });

    expect(chain?.call).toHaveBeenCalledWith("insert_device", "Simpler");
    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      params: [{ name: "sample", value: KICK }],
    });
  });

  it("takes the same write on the layer's own path", () => {
    registerPadRack();
    registerCreatedSimpler();

    expect(
      updateDevice({
        path: "t0/d0/pC1/c0",
        params: [{ name: "sample", value: KICK }],
      }),
    ).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/pC1/c0",
      params: [{ name: "sample", value: KICK }],
    });
  });

  it("skips a pad whose instrument has no settable sample, and says why in the entry", () => {
    const [chain] = registerPadRack();

    registerDrumSamplerOn(chain as RegisteredMockObject);

    const result = updateDevice({
      path: "t0/d0/pC1",
      params: [{ name: "sample", value: KICK }],
    });

    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      params: [{ name: "sample", reason: SWAP_REASON }],
    });
    expect(capturedWarnings()).toContain(SWAP_REASON);
    expect(chain?.call).not.toHaveBeenCalledWith("delete_device", 0);
  });

  it("replaces that instrument under force and loads the sample", () => {
    const [chain] = registerPadRack();

    registerDrumSamplerOn(chain as RegisteredMockObject);
    registerCreatedSimpler();

    const result = updateDevice({
      path: "t0/d0/pC1",
      params: [{ name: "sample", value: KICK }],
      force: true,
    });

    expect(chain?.call).toHaveBeenCalledWith("delete_device", 0);
    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      params: [{ name: "sample", value: KICK }],
    });
  });

  // A sample belongs to one layer, and under force the write would delete an
  // instrument nobody named.
  it("skips a stacked pad and names the layer paths to use instead", () => {
    const chains = registerPadRack(2);
    const reason =
      "sample write SKIPPED on pad t0/d0/pC1 — it has 2 layers, so which " +
      'one to load is ambiguous. Name one: "t0/d0/pC1/c0", "t0/d0/pC1/c1".';

    const result = updateDevice({
      path: "t0/d0/pC1",
      params: [{ name: "sample", value: KICK }],
      force: true,
    });

    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      params: [{ name: "sample", reason }],
    });
    expect(capturedWarnings()).toContain(reason);

    for (const chain of chains) {
      expect(chain.call).not.toHaveBeenCalledWith("insert_device", "Simpler");
    }
  });

  // A pad with no chain at all is where the rack's `pC1/sample` shortcut used
  // to differ: it made the chain, and the pad path said Live ignores the write.
  it("makes the chain a pad with none needs, by path and by id", () => {
    for (const target of [{ path: "t0/d0/pC1" }, { id: "pad-36" }]) {
      const rack = registerUnbuiltPadChain();

      const result = updateDevice({
        ...target,
        params: [{ name: "sample", value: KICK }],
      });

      expect(rack.call).toHaveBeenCalledWith("insert_chain");
      expect(LiveAPI.from("id new-simpler").call).toHaveBeenCalledWith(
        "replace_sample",
        KICK,
      );
      expect(result).toStrictEqual({
        id: "pad-36",
        path: "t0/d0/pC1",
        params: [{ name: "sample", value: KICK }],
      });
    }
  });

  // Nothing else asks for a chain, so nothing else gets one.
  it("still says an empty pad ignores a write that names no sample", () => {
    const rack = registerUnbuiltPadChain();

    expect(updateDevice({ path: "t0/d0/pC1", gainDb: -6 })).toStrictEqual([]);
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
    expect(capturedWarnings()).toContain(
      "drum pad t0/d0/pC1 (id pad-36) has no chains, so there is nothing " +
        "to update — Live ignores writes to an empty pad",
    );
  });

  it("still refuses every other param on a chain", () => {
    registerPadRack();

    updateDevice({
      path: "t0/d0/pC1/c0",
      params: [{ name: "Volume", value: "50" }],
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "'params' not applicable to DrumChain t0/d0/pC1/c0",
      ),
    );
  });
});

describe("updateDevice - a sample addressed by the device's own path", () => {
  it("says the device's sample can't be set, and names the pad call that can", () => {
    const [chain] = registerPadRack();

    registerDrumSamplerOn(chain as RegisteredMockObject);

    const reason =
      "sample write SKIPPED on t0/d0/pC1/c0/d0 (id ds-1) — it is a Drum " +
      "Sampler, whose sample the Live API can't set. Loading a sample here " +
      "REPLACES the device with a Simpler and loses all its settings, so ask " +
      "the user first. The pad, not the device, is what takes a sample: " +
      'path:"t0/d0" with params:[{name:"pC1/c0/sample", ' +
      'value:"<the sample>"}].';

    const result = updateDevice({
      path: "t0/d0/pC1/d0",
      params: [{ name: "sample", value: KICK }],
    });

    expect(result).toStrictEqual({
      id: "ds-1",
      path: "t0/d0/pC1/d0",
      params: [{ name: "sample", reason }],
    });
    expect(capturedWarnings()).toContain(reason);
  });

  // A device path names a device that is already there. Creating or replacing
  // one from it would make every read-device path a destructive address.
  it("creates and replaces nothing", () => {
    const [chain] = registerPadRack();
    const drumSampler = registerDrumSamplerOn(chain as RegisteredMockObject);

    updateDevice({
      path: "t0/d0/pC1/d0",
      params: [{ name: "sample", value: KICK }],
      force: true,
    });

    expect(chain?.call).not.toHaveBeenCalledWith("delete_device", 0);
    expect(chain?.call).not.toHaveBeenCalledWith("insert_device", "Simpler");
    expect(drumSampler.call).not.toHaveBeenCalledWith("replace_sample", KICK);
  });

  // The pad call targets the pad's instrument, so it leaves an effect alone —
  // promising it would be replaced would be a lie.
  it("leaves the destruction warning off a device that is not the instrument", () => {
    const [chain] = registerPadRack();

    (chain as RegisteredMockObject).properties.devices = children("arp-1");
    registerMockObject("arp-1", {
      path: livePath.track(0).device(0).chain(0).device(0),
      type: "Device",
      properties: { class_display_name: "Arpeggiator" },
    });

    const reason =
      "sample write SKIPPED on t0/d0/pC1/c0/d0 (id arp-1) — it is an " +
      "Arpeggiator, whose sample the Live API can't set. A pad's sample " +
      "belongs to its instrument, not to this device — address the pad: " +
      'path:"t0/d0" with params:[{name:"pC1/c0/sample", ' +
      'value:"<the sample>"}].';

    updateDevice({
      path: "t0/d0/pC1/d0",
      params: [{ name: "sample", value: KICK }],
    });

    expect(capturedWarnings()).toContain(reason);
  });

  it("says only that much for a device that is not on a pad", () => {
    registerMockObject("op-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { class_display_name: "Operator" },
    });

    const reason =
      "sample write SKIPPED on t0/d0 (id op-1) — it is an Operator, whose " +
      "sample the Live API can't set. Only a Simpler in single-sample mode " +
      "has one to set.";

    expect(
      updateDevice({ id: "op-1", params: [{ name: "sample", value: KICK }] }),
    ).toStrictEqual({
      id: "op-1",
      path: "t0/d0",
      params: [{ name: "sample", reason }],
    });
    expect(capturedWarnings()).toContain(reason);
  });
});
