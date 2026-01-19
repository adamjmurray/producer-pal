import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";
import { updateDevice } from "./update-device.js";
import "#src/live-api-adapter/live-api-extensions.js";

describe("updateDevice - drum chain moving", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock drum rack structure
    // Track 0 has a drum rack at device 0
    // The drum rack has chains with different in_note values
    liveApiType.mockImplementation(function () {
      if (this._path === "live_set tracks 0 devices 0") return "RackDevice";
      // Match both path formats for chains
      if (this._path?.includes("chains") || this._path?.match(/^id chain-/))
        return "DrumChain";

      return "Device";
    });

    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 0 devices 0") return "drumrack-id";
      if (this._path === "live_set tracks 0 devices 0 chains 0")
        return "chain-0";
      if (this._path === "live_set tracks 0 devices 0 chains 1")
        return "chain-1";
      if (this._path === "live_set tracks 0 devices 0 chains 2")
        return "chain-2";
      if (this._path === "id chain-0") return "chain-0";
      if (this._path === "id chain-1") return "chain-1";
      if (this._path === "id chain-2") return "chain-2";

      return "0";
    });

    liveApiPath.mockImplementation(function () {
      if (this._path === "id chain-0")
        return "live_set tracks 0 devices 0 chains 0";
      if (this._path === "id chain-1")
        return "live_set tracks 0 devices 0 chains 1";
      if (this._path === "id chain-2")
        return "live_set tracks 0 devices 0 chains 2";

      return this._path;
    });

    liveApiGet.mockImplementation(function (prop) {
      // Drum rack properties
      if (this._path === "live_set tracks 0 devices 0") {
        if (prop === "can_have_drum_pads") return [1];
        if (prop === "chains")
          return ["id", "chain-0", "id", "chain-1", "id", "chain-2"];
      }

      // Chain in_note values: chain-0 and chain-1 are on C1 (36), chain-2 is on D1 (38)
      if (
        (this._path?.includes("chains 0") || this._path === "id chain-0") &&
        prop === "in_note"
      )
        return [36]; // C1

      if (
        (this._path?.includes("chains 1") || this._path === "id chain-1") &&
        prop === "in_note"
      )
        return [36]; // C1 (layered)

      if (
        (this._path?.includes("chains 2") || this._path === "id chain-2") &&
        prop === "in_note"
      )
        return [38]; // D1

      return [0];
    });
  });

  it("should move a single drum chain to a different pad", () => {
    const result = updateDevice({
      path: "t0/d0/pC1/c0",
      toPath: "t0/d0/pD1",
    });

    // Should set in_note to 38 (D1)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id chain-0" }),
      "in_note",
      38,
    );
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should move all chains in a drum pad when using pad path", () => {
    const result = updateDevice({
      path: "t0/d0/pC1",
      toPath: "t0/d0/pE1",
    });

    // Should set in_note to 40 (E1) on both chains with in_note=36
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id chain-0" }),
      "in_note",
      40,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id chain-1" }),
      "in_note",
      40,
    );
    // chain-2 has in_note=38 (D1), should not be affected
    expect(liveApiSet).not.toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id chain-2" }),
      "in_note",
      expect.anything(),
    );
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should warn and skip when toPath is not a drum pad path", () => {
    // Should not throw, just warn and skip the move
    const result = updateDevice({
      path: "t0/d0/pC1/c0",
      toPath: "t1",
    });

    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should warn and skip when trying to move a regular Chain to a drum pad", () => {
    liveApiType.mockReturnValue("Chain");
    liveApiId.mockReturnValue("123");

    // Should not throw, just warn and skip the move
    const result = updateDevice({
      ids: "123",
      toPath: "t0/d0/pD1",
    });

    expect(result).toStrictEqual({ id: "123" });
  });
});
