// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "#src/shared/max/utf8-byte-length.ts";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_SINGLE_MESSAGE_BYTES,
  END_OF_CHUNKS,
  oversizedSingleMessageError,
  planChunks,
  reassembleChunks,
} from "#src/shared/mcp-responses.ts";

describe("mcp-responses", () => {
  describe("constants", () => {
    it("exports END_OF_CHUNKS constant", () => {
      expect(END_OF_CHUNKS).toBe("$$___END_OF_CHUNKS___$$");
    });

    it("exports MAX_CHUNK_SIZE constant", () => {
      expect(MAX_CHUNK_SIZE).toBe(10000);
    });

    it("exports MAX_CHUNKS constant", () => {
      expect(MAX_CHUNKS).toBe(300);
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

    it("keeps every chunk under the byte limit for CJK text", () => {
      // 3 bytes per char: the worst case for a UTF-16 unit count.
      const plan = planChunks("あ".repeat(MAX_CHUNK_SIZE * 3 + 1));

      expect(plan.chunks).toHaveLength(4);

      for (const chunk of plan.chunks) {
        expect(utf8ByteLength(chunk)).toBeLessThanOrEqual(
          MAX_SINGLE_MESSAGE_BYTES,
        );
      }
    });

    it("keeps every chunk under the byte limit for emoji", () => {
      const plan = planChunks("😀".repeat(MAX_CHUNK_SIZE * 2));

      for (const chunk of plan.chunks) {
        expect(utf8ByteLength(chunk)).toBeLessThanOrEqual(
          MAX_SINGLE_MESSAGE_BYTES,
        );
      }
    });

    it("backs off one unit instead of splitting a surrogate pair", () => {
      // The emoji's high half would be the last unit of the first chunk.
      const jsonString = "a".repeat(MAX_CHUNK_SIZE - 1) + "😀tail";

      const plan = planChunks(jsonString);

      expect(plan.chunks).toHaveLength(2);
      expect(plan.chunks[0]!).toHaveLength(MAX_CHUNK_SIZE - 1);
      expect(plan.chunks[1]!.startsWith("😀")).toBe(true);
      expect(plan.chunks.join("")).toBe(jsonString);
    });

    it("never leaves a lone surrogate at any chunk edge", () => {
      // Odd offset: every boundary falls inside an emoji.
      const jsonString = "a" + "😀".repeat(MAX_CHUNK_SIZE);

      const plan = planChunks(jsonString);

      expect(plan.chunks.join("")).toBe(jsonString);

      for (const chunk of plan.chunks) {
        // Throws on a lone surrogate.
        expect(() => encodeURIComponent(chunk)).not.toThrow();
      }
    });

    it("counts the chunks backing off adds against MAX_CHUNKS", () => {
      // An emoji starts every 9,999 units, so each chunk backs off by one:
      // 301 chunks for a payload whose length alone says 300.
      const unit = "😀" + "a".repeat(MAX_CHUNK_SIZE - 3);
      const jsonString = unit.repeat(MAX_CHUNKS) + "a".repeat(10);

      const plan = planChunks(jsonString);

      expect(jsonString.length).toBeLessThanOrEqual(
        MAX_CHUNKS * MAX_CHUNK_SIZE,
      );
      expect(plan.chunks).toStrictEqual([]);
      expect(plan.tooLargeError).toMatch(/301 chunks \(max 300\)/);
    });
  });

  describe("reassembleChunks", () => {
    it("throws when no delimiter is present", () => {
      expect(() => reassembleChunks(["foo", "bar"])).toThrow(
        /Missing END_OF_CHUNKS/,
      );
    });

    it("ignores everything after the delimiter", () => {
      expect(reassembleChunks(["foo", "bar", END_OF_CHUNKS, "trailing"])).toBe(
        "foobar",
      );
    });

    it("returns empty string when delimiter is the only arg", () => {
      expect(reassembleChunks([END_OF_CHUNKS])).toBe("");
    });

    it("coerces non-string chunks via String()", () => {
      expect(reassembleChunks([1, "x", END_OF_CHUNKS])).toBe("1x");
    });

    it("rejoins MAX_CHUNKS-sized payloads losslessly", () => {
      // Boundary case: a payload that uses every available chunk slot.
      const totalLength = MAX_CHUNKS * MAX_CHUNK_SIZE;
      const original = "a".repeat(totalLength - 1) + "b";
      const plan = planChunks(original);

      expect(plan.tooLargeError).toBeNull();
      expect(plan.chunks).toHaveLength(MAX_CHUNKS);
      expect(reassembleChunks([...plan.chunks, END_OF_CHUNKS])).toBe(original);
    });
  });

  describe("oversizedSingleMessageError", () => {
    it("returns null when the payload fits in one IPC message", () => {
      expect(
        oversizedSingleMessageError("x".repeat(100), "x", "Send less."),
      ).toBeNull();
      // Exactly the limit is the boundary and still allowed.
      expect(
        oversizedSingleMessageError(
          "x".repeat(MAX_SINGLE_MESSAGE_BYTES),
          "x",
          "Send less.",
        ),
      ).toBeNull();
    });

    it("returns a labeled error when the payload exceeds the limit", () => {
      const error = oversizedSingleMessageError(
        "x".repeat(MAX_SINGLE_MESSAGE_BYTES + 1),
        "code-exec request",
        "Send less.",
      );

      expect(error).toContain("code-exec request too large");
      expect(error).toMatch(/\. Send less\.$/);
      expect(error).toContain(String(MAX_SINGLE_MESSAGE_BYTES + 1));
      expect(error).toContain(String(MAX_SINGLE_MESSAGE_BYTES));
    });

    it("measures UTF-8 bytes, not characters", () => {
      // 10,001 chars, 30,003 bytes.
      const error = oversizedSingleMessageError(
        "あ".repeat(10_001),
        "x",
        "Send less.",
      );

      expect(error).toContain("30003 bytes");
      expect(
        oversizedSingleMessageError("あ".repeat(10_000), "x", "Send less."),
      ).toBeNull();
    });
  });
});
