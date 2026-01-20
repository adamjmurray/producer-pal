import { describe, expect, it } from "vitest";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
} from "#src/shared/mcp-response-utils.js";

describe("mcp-response-utils", () => {
  describe("constants", () => {
    it("exports MAX_ERROR_DELIMITER constant", () => {
      expect(MAX_ERROR_DELIMITER).toBe("$$___MAX_ERRORS___$$");
    });

    it("exports MAX_CHUNK_SIZE constant", () => {
      expect(MAX_CHUNK_SIZE).toBe(30000);
    });

    it("exports MAX_CHUNKS constant", () => {
      expect(MAX_CHUNKS).toBe(100);
    });
  });

  describe("formatSuccessResponse", () => {
    it("formats string result correctly", () => {
      const result = formatSuccessResponse("test message");

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "test message",
          },
        ],
      });
    });

    it("formats object result by JSON stringifying", () => {
      const result = formatSuccessResponse({ foo: "bar", count: 42 });

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: '{"foo":"bar","count":42}',
          },
        ],
      });
    });

    it("formats array result by JSON stringifying", () => {
      const result = formatSuccessResponse([1, 2, 3]);

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "[1,2,3]",
          },
        ],
      });
    });

    it("formats number result by JSON stringifying", () => {
      const result = formatSuccessResponse(42 as unknown as string);

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "42",
          },
        ],
      });
    });

    it("formats boolean result by JSON stringifying", () => {
      const result = formatSuccessResponse(true as unknown as string);

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "true",
          },
        ],
      });
    });

    it("formats null result by JSON stringifying", () => {
      const result = formatSuccessResponse(null as unknown as string);

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "null",
          },
        ],
      });
    });
  });

  describe("formatErrorResponse", () => {
    it("formats error message correctly", () => {
      const result = formatErrorResponse("Something went wrong");

      expect(result).toStrictEqual({
        content: [{ type: "text", text: "Something went wrong" }],
        isError: true,
      });
    });

    it("handles empty error message", () => {
      const result = formatErrorResponse("");

      expect(result).toStrictEqual({
        content: [{ type: "text", text: "" }],
        isError: true,
      });
    });

    it("handles multiline error message", () => {
      const result = formatErrorResponse("Error:\nLine 1\nLine 2");

      expect(result).toStrictEqual({
        content: [{ type: "text", text: "Error:\nLine 1\nLine 2" }],
        isError: true,
      });
    });
  });
});
