import { vi } from "vitest";

export class MockSequence extends Array {}

export const liveApiId = vi.fn();
export const liveApiPath = vi.fn();
export const liveApiType = vi.fn();
export const liveApiGet = vi.fn();
export const liveApiSet = vi.fn();
export const liveApiCall = vi.fn();

export class LiveAPI {
  constructor(path) {
    this._path = path;
    this.get = liveApiGet;
    this.set = liveApiSet;
    this.call = liveApiCall;
    this._id = path?.startsWith("id ")
      ? path.slice(3)
      : path?.replaceAll(/\s+/g, "/");
  }

  static from(idOrPath) {
    // Handle array format ["id", "123"] from Live API calls
    if (Array.isArray(idOrPath)) {
      if (idOrPath.length === 2 && idOrPath[0] === "id") {
        return new LiveAPI(`id ${idOrPath[1]}`);
      }
      throw new Error(
        `Invalid array format for LiveAPI.from(): expected ["id", value], got [${idOrPath}]`,
      );
    }

    if (
      typeof idOrPath === "number" ||
      (typeof idOrPath === "string" && /^\d+$/.test(idOrPath))
    ) {
      return new LiveAPI(`id ${idOrPath}`);
    }
    return new LiveAPI(idOrPath);
  }

  exists() {
    return this.id !== "id 0" && this.id !== "0";
  }

  get id() {
    return liveApiId.apply(this) ?? this._id;
  }

  get path() {
    return liveApiPath.apply(this) ?? this._path;
  }

  get unquotedpath() {
    return this.path;
  }

  get trackIndex() {
    const match = this.path.match(/live_set tracks (\d+)/);
    return match ? Number(match[1]) : null;
  }

  getChildIds(name) {
    const idArray = this.get(name);

    if (!Array.isArray(idArray)) {
      return [];
    }

    const children = [];
    for (let i = 0; i < idArray.length; i += 2) {
      if (idArray[i] === "id") {
        children.push(`id ${idArray[i + 1]}`);
      }
    }
    return children;
  }

  get sceneIndex() {
    // Try scene path first
    let match = this.path.match(/live_set scenes (\d+)/);
    if (match) {
      return Number(match[1]);
    }

    // Also try clip_slots path (scene index is the clip slot index in session view)
    match = this.path.match(/live_set tracks \d+ clip_slots (\d+)/);
    return match ? Number(match[1]) : null;
  }

  get type() {
    const mockedType = liveApiType.apply(this);
    if (mockedType !== undefined) {
      return mockedType;
    }
    if (this.path === "live_set") {
      return "LiveSet"; // AKA the Song. TODO: This should be "Song" to reflect how LiveAPI actually behaves
    }
    if (this.path === "live_set view") {
      return "SongView";
    }
    if (this.path === "live_app") {
      return "Application";
    }
    if (this.path === "live_app view") {
      return "AppView";
    }
    if (/^live_set tracks \d+$/.test(this.path)) {
      return "Track";
    }
    if (/^live_set scenes \d+$/.test(this.path)) {
      return "Scene";
    }
    if (/^live_set tracks \d+ clip_slots \d+$/.test(this.path)) {
      return "ClipSlot";
    }
    if (/^live_set tracks \d+ clip_slots \d+ clip$/.test(this.path)) {
      return "Clip";
    }
    if (/^live_set tracks \d+ arrangement_clips \d+$/.test(this.path)) {
      return "Clip";
    }
    return `TODO: Unknown type for path: "${this.path}"`;
  }
}

export function mockLiveApiGet(overrides = {}) {
  liveApiGet.mockImplementation(function (prop) {
    const overridesByProp =
      overrides[this.id] ?? overrides[this.path] ?? overrides[this.type];
    // console.log("[DEBUG] mockLiveApiGet", {
    //   prop,
    //   id: this.id,
    //   _id: this._id,
    //   path: this.path,
    //   _path: this._path,
    //   type: this.type,
    //   overrides,
    //   overridesByProp,
    // });
    if (overridesByProp != null) {
      const override = overridesByProp[prop];
      if (override !== undefined) {
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
          case "scenes":
            return children("scene1", "scene2");
          case "signature_numerator":
            return [4];
          case "signature_denominator":
            return [4];
        }
        break;
      case "AppView":
        switch (prop) {
          case "focused_document_view":
            return ["Session"];
        }
        break;
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
          case "muted_via_solo":
            return [0];
          case "arm":
            return [1];
          case "can_be_armed":
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
        }
        break;
      case "Scene":
        switch (prop) {
          case "name":
            return ["Test Scene"];
          case "clips":
            return [];
        }
        break;
      case "ClipSlot":
        switch (prop) {
          case "has_clip":
            return [1];
        }
        break;
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
          case "is_playing":
          case "is_triggered":
          case "is_recording":
          case "is_overdubbing":
          case "muted":
            return [0];
        }
        break;
    }
    return [0];
  });
}

export const expectedTrack = (overrides = {}) => ({
  id: "1",
  type: "midi",
  name: "Test Track",
  trackIndex: 0,
  color: "#FF0000",
  isArmed: true,
  arrangementFollower: true,
  playingSlotIndex: 2,
  firedSlotIndex: 3,
  arrangementClips: [],
  sessionClips: [],
  instrument: null,
  ...overrides,
});

export const expectedScene = (overrides = {}) => ({
  id: "1",
  name: "Test Scene",
  sceneIndex: 0,
  color: "#000000",
  isEmpty: false,
  tempo: "disabled",
  timeSignature: "disabled",
  ...overrides,
});

// For use with the default behavior in mockLiveApiGet() above
export const expectedClip = (overrides = {}) => ({
  id: "clip1",
  type: "midi",
  view: "session",
  trackIndex: 2,
  sceneIndex: 1,
  name: "Test Clip",
  color: "#3DC300",
  timeSignature: "4/4",
  looping: false,
  start: "1|2", // bar|beat format (1 Ableton beat = bar 1 beat 2)
  end: "2|2", // end_marker (5 beats = 2|2)
  length: "1:0", // 1 bar duration
  // playing, triggered, recording, overdubbing, muted omitted when false
  noteCount: 0,
  notes: "",
  ...overrides,
});

export function children(...childIds) {
  return childIds.flatMap((id) => ["id", id]);
}
