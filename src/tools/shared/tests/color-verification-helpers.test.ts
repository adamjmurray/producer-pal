import * as console from "#src/shared/v8-max-console.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.js";

vi.mock(import("#src/shared/v8-max-console.js"), () => ({
  error: vi.fn(),
}));

describe("verifyColorQuantization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exact color match", () => {
    it("should not emit warning when color matches exactly", () => {
      const mockObject = {
        type: "Track",
        getColor: vi.fn().mockReturnValue("#FF0000"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#FF0000");

      expect(console.error).not.toHaveBeenCalled();
    });

    it("should not emit warning with case-insensitive match", () => {
      const mockObject = {
        type: "Track",
        getColor: vi.fn().mockReturnValue("#FF0000"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#ff0000");

      expect(console.error).not.toHaveBeenCalled();
    });

    it("should not emit warning when lowercase requested matches uppercase actual", () => {
      const mockObject = {
        type: "Scene",
        getColor: vi.fn().mockReturnValue("#ABCDEF"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#abcdef");

      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("quantized color", () => {
    it("should emit warning for Track when color is quantized", () => {
      const mockObject = {
        type: "Track",
        getColor: vi.fn().mockReturnValue("#FF3636"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#FF0000");

      expect(console.error).toHaveBeenCalledWith(
        "Note: Requested track color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );
    });

    it("should emit warning for Scene when color is quantized", () => {
      const mockObject = {
        type: "Scene",
        getColor: vi.fn().mockReturnValue("#1AFF2F"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#00FF00");

      expect(console.error).toHaveBeenCalledWith(
        "Note: Requested scene color #00FF00 was mapped to nearest palette color #1AFF2F. Live uses a fixed color palette.",
      );
    });

    it("should emit warning for Clip when color is quantized", () => {
      const mockObject = {
        type: "Clip",
        getColor: vi.fn().mockReturnValue("#1A2F96"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#0000FF");

      expect(console.error).toHaveBeenCalledWith(
        "Note: Requested clip color #0000FF was mapped to nearest palette color #1A2F96. Live uses a fixed color palette.",
      );
    });

    it("should handle mixed case in quantized warning", () => {
      const mockObject = {
        type: "Track",
        getColor: vi.fn().mockReturnValue("#FF3636"),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#ff0000");

      expect(console.error).toHaveBeenCalledWith(
        "Note: Requested track color #ff0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );
    });
  });

  describe("error handling", () => {
    it("should emit warning if getColor throws error", () => {
      const mockObject = {
        type: "Track",
        getColor: vi.fn().mockImplementation(() => {
          throw new Error("Failed to read color");
        }),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#FF0000");

      expect(console.error).toHaveBeenCalledWith(
        "Warning: Could not verify color quantization: Failed to read color",
      );
    });

    it("should emit warning if getColor returns null", () => {
      const mockObject = {
        type: "Track",
        getColor: vi.fn().mockReturnValue(null),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#FF0000");

      expect(console.error).toHaveBeenCalledWith(
        "Note: Requested track color #FF0000 was mapped to nearest palette color null. Live uses a fixed color palette.",
      );
    });

    it("should emit warning if getColor returns undefined", () => {
      const mockObject = {
        type: "Scene",
        getColor: vi.fn().mockReturnValue(undefined),
      } as unknown as LiveAPI;

      verifyColorQuantization(mockObject, "#00FF00");

      expect(console.error).toHaveBeenCalledWith(
        "Note: Requested scene color #00FF00 was mapped to nearest palette color undefined. Live uses a fixed color palette.",
      );
    });
  });
});
