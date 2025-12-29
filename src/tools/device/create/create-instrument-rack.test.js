import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInstrumentRack } from "./create-instrument-rack.js";

const originalLiveAPI = global.LiveAPI;

describe("createInstrumentRack", () => {
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

      if (property === "chains" || property === "devices") {
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
        case "insert_device": {
          const deviceName = args[0];
          const deviceId = `device-${++idCounter}`;
          const isRack = deviceName.includes("Rack");

          state[`id ${deviceId}`] = {
            class_display_name: deviceName,
            type: isRack ? "instrument" : "instrument",
            can_have_chains: isRack ? 1 : 0,
            chains: isRack ? [] : undefined,
            devices: [],
            visible_macro_count: isRack ? 0 : undefined,
          };

          if (entry) {
            if (entry.can_have_chains === 1) {
              entry.chains ??= [];
              const chainId = `chain-${++idCounter}`;
              state[`id ${chainId}`] = { devices: [], name: null };
              entry.chains.push(chainId);
              const chain = state[`id ${chainId}`];
              const insertIndex = args[1] ?? chain.devices.length;
              chain.devices.splice(insertIndex, 0, deviceId);
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
      "live_set tracks 0": {
        devices: [],
      },
    };

    global.LiveAPI = StubLiveAPI;
  });

  afterEach(() => {
    global.LiveAPI = originalLiveAPI;
  });

  it("builds rack with layered chains, nested macros, and master effects", () => {
    const result = createInstrumentRack({
      trackIndex: 0,
      macroCount: 4,
      rackName: "Main Rack",
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

    const trackEntry = state["live_set tracks 0"];
    expect(trackEntry.devices.map((id) => state[`id ${id}`].class_display_name)).toEqual([
      "Instrument Rack",
      "Reverb",
    ]);

    const rackEntry = state[`id ${result.rackId}`];
    expect(rackEntry.name).toBe("Main Rack");
    expect(rackEntry.class_display_name).toBe("Instrument Rack");
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

  it("builds rack chains via insert_device when create_chain is unsupported", () => {
    const originalCall = StubLiveAPI.prototype.call;

    try {
      StubLiveAPI.prototype.call = function (method, ...args) {
        if (method === "create_chain") {
          throw new Error("create_chain unsupported");
        }

        return originalCall.call(this, method, ...args);
      };

      const result = createInstrumentRack({
        trackIndex: 0,
        layers: [{ instrument: "Operator" }, { instrument: "Analog" }],
        masterEffects: ["Reverb"],
      });

      const trackDevices = state["live_set tracks 0"].devices.map(
        (id) => state[`id ${id}`].class_display_name,
      );
      expect(trackDevices).toEqual(["Instrument Rack", "Reverb"]);

      const rackEntry = state[`id ${result.rackId}`];
      expect(rackEntry.chains).toHaveLength(2);

      const firstChainDevices = state[`id ${rackEntry.chains[0]}`].devices.map(
        (id) => state[`id ${id}`].class_display_name,
      );
      expect(firstChainDevices[0]).toBe("Operator");

      const secondChainDevices = state[`id ${rackEntry.chains[1]}`].devices.map(
        (id) => state[`id ${id}`].class_display_name,
      );
      expect(secondChainDevices[0]).toBe("Analog");
    } finally {
      StubLiveAPI.prototype.call = originalCall;
    }
  });

  it("inserts rack at specific index and places master effects after it", () => {
    state["live_set tracks 0"].devices = ["existing-1", "existing-2"];
    state["id existing-1"] = { class_display_name: "Utility", devices: [] };
    state["id existing-2"] = { class_display_name: "Compressor", devices: [] };

    const result = createInstrumentRack({
      trackIndex: 0,
      deviceIndex: 1,
      layers: [{ instrument: "Operator" }],
      masterEffects: ["Reverb"],
    });

    const devices = state["live_set tracks 0"].devices.map(
      (id) => state[`id ${id}`].class_display_name,
    );

    expect(devices).toEqual(["Utility", "Instrument Rack", "Reverb", "Compressor"]);
    expect(result.deviceIndex).toBe(1);
    expect(result.masterEffects[0].name).toBe("Reverb");
  });

  it("throws when track is missing", () => {
    delete state["live_set tracks 0"];

    expect(() =>
      createInstrumentRack({
        trackIndex: 0,
        layers: [{ instrument: "Operator" }],
      }),
    ).toThrow(/does not exist/);
  });
});
