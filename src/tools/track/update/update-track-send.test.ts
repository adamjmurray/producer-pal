// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { updateTrack } from "./update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateTrack - send properties", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      // For ID-based paths (from getChildren), return the ID portion
      if (this._path?.startsWith("id ")) {
        return this._path.slice(3);
      }

      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 1 mixer_device":
          return "mixer_2";
        case "live_set":
          return "liveSet";
        case "live_set return_tracks 0":
          return "return_A";
        case "live_set return_tracks 1":
          return "return_B";
        default:
          return this._id!;
      }
    });

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this._id) {
        case "123":
          return "live_set tracks 0";
        case "456":
          return "live_set tracks 1";
        case "mixer_1":
          return "live_set tracks 0 mixer_device";
        case "mixer_2":
          return "live_set tracks 1 mixer_device";
        default:
          return this._path;
      }
    });

    mockLiveApiGet({
      mixer_1: {
        sends: children("send_1", "send_2"),
      },
      mixer_2: {
        sends: children("send_3", "send_4"),
      },
      liveSet: {
        return_tracks: children("return_A", "return_B"),
      },
      return_A: {
        name: "A-Reverb",
      },
      return_B: {
        name: "B-Delay",
      },
    });
  });

  it("should set send gain with exact return name", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "A-Reverb",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_1" }),
      "display_value",
      -12,
    );
  });

  it("should set send gain with letter prefix", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -6,
      sendReturn: "A",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_1" }),
      "display_value",
      -6,
    );
  });

  it("should set second send with letter prefix", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -3,
      sendReturn: "B",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_2" }),
      "display_value",
      -3,
    );
  });

  it("should set send gain to minimum value", () => {
    updateTrack({
      ids: "123",
      sendGainDb: -70,
      sendReturn: "A",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_1" }),
      "display_value",
      -70,
    );
  });

  it("should set send gain to maximum value (0 dB)", () => {
    updateTrack({
      ids: "123",
      sendGainDb: 0,
      sendReturn: "A",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_1" }),
      "display_value",
      0,
    );
  });

  it("should warn and skip when only sendGainDb is provided", () => {
    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when only sendReturn is provided", () => {
    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendReturn: "A",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when return track not found", () => {
    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "C",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when track has no sends", () => {
    mockLiveApiGet({
      mixer_1: {
        sends: [], // No sends
      },
      liveSet: {
        return_tracks: children("return_A"),
      },
      return_A: {
        name: "A-Reverb",
      },
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should set sends on multiple tracks", () => {
    updateTrack({
      ids: "123,456",
      sendGainDb: -6,
      sendReturn: "A",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_1" }),
      "display_value",
      -6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_3" }),
      "display_value",
      -6,
    );
  });

  it("should combine send update with other properties", () => {
    updateTrack({
      ids: "123",
      name: "Test Track",
      sendGainDb: -12,
      sendReturn: "B",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Test Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: "send_2" }),
      "display_value",
      -12,
    );
  });

  it("should not set send when neither param is provided", () => {
    updateTrack({
      ids: "123",
      name: "Test Track",
    });

    // Should only set name, not any send values
    expect(liveApiSet).not.toHaveBeenCalledWith("display_value", -12);
  });

  it("should warn and skip when mixer device does not exist", () => {
    // Override liveApiId to return "0" for mixer path
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set tracks 0 mixer_device") {
        return "0"; // Non-existent
      }

      if (this._path?.startsWith("id ")) {
        return this._path.slice(3);
      }

      switch (this._path) {
        case "id 123":
          return "123";
        default:
          return this._id!;
      }
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when send index exceeds available sends", () => {
    // Setup: 3 return tracks but only 2 sends
    mockLiveApiGet({
      mixer_1: {
        sends: children("send_1", "send_2"), // Only 2 sends (indices 0 and 1)
      },
      liveSet: {
        return_tracks: children("return_A", "return_B", "return_C"), // 3 return tracks
      },
      return_A: {
        name: "A-Reverb",
      },
      return_B: {
        name: "B-Delay",
      },
      return_C: {
        name: "C-Echo", // Third return track - index 2, but only 2 sends available
      },
    });

    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path?.startsWith("id ")) {
        return this._path.slice(3);
      }

      switch (this._path) {
        case "id 123":
          return "123";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set":
          return "liveSet";
        case "live_set return_tracks 0":
          return "return_A";
        case "live_set return_tracks 1":
          return "return_B";
        case "live_set return_tracks 2":
          return "return_C";
        default:
          return this._id!;
      }
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      ids: "123",
      sendGainDb: -12,
      sendReturn: "C", // Matches return track at index 2
    });

    expect(result).toStrictEqual({ id: "123" });
  });
});
