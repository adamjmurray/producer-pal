// device/mock-live-api.js
import { vi } from "vitest";

export class MockSequence extends Array {}

export const liveApiId = vi.fn();
export const liveApiPath = vi.fn();
export const liveApiGet = vi.fn();
export const liveApiSet = vi.fn();
export const liveApiCall = vi.fn();

export class LiveAPI {
  constructor(path) {
    this._path = path;
    this.get = liveApiGet;
    this.set = liveApiSet;
    this.call = liveApiCall;
    if (path.startsWith("id ")) this._id = path.slice(3);
  }

  get id() {
    return this._id ?? liveApiId.apply(this);
  }

  get path() {
    return liveApiPath.apply(this) ?? this._path;
  }

  get unquotedpath() {
    return this.path;
  }

  get type() {
    if (this.unquotedpath === "live_set") {
      return "LiveSet"; // AKA the Song
    }
    if (/^live_set tracks \d+$/.test(this.unquotedpath)) {
      return "Track";
    }
    if (/^live_set scenes \d+$/.test(this.unquotedpath)) {
      return "Scene";
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
      case "LiveSet":
        switch (prop) {
          case "tracks":
            return children("track1", "track2");
          default:
            return [0];
        }
      case "Track":
        switch (prop) {
          case "has_midi_input":
            return [1];
          case "clip_slots":
          case "devices":
            return [];
          case "name":
            return ["Test Track"];
          case "color":
            return [16711680];
          case "mute":
          case "solo":
            return [0];
          case "arm":
            return [1];
          case "is_foldable":
          case "is_grouped":
            return [0];
          case "group_track":
            return ["id", 0];
          case "playing_slot_index":
            return [2];
          case "fired_slot_index":
            return [3];
          default:
            return [0];
        }
      case "ClipSlot":
        switch (prop) {
          case "has_clip":
            return [1];
          default:
            return [0];
        }
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

export const expectedTrack = (overrides = {}) => ({
  id: "1",
  type: "midi",
  name: "Test Track",
  trackIndex: 0,
  color: "#FF0000",
  isMuted: false,
  isSoloed: false,
  isArmed: true,
  isGroup: false,
  isGroupMember: false,
  groupId: null,
  playingSlotIndex: 2,
  firedSlotIndex: 3,
  drumPads: null,
  arrangementClips: [],
  sessionClips: [],
  ...overrides,
});

// For use with the default behavior in mockLiveApiGet() above
export const expectedClip = (overrides = {}) => ({
  id: "clip1",
  type: "midi",
  location: "session",
  trackIndex: 2,
  clipSlotIndex: 1,
  name: "Test Clip",
  color: "#3DC300",
  length: 4,
  start_marker: 1,
  end_marker: 5,
  loop: false,
  loop_end: 5,
  loop_start: 1,
  is_playing: false,
  is_triggered: false,
  noteCount: 0,
  notes: "",
  ...overrides,
});

export function children(...childIds) {
  return childIds.flatMap((id) => ["id", id]);
}
