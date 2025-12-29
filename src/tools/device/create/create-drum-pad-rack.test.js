
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  VALID_DEVICES,
} from "../../constants.js";
import {
  createDrumPadInstrumentRack,
  createKickLayeredRack,
} from "./create-drum-pad-rack.js";

const originalLiveAPI = global.LiveAPI;

describe("createDrumPadInstrumentRack", () => {
  let state;
  let callLog;
  let idCounter;

  class StubLiveAPI {
    constructor(path) {
      this.path = path;
      this._id = path?.startsWith("id ") ? path.slice(3) : path?.replaceAll(/\s+/g, "/");
    }

    static from(idOrPath) {
      if (Array.isArray(idOrPath)) {
        if (idOrPath[0] === "id") {
          return new StubLiveAPI(`id ${idOrPath[1]}`);
        }

        throw new Error("Invalid LiveAPI.from array");
      }

      if (typeof idOrPath === "number") {
        return new StubLiveAPI(`id ${idOrPath}`);
      }

      if (typeof idOrPath === "string" && !idOrPath.startsWith("id ") && /^\d+$/.test(idOrPath)) {
        return new StubLiveAPI(`id ${idOrPath}`);
      }

      return new StubLiveAPI(idOrPath);
    }

    get id() {
      return this._id;
    }

    _entry() {
      return state[this.path] ?? state[`id ${this._id}`];
    }

    exists() {
      return this._entry() != null;
    }

    get(property) {
      const entry = this._entry();

      if (!entry) {
        return [];
      }

      const value = entry[property];

      if (value === undefined) {
        return [];
      }

      if (property === "drum_pads" || property === "chains" || property === "devices") {
        return value.flatMap((id) => ["id", id]);
      }

      return [value];
    }

    getProperty(property) {
      return this.get(property)[0];
    }

    set(property, value) {
      const entry = this._entry();

      if (entry) {
        entry[property] = Array.isArray(value) ? value[0] ?? value : value;
      }
    }

    setAll(properties) {
      for (const [key, value] of Object.entries(properties)) {
        if (value != null) {
          this.set(key, value);
        }
      }
    }

    getChildIds(name) {
      const entry = this._entry();
      const list = entry?.[name];

      return list ? list.map((id) => `id ${id}`) : [];
    }

    getChildren(name) {
      return this.getChildIds(name).map((id) => new StubLiveAPI(id));
    }

    call(method, ...args) {
      callLog.push({ path: this.path, method, args });
      const entry = this._entry();

      switch (method) {
        case "create_chain": {
          const chainId = `chain-${++idCounter}`;
          state[`id ${chainId}`] = { devices: [], name: null };

          if (entry) {
            entry.chains ??= [];
            entry.chains.push(chainId);
          }

          return ["id", chainId];
        }
        case "create_instrument_rack": {
          const chainId = `chain-${++idCounter}`;
          state[`id ${chainId}`] = { devices: [], name: null };

          if (entry) {
            entry.chains ??= [];
            entry.chains.push(chainId);
          }

          return ["id", chainId];
        }
        case "insert_device": {
          const deviceName = args[0];
          const deviceId = `device-${++idCounter}`;
          const isInstrument = VALID_DEVICES.instruments.includes(deviceName);

          state[`id ${deviceId}`] = {
            class_display_name: deviceName,
            type: isInstrument
              ? LIVE_API_DEVICE_TYPE_INSTRUMENT
              : LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            can_have_chains: deviceName.includes("Rack") ? 1 : 0,
            chains: deviceName.includes("Rack") ? [] : undefined,
            devices: [],
            visible_macro_count: deviceName.includes("Rack") ? 0 : undefined,
          };

          if (entry) {
            if (this.path.includes("drum_pads")) {
              entry.chains ??= [];

              if (entry.chains.length === 0) {
                const chainId = `chain-${++idCounter}`;
                state[`id ${chainId}`] = { devices: [], name: null };
                entry.chains.push(chainId);
              }

              const padChainId = entry.chains[0];
              const padChain = state[`id ${padChainId}`];
              const insertIndex = args[1] ?? padChain.devices.length;
              padChain.devices.splice(insertIndex, 0, deviceId);
            } else {
              entry.devices ??= [];
              const insertIndex = args[1] ?? entry.devices.length;
              entry.devices.splice(insertIndex, 0, deviceId);
            }
          }

          return ["id", deviceId];
        }
        case "delete_device": {
          if (entry?.devices) {
            entry.devices.splice(args[0], 1);
          }

          return null;
        }
        case "add_macro": {
          if (entry) {
            entry.visible_macro_count = (entry.visible_macro_count ?? 0) + 2;
          }

          return null;
        }
        case "remove_macro": {
          if (entry) {
            entry.visible_macro_count = Math.max(0, (entry.visible_macro_count ?? 0) - 2);
          }

          return null;
        }
        default:
          throw new Error(`Unhandled LiveAPI.call: ${method}`);
      }
    }
  }

  beforeEach(() => {
    idCounter = 0;
    callLog = [];
    state = {
      "live_set tracks 0 devices 0": { drum_pads: ["pad-c1"] },
      "live_set tracks 0 devices 0 drum_pads 36": {
        note: 36,
        name: "C1",
        chains: ["pad-chain-1"],
      },
      "id pad-chain-1": {
        devices: ["existing-instrument"],
      },
      "id existing-instrument": {
        class_display_name: "Simpler",
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        can_have_chains: 0,
        devices: [],
      },
    };

    global.LiveAPI = StubLiveAPI;
  });

  afterEach(() => {
    global.LiveAPI = originalLiveAPI;
  });

  it("replaces existing pad device with an instrument rack and builds layered chains", () => {
    const result = createDrumPadInstrumentRack({
      trackIndex: 0,
      padNote: "C1",
      layers: [
        { name: "Layer A", instrument: "Operator", effects: ["Auto Filter"] },
        { name: "Layer B", instrument: "Analog", effects: ["Auto Filter"] },
      ],
      masterEffects: ["Compressor"],
    });

    const padChain = state["id pad-chain-1"];
    expect(padChain.devices).toHaveLength(2); // rack + compressor

    const rackId = result.rackId;
    const rackEntry = state[`id ${rackId}`];
    expect(rackEntry.chains).toHaveLength(2);

    const firstChain = state[`id ${rackEntry.chains[0]}`];
    expect(firstChain.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
      "Operator",
      "Auto Filter",
    ]);

    const secondChain = state[`id ${rackEntry.chains[1]}`];
    expect(secondChain.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
      "Analog",
      "Auto Filter",
    ]);

    expect(callLog.find((call) => call.method === "delete_device")).toBeTruthy();
    expect(result.masterEffects[0].name).toBe("Compressor");
  });

  it("creates the kick helper rack with three operator layers and compressor", () => {
    const result = createKickLayeredRack({ trackIndex: 0, padNote: "C1" });

    const rackEntry = state[`id ${result.rackId}`];
    expect(rackEntry.chains).toHaveLength(3);

    rackEntry.chains.forEach((chainId) => {
      const devices = state[`id ${chainId}`].devices.map(
        (id) => state[`id ${id}`].class_display_name,
      );
      expect(devices[0]).toBe("Operator");
      expect(devices[1]).toBe("Auto Filter");
    });

    const padChain = state["id pad-chain-1"];
    const padDevices = padChain.devices.map((id) => state[`id ${id}`].class_display_name);
    expect(padDevices).toEqual(["Instrument Rack", "Compressor"]);
  });

  it("creates nested rack layers with macros and effects", () => {
    const result = createDrumPadInstrumentRack({
      trackIndex: 0,
      padNote: "C1",
      macroCount: 4,
      layers: [
        {
          name: "Layer A",
          sublayers: [
            { name: "Sub A1", instrument: "Operator", effects: ["Auto Filter"] },
            { name: "Sub A2", instrument: "Analog" },
          ],
          macroCount: 2,
          effects: ["Compressor"],
        },
        { name: "Layer B", instrument: "Sampler" },
      ],
      masterEffects: ["Reverb"],
    });

    const padChain = state["id pad-chain-1"];
    expect(padChain.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
      "Instrument Rack",
      "Reverb",
    ]);

    const rackEntry = state[`id ${result.rackId}`];
    expect(rackEntry.visible_macro_count).toBe(4);
    expect(rackEntry.chains).toHaveLength(2);

    const layerAChain = state[`id ${rackEntry.chains[0]}`];
    expect(layerAChain.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
      "Instrument Rack",
      "Compressor",
    ]);

    const nestedRackId = layerAChain.devices[0];
    const nestedRackEntry = state[`id ${nestedRackId}`];
    expect(nestedRackEntry.visible_macro_count).toBe(2);
    expect(nestedRackEntry.chains).toHaveLength(2);

    const firstSubChain = state[`id ${nestedRackEntry.chains[0]}`];
    expect(firstSubChain.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
      "Operator",
      "Auto Filter",
    ]);

    const macroCalls = callLog.filter((call) => call.method === "add_macro");
    expect(macroCalls).toHaveLength(3);
  });

  it("creates a pad chain via create_instrument_rack when create_chain is unsupported", () => {
    state["live_set tracks 0 devices 0 drum_pads 36"].chains = [];
    delete state["id pad-chain-1"];

    const originalCall = StubLiveAPI.prototype.call;

    try {
      StubLiveAPI.prototype.call = function (method, ...args) {
        if (
          method === "create_chain" &&
          this.path === "live_set tracks 0 devices 0 drum_pads 36"
        ) {
          throw new Error("create_chain unsupported");
        }

        if (
          method === "insert_device" &&
          this.path === "live_set tracks 0 devices 0 drum_pads 36"
        ) {
          throw new Error("insert_device unsupported");
        }

        return originalCall.call(this, method, ...args);
      };

      const result = createDrumPadInstrumentRack({
        trackIndex: 0,
        padNote: "C1",
        layers: [{ instrument: "Operator" }],
        masterEffects: ["Compressor"],
      });

      const padChains = state["live_set tracks 0 devices 0 drum_pads 36"].chains;
      expect(padChains).toHaveLength(1);

      const padChainEntry = state[`id ${padChains[0]}`];
      expect(padChainEntry.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
        "Instrument Rack",
        "Compressor",
      ]);
      expect(result.chains).toHaveLength(1);
      expect(callLog.find((call) => call.method === "create_instrument_rack")).toBeTruthy();
    } finally {
      StubLiveAPI.prototype.call = originalCall;
    }
  });

  it("creates a pad chain via insert_device when create_chain is unsupported", () => {
    state["live_set tracks 0 devices 0 drum_pads 36"].chains = [];
    delete state["id pad-chain-1"];

    const originalCall = StubLiveAPI.prototype.call;

    try {
      StubLiveAPI.prototype.call = function (method, ...args) {
        if (
          method === "create_chain" &&
          this.path === "live_set tracks 0 devices 0 drum_pads 36"
        ) {
          throw new Error("create_chain unsupported");
        }

        return originalCall.call(this, method, ...args);
      };

      const result = createDrumPadInstrumentRack({
        trackIndex: 0,
        padNote: "C1",
        layers: [{ instrument: "Operator" }],
        masterEffects: ["Compressor"],
      });

      const padChains = state["live_set tracks 0 devices 0 drum_pads 36"].chains;
      expect(padChains).toHaveLength(1);

      const padChainEntry = state[`id ${padChains[0]}`];
      expect(padChainEntry.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
        "Instrument Rack",
        "Compressor",
      ]);
      expect(result.chains).toHaveLength(1);
    } finally {
      StubLiveAPI.prototype.call = originalCall;
    }
  });

  it("throws when pad note is invalid", () => {
    expect(() =>
      createDrumPadInstrumentRack({
        trackIndex: 0,
        padNote: "H9",
        layers: [{ instrument: "Operator" }],
      }),
    ).toThrow(/padNote/);
  });
});
