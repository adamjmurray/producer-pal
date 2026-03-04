// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { extractErrorSummary } from "./tool-call-error-helpers";

describe("extractErrorSummary", () => {
  describe("MCP content array with error field", () => {
    it("extracts error from double-serialized MCP content array", () => {
      const result = JSON.stringify([
        {
          type: "text",
          text: JSON.stringify({
            error: "No clip in this slot",
            id: null,
            type: null,
            trackIndex: 0,
            sceneIndex: 5,
          }),
        },
      ]);

      expect(extractErrorSummary(result)).toBe("No clip in this slot");
    });

    it("returns null for MCP content array without error field", () => {
      const result = JSON.stringify([
        {
          type: "text",
          text: JSON.stringify({ id: "1", name: "Track" }),
        },
      ]);

      expect(extractErrorSummary(result)).toBeNull();
    });

    it("returns null for malformed MCP content array", () => {
      expect(extractErrorSummary("[invalid json")).toBeNull();
    });
  });

  describe("Error executing tool prefix", () => {
    it("strips tool error prefix from JSON-stringified error", () => {
      const result = JSON.stringify(
        "Error executing tool 'ppal-read-track': readTrack: trackIndex 99 does not exist",
      );

      expect(extractErrorSummary(result)).toBe(
        "readTrack: trackIndex 99 does not exist",
      );
    });

    it("strips tool error prefix from plain string", () => {
      expect(
        extractErrorSummary(
          "Error executing tool 'ppal-read-track': readTrack: trackIndex 99 does not exist",
        ),
      ).toBe("readTrack: trackIndex 99 does not exist");
    });
  });

  describe("timeout prefix", () => {
    it("strips timeout prefix from JSON-stringified error", () => {
      const result = JSON.stringify(
        "Tool call 'ppal-read-track' timed out after 30000ms",
      );

      expect(extractErrorSummary(result)).toBe("timed out after 30000ms");
    });
  });

  describe("MCP error prefix", () => {
    it("strips MCP error code prefix", () => {
      const result = JSON.stringify(
        "MCP error -32602: Tool nonexistent-tool not found",
      );

      expect(extractErrorSummary(result)).toBe(
        "Tool nonexistent-tool not found",
      );
    });

    it("returns 'Invalid arguments' for input validation errors", () => {
      const result = JSON.stringify(
        'MCP error -32602: Input validation error: Invalid arguments for tool ppal-read-track: [\n  {\n    "expected": "number"\n  }\n]',
      );

      expect(extractErrorSummary(result)).toBe("Invalid arguments");
    });
  });

  describe("fallback", () => {
    it("returns null for unrecognized format", () => {
      expect(extractErrorSummary("some unknown error text")).toBeNull();
    });

    it("returns null for normal success result", () => {
      expect(extractErrorSummary('{"id":"1","name":"Track"}')).toBeNull();
    });

    it("handles malformed JSON-quoted string gracefully", () => {
      expect(extractErrorSummary('"unclosed string')).toBeNull();
    });
  });
});
