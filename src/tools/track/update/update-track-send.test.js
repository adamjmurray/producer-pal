import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import { updateTrack } from "./update-track.js";
import "../../../live-api-adapter/live-api-extensions.js";

describe("updateTrack - send properties", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
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
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
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

  it("should throw error when only sendGainDb is provided", () => {
    expect(() =>
      updateTrack({
        ids: "123",
        sendGainDb: -12,
      }),
    ).toThrow("sendGainDb and sendReturn must both be specified");
  });

  it("should throw error when only sendReturn is provided", () => {
    expect(() =>
      updateTrack({
        ids: "123",
        sendReturn: "A",
      }),
    ).toThrow("sendGainDb and sendReturn must both be specified");
  });

  it("should throw error when return track not found", () => {
    expect(() =>
      updateTrack({
        ids: "123",
        sendGainDb: -12,
        sendReturn: "C",
      }),
    ).toThrow('no return track found matching "C"');
  });

  it("should throw error when track has no sends", () => {
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

    expect(() =>
      updateTrack({
        ids: "123",
        sendGainDb: -12,
        sendReturn: "A",
      }),
    ).toThrow("track 123 has no sends");
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
});
