import { describe, expect, it } from "vitest";
import { liveApiId, liveApiPath, liveApiSet } from "../../test/mock-live-api";
import { updateScene } from "./update-scene";

describe("updateScene", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "id 789":
          return "789";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "123":
          return "live_set scenes 0";
        case "456":
          return "live_set scenes 1";
        case "789":
          return "live_set scenes 2";
        default:
          return this._path;
      }
    });
  });

  it("should update a single scene by ID", () => {
    const result = updateScene({
      ids: "123",
      name: "Updated Scene",
      color: "#FF0000",
      tempo: 140,
      timeSignature: "3/4",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Updated Scene",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo",
      140,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo_enabled",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_numerator",
      3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_denominator",
      4,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_enabled",
      true,
    );
    expect(result).toEqual({
      id: "123",
      sceneIndex: 0,
      name: "Updated Scene",
      color: "#FF0000",
      tempo: 140,
      timeSignature: "3/4",
    });
  });

  it("should update multiple scenes by comma-separated IDs", () => {
    const result = updateScene({
      ids: "123, 456",
      color: "#00FF00",
      tempo: 120,
    });

    expect(liveApiSet).toHaveBeenCalledTimes(6); // 3 calls per scene
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo",
      120,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo_enabled",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "tempo",
      120,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "tempo_enabled",
      true,
    );

    expect(result).toEqual([
      {
        id: "123",
        sceneIndex: 0,
        color: "#00FF00",
        tempo: 120,
      },
      {
        id: "456",
        sceneIndex: 1,
        color: "#00FF00",
        tempo: 120,
      },
    ]);
  });

  it("should handle 'id ' prefixed scene IDs", () => {
    const result = updateScene({
      ids: "id 123",
      name: "Prefixed ID Scene",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID Scene",
    );
    expect(result).toEqual({
      id: "123",
      sceneIndex: 0,
      name: "Prefixed ID Scene",
    });
  });

  it("should not update properties when not provided", () => {
    const result = updateScene({
      ids: "123",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Only Name Update",
    );
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "123",
      sceneIndex: 0,
      name: "Only Name Update",
    });
  });

  it("should disable tempo when -1 is passed", () => {
    const result = updateScene({
      ids: "123",
      tempo: -1,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "tempo_enabled",
      false,
    );
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo", expect.any(Number));
    expect(result).toEqual({
      id: "123",
      sceneIndex: 0,
      tempo: "disabled",
    });
  });

  it("should disable time signature when 'disabled' is passed", () => {
    const result = updateScene({
      ids: "123",
      timeSignature: "disabled",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "time_signature_enabled",
      false,
    );
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "time_signature_numerator",
      expect.any(Number),
    );
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "time_signature_denominator",
      expect.any(Number),
    );
    expect(result).toEqual({
      id: "123",
      sceneIndex: 0,
      timeSignature: "disabled",
    });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateScene({})).toThrow(
      "updateScene failed: ids is required",
    );
    expect(() => updateScene({ name: "Test" })).toThrow(
      "updateScene failed: ids is required",
    );
  });

  it("should throw error when scene ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => updateScene({ ids: "nonexistent" })).toThrow(
      'updateScene failed: scene with id "nonexistent" does not exist',
    );
  });

  it("should throw error when any scene ID in comma-separated list doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "id 0";
        default:
          // make default mocks appear to not exist:
          return "0";
      }
    });

    expect(() =>
      updateScene({ ids: "123, nonexistent", name: "Test" }),
    ).toThrow('updateScene failed: scene with id "nonexistent" does not exist');
  });

  it("should throw error when scene path cannot be parsed", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "123") return "invalid_path";
      return this._path;
    });

    expect(() => updateScene({ ids: "123", name: "Test" })).toThrow(
      'updateScene failed: could not determine sceneIndex for id "123" (path="invalid_path")',
    );
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => updateScene({ ids: "123", timeSignature: "invalid" })).toThrow(
      "Time signature must be in format",
    );
    expect(() => updateScene({ ids: "123", timeSignature: "3-4" })).toThrow(
      "Time signature must be in format",
    );
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateScene({ ids: "123", name: "Single" });
    const arrayResult = updateScene({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toEqual({
      id: "123",
      sceneIndex: 0,
      name: "Single",
    });
    expect(arrayResult).toEqual([
      {
        id: "123",
        sceneIndex: 0,
        name: "Multiple",
      },
      {
        id: "456",
        sceneIndex: 1,
        name: "Multiple",
      },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateScene({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toEqual([
      {
        id: "123",
        sceneIndex: 0,
        color: "#0000FF",
      },
      {
        id: "456",
        sceneIndex: 1,
        color: "#0000FF",
      },
      {
        id: "789",
        sceneIndex: 2,
        color: "#0000FF",
      },
    ]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    const result = updateScene({
      ids: "123,,456,  ,789",
      name: "Filtered",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(3); // Only 3 valid IDs
    expect(result).toEqual([
      {
        id: "123",
        sceneIndex: 0,
        name: "Filtered",
      },
      {
        id: "456",
        sceneIndex: 1,
        name: "Filtered",
      },
      {
        id: "789",
        sceneIndex: 2,
        name: "Filtered",
      },
    ]);
  });
});
