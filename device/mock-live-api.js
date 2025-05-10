// device/mock-live-api.js
import { vi } from "vitest";

export const liveApiId = vi.fn();
export const liveApiCall = vi.fn();
export const liveApiGet = vi.fn();

export class LiveAPI {
  constructor(path) {
    this.path = path;
    this.unquotedpath = path;
    this.call = liveApiCall;
    this.get = liveApiGet;
  }
  get id() {
    return liveApiId();
  }
  get type() {
    if (/^live_set tracks \d+ clip_slots \d+$/.test(this.unquotedpath)) {
      return "ClipSlot";
    }
    if (/^live_set tracks \d+ clip_slots \d+ clip$/.test(this.unquotedpath)) {
      return "Clip";
    }
    return `TODO: Unknown type for path: "${this.unquotedpath}"`;
  }
}

export function mockLiveApiGet(overridesByType = {}) {
  liveApiGet.mockImplementation(function (prop) {
    if (overridesByType[this.type]?.[prop]) {
      return overridesByType[this.type]?.[prop];
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
