// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for state.ts - State assertion with mocked MCP client
 */
import { describe, it, expect, vi } from "vitest";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type StateAssertion } from "../types.ts";
import { assertState } from "./state.ts";

/** Type for state assertion details */
interface StateDetails {
  actual?: unknown;
  expected?: unknown;
  error?: string;
}

/**
 * Create a mock MCP client that returns the specified result
 *
 * @param result - The result to return from callTool
 * @returns Mock Client with callTool method
 */
function createMockClient(result: unknown): Client {
  return {
    callTool: vi.fn().mockResolvedValue(result),
  } as unknown as Client;
}

/**
 * Create an MCP-formatted result with text content
 *
 * @param text - The text content to wrap
 * @returns MCP result object
 */
function mcpResult(text: string): { content: Array<{ text: string }> } {
  return { content: [{ text }] };
}

describe("assertState", () => {
  describe("object matching with partialMatch", () => {
    it("passes when state matches expected object", async () => {
      const mockClient = createMockClient(
        mcpResult(JSON.stringify({ name: "Track 1", muted: false })),
      );
      const assertion: StateAssertion = {
        type: "state",
        tool: "read-track",
        args: { trackId: "1" },
        expect: { name: "Track 1" },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("passed");
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: "read-track",
        arguments: { trackId: "1" },
      });
    });

    it("passes with partial match on nested objects", async () => {
      const mockClient = createMockClient(
        mcpResult(
          JSON.stringify({
            track: { name: "Bass", volume: 0.8 },
            clips: [{ id: "1" }],
          }),
        ),
      );
      const assertion: StateAssertion = {
        type: "state",
        tool: "read-track",
        args: { trackId: "2" },
        expect: { track: { name: "Bass" } },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(true);
    });

    it("fails when state does not match expected", async () => {
      const mockClient = createMockClient(
        mcpResult(JSON.stringify({ name: "Track 1", muted: true })),
      );
      const assertion: StateAssertion = {
        type: "state",
        tool: "read-track",
        args: { trackId: "1" },
        expect: { name: "Track 2" },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("failed");
      const details = result.details as StateDetails;

      expect(details.actual).toStrictEqual({
        name: "Track 1",
        muted: true,
      });
      expect(details.expected).toStrictEqual({ name: "Track 2" });
    });

    it("fails when expected field is missing", async () => {
      const mockClient = createMockClient(
        mcpResult(JSON.stringify({ name: "Track 1" })),
      );
      const assertion: StateAssertion = {
        type: "state",
        tool: "read-track",
        args: { trackId: "1" },
        expect: { volume: 0.5 },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(false);
    });
  });

  describe("custom expect function", () => {
    it("passes when custom function returns true", async () => {
      const mockClient = createMockClient(
        mcpResult(JSON.stringify({ count: 5 })),
      );
      const assertion: StateAssertion = {
        type: "state",
        tool: "count-tracks",
        args: {},
        expect: (result) => {
          const data = result as { count: number };

          return data.count > 3;
        },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(true);
      const details = result.details as StateDetails;

      expect(details.expected).toBe("(custom function)");
    });

    it("fails when custom function returns false", async () => {
      const mockClient = createMockClient(
        mcpResult(JSON.stringify({ count: 2 })),
      );
      const assertion: StateAssertion = {
        type: "state",
        tool: "count-tracks",
        args: {},
        expect: (result) => {
          const data = result as { count: number };

          return data.count > 3;
        },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(false);
    });
  });

  describe("non-JSON text handling", () => {
    it("handles plain text response", async () => {
      const mockClient = createMockClient(mcpResult("Connected to Ableton"));
      const assertion: StateAssertion = {
        type: "state",
        tool: "ppal-connect",
        args: {},
        expect: (result) => typeof result === "string",
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(true);
      const details = result.details as StateDetails;

      expect(details.actual).toBe("Connected to Ableton");
    });

    it("falls back to string when JSON parsing fails", async () => {
      const mockClient = createMockClient(mcpResult("Not valid JSON {"));
      const assertion: StateAssertion = {
        type: "state",
        tool: "some-tool",
        args: {},
        expect: (result) => result === "Not valid JSON {",
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(true);
    });
  });

  describe("error handling", () => {
    it("returns failed result when tool call throws", async () => {
      const mockClient = {
        callTool: vi.fn().mockRejectedValue(new Error("Connection refused")),
      } as unknown as Client;
      const assertion: StateAssertion = {
        type: "state",
        tool: "read-track",
        args: { trackId: "1" },
        expect: { name: "Track 1" },
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("error");
      expect(result.message).toContain("Connection refused");
      const details = result.details as StateDetails;

      expect(details.error).toContain("Connection refused");
    });

    it("handles non-Error exceptions", async () => {
      const mockClient = {
        callTool: vi.fn().mockRejectedValue("string error"),
      } as unknown as Client;
      const assertion: StateAssertion = {
        type: "state",
        tool: "read-track",
        args: { trackId: "1" },
        expect: {},
      };

      const result = await assertState(assertion, mockClient);

      expect(result.passed).toBe(false);
      const details = result.details as StateDetails;

      expect(details.error).toContain("string error");
    });
  });

  describe("assertion result structure", () => {
    it("includes original assertion in result", async () => {
      const mockClient = createMockClient(mcpResult(JSON.stringify({})));
      const assertion: StateAssertion = {
        type: "state",
        tool: "test-tool",
        args: { foo: "bar" },
        expect: {},
      };

      const result = await assertState(assertion, mockClient);

      expect(result.assertion).toBe(assertion);
    });

    it("includes tool name in message", async () => {
      const mockClient = createMockClient(mcpResult(JSON.stringify({})));
      const assertion: StateAssertion = {
        type: "state",
        tool: "custom-tool-name",
        args: {},
        expect: {},
      };

      const result = await assertState(assertion, mockClient);

      expect(result.message).toContain("custom-tool-name");
    });
  });
});
