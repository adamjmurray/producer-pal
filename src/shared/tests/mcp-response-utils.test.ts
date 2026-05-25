// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
  planChunks,
  reassembleChunks,
} from "#src/shared/mcp-response-utils.ts";

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

    it("omits errorCode by default", () => {
      const result = formatErrorResponse("oops");

      expect(result).not.toHaveProperty("errorCode");
    });

    it("includes the errorCode discriminator when provided", () => {
      const result = formatErrorResponse("timed out", "timeout");

      expect(result).toStrictEqual({
        content: [{ type: "text", text: "timed out" }],
        isError: true,
        errorCode: "timeout",
      });
    });
  });

  describe("planChunks", () => {
    it("returns a single chunk for small payloads", () => {
      const plan = planChunks("hello");

      expect(plan.tooLargeError).toBeNull();
      expect(plan.chunks).toStrictEqual(["hello"]);
    });

    it("splits payloads into MAX_CHUNK_SIZE slices", () => {
      const jsonString = "a".repeat(MAX_CHUNK_SIZE * 2 + 7);

      const plan = planChunks(jsonString);

      expect(plan.tooLargeError).toBeNull();
      expect(plan.chunks).toHaveLength(3);
      expect(plan.chunks[0]!).toHaveLength(MAX_CHUNK_SIZE);
      expect(plan.chunks[1]!).toHaveLength(MAX_CHUNK_SIZE);
      expect(plan.chunks[2]!).toHaveLength(7);
      expect(plan.chunks.join("")).toBe(jsonString);
    });

    it("returns a tooLargeError when payload exceeds MAX_CHUNKS", () => {
      const jsonString = "z".repeat(MAX_CHUNKS * MAX_CHUNK_SIZE + 1);

      const plan = planChunks(jsonString);

      expect(plan.chunks).toStrictEqual([]);
      expect(plan.tooLargeError).toMatch(/Response too large/);
      expect(plan.tooLargeError).toMatch(new RegExp(`max ${MAX_CHUNKS}`));
    });
  });

  describe("reassembleChunks", () => {
    it("throws when no delimiter is present", () => {
      expect(() => reassembleChunks(["foo", "bar"])).toThrow(
        /Missing MAX_ERROR_DELIMITER/,
      );
    });

    it("ignores everything after the delimiter", () => {
      expect(
        reassembleChunks(["foo", "bar", MAX_ERROR_DELIMITER, "trailing"]),
      ).toBe("foobar");
    });

    it("returns empty string when delimiter is the only arg", () => {
      expect(reassembleChunks([MAX_ERROR_DELIMITER])).toBe("");
    });

    it("coerces non-string chunks via String()", () => {
      expect(reassembleChunks([1, "x", MAX_ERROR_DELIMITER])).toBe("1x");
    });

    it("rejoins MAX_CHUNKS-sized payloads losslessly", () => {
      // Boundary case: a payload that uses every available chunk slot.
      const totalLength = MAX_CHUNKS * MAX_CHUNK_SIZE;
      const original = "a".repeat(totalLength - 1) + "b";
      const plan = planChunks(original);

      expect(plan.tooLargeError).toBeNull();
      expect(plan.chunks).toHaveLength(MAX_CHUNKS);
      expect(reassembleChunks([...plan.chunks, MAX_ERROR_DELIMITER])).toBe(
        original,
      );
    });
  });
});
