// device/mock-live-api.js
import { vi } from "vitest";

export class MockSequence extends Array {}

export const liveApiId = vi.fn();
export const liveApiGet = vi.fn();
export const liveApiSet = vi.fn();
export const liveApiCall = vi.fn();

export class LiveAPI {
  #id;
  constructor(path) {
    this.path = path;
    this.unquotedpath = path;
    this.get = liveApiGet;
    this.set = liveApiSet;
    this.call = liveApiCall;
    if (path.startsWith("id ")) this.#id = path.slice(3);
  }

  get id() {
    return this.#id ?? liveApiId();
  }

  get type() {
    if (this.unquotedpath === "live_set") {
      return "LiveSet"; // AKA the Song
    }
    if (/^live_set tracks \d+ clip_slots \d+$/.test(this.unquotedpath)) {
      return "ClipSlot";
    }
    if (/^live_set tracks \d+ clip_slots \d+ clip$/.test(this.unquotedpath)) {
      return "Clip";
    }
    return `TODO: Unknown type for path: "${this.unquotedpath}"`;
  }
}

export function mockLiveApiGet(overrides = {}) {
  liveApiGet.mockImplementation(function (prop) {
    const overridesByProp = overrides[this.type] ?? overrides[this.id] ?? overrides[this.unquotedpath];
    if (overridesByProp != null) {
      const override = overridesByProp[prop];
      if (override != null) {
        // optionally support mocking a sequence of return values:
        if (override instanceof MockSequence) {
          overridesByProp.__callCount__ ??= {};
          const callIndex = (overridesByProp.__callCount__[prop] ??= 0);
          const value = override[callIndex];
          overridesByProp.__callCount__[prop]++;
          return [value];
        }
        // or non-arrays always return the constant value for multiple calls to LiveAPI.get():
        return Array.isArray(override) ? override : [override];
      }
    }
    switch (this.type) {
      case "ClipSlot":
        switch (prop) {
          case "has_clip":
            return [1];
        }
        return [0];
      case "Clip":
        switch (prop) {
          case "name":
            return ["Test Clip"];
          case "is_audio_clip":
            return [0];
          case "is_midi_clip":
            return [1];
          case "color":
            return [4047616];
          case "length":
            return [4];
          case "looping":
            return [0];
          case "start_marker":
            return [1];
          case "end_marker":
            return [5];
          case "loop_start":
            return [1];
          case "loop_end":
            return [5];
          case "signature_numerator":
            return [4];
          case "signature_denominator":
            return [4];
          default:
            return [0];
        }
      default:
        return undefined;
    }
  });
}

export function children(...childIds) {
  return childIds.flatMap((id) => ["id", id]);
}
