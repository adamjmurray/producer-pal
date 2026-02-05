// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import {
  callLiveApi,
  handleLiveApiResult,
  setTimeoutForTesting,
} from "./max-api-adapter.ts";

// Make sure the module's handler is registered
import "./max-api-adapter.ts";

// Capture the timeoutMs handler before mocks are cleared
let timeoutMsHandler: ((input: unknown) => void) | undefined;
const timeoutMsCall = (
  Max.addHandler as ReturnType<typeof vi.fn>
).mock.calls.find((call: unknown[]) => call[0] === "timeoutMs") as
  | unknown[]
  | undefined;

if (timeoutMsCall) {
  timeoutMsHandler = timeoutMsCall[1] as (input: unknown) => void;
}

interface PendingRequestResult {
  promise: Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  requestId: string;
}

/**
 * Helper to set up a pending request and get its ID.
 *
 * @param tool - Tool name
 * @param args - Tool arguments
 * @returns Promise and request ID
 */
function setupPendingRequest(
  tool = "test-tool",
  args = {},
): PendingRequestResult {
  Max.outlet = vi.fn().mockResolvedValue(undefined);
  const promise = callLiveApi(tool, args);
  const requestId = (Max.outlet as ReturnType<typeof vi.fn>).mock
    .calls[0]![1] as string;

  return { promise, requestId };
}

describe("Max API Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("callLiveApi", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should create a request with unique ID and call Max.outlet", async () => {
      const promise = callLiveApi("test-tool", { arg1: "value1" });

      expect(Max.outlet).toHaveBeenCalledWith(
        "mcp_request",
        expect.any(String), // requestId
        "test-tool", // tool
        '{"arg1":"value1"}', // argsJSON
        expect.stringContaining("silenceWavPath"), // contextJSON
      );

      // Get the requestId from the outlet call
      const callArgs = (Max.outlet as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const requestId = callArgs[1] as string;

      expect(typeof requestId).toBe("string");
      expect(callArgs[2]).toBe("test-tool");
      expect(callArgs[3]).toBe('{"arg1":"value1"}');

      // Manually trigger the response using handleLiveApiResult with chunked format
      handleLiveApiResult(
        requestId,
        JSON.stringify({ content: [{ type: "text", text: "test response" }] }),
        MAX_ERROR_DELIMITER,
      );

      const result = await promise;

      expect(result.content[0]!.text).toBe("test response");
    });

    it("should timeout after specified timeout period", async () => {
      // Set a short timeout for fast testing
      setTimeoutForTesting(2);

      // Replace Max.outlet with a simple mock that doesn't auto-respond
      Max.outlet = vi.fn().mockResolvedValue(undefined);

      const result = await callLiveApi("test-tool", {});

      // Should resolve with isError: true instead of rejecting
      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "Tool call 'test-tool' timed out after 2ms",
          },
        ],
        isError: true,
      });

      expect(Max.outlet).toHaveBeenCalled();
    });

    it("should use default timeout when not specified", async () => {
      const promise = callLiveApi("test-tool", {});

      // We can't easily test the exact timeout, but we can verify the call was made
      expect(Max.outlet).toHaveBeenCalled();

      // Manually trigger response
      const callArgs = (Max.outlet as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const requestId = callArgs[1] as string;

      handleLiveApiResult(
        requestId,
        JSON.stringify({ content: [{ type: "text", text: "test response" }] }),
        MAX_ERROR_DELIMITER,
      );

      await promise;
    });

    it("should handle Max.outlet rejecting with an error", async () => {
      const errorMessage = "Simulated Max error";

      Max.outlet = vi.fn().mockRejectedValue(new Error(errorMessage));

      const result = await callLiveApi("test-tool", {});

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      });
    });

    it("should handle Max.outlet rejecting with an error with no message", async () => {
      Max.outlet = vi.fn().mockRejectedValue(new Error());

      const result = await callLiveApi("test-tool", {});

      expect(result).toStrictEqual({
        content: [
          {
            type: "text",
            text: "Error sending message to test-tool: Error",
          },
        ],
        isError: true,
      });
    });
  });

  describe("timeoutMs handler", () => {
    it("should set timeout when valid value is provided", () => {
      expect(timeoutMsHandler).toBeDefined();

      // Call the handler with a valid timeout
      timeoutMsHandler!(5000);

      // Verify it doesn't log an error
      expect(Max.post).not.toHaveBeenCalled();
    });

    it("should reject timeout values above 60000ms", () => {
      // Call with invalid timeout (too high)
      timeoutMsHandler!(70000);

      // Should log an error
      expect(Max.post).toHaveBeenCalledWith(
        expect.stringContaining("Invalid Live API timeoutMs: 70000"),
        "error",
      );
    });

    it("should reject timeout values at or below 0", () => {
      vi.clearAllMocks();

      // Call with invalid timeout (zero)
      timeoutMsHandler!(0);

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringContaining("Invalid Live API timeoutMs: 0"),
        "error",
      );
    });

    it("should reject non-numeric timeout values", () => {
      vi.clearAllMocks();

      // Call with non-numeric value
      timeoutMsHandler!("invalid");

      expect(Max.post).toHaveBeenCalledWith(
        expect.stringContaining("Invalid Live API timeoutMs: invalid"),
        "error",
      );
    });
  });

  describe("handleLiveApiResult", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should handle valid response with matching request ID", async () => {
      // Ensure Max.outlet is mocked properly and returns a promise
      Max.outlet = vi.fn().mockResolvedValue(undefined);

      // Start a request to create a pending request
      const promise = callLiveApi("test-tool", {});

      // Get the request ID from the outlet call
      const callArgs = (Max.outlet as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const requestId = callArgs[1] as string;

      // Simulate the response
      const mockResult = { content: [{ type: "text", text: "success" }] };

      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
      );

      const result = await promise;

      expect(result).toStrictEqual(mockResult);
    });

    it("should add maxErrors to result content", async () => {
      const { promise, requestId } = setupPendingRequest();
      const mockResult = { content: [{ type: "text", text: "success" }] };

      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
        "Error 1",
        "Error 2",
      );

      const result = await promise;

      expect(result.content).toHaveLength(3);
      expect(result.content[0]).toStrictEqual({
        type: "text",
        text: "success",
      });
      expect(result.content[1]).toStrictEqual({
        type: "text",
        text: "WARNING: Error 1",
      });
      expect(result.content[2]).toStrictEqual({
        type: "text",
        text: "WARNING: Error 2",
      });
    });

    it("should strip v8: prefix from error messages", async () => {
      const { promise, requestId } = setupPendingRequest();
      const mockResult = { content: [{ type: "text", text: "success" }] };

      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
        "v8: Error message",
      );

      const result = await promise;

      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toStrictEqual({
        type: "text",
        text: "WARNING: Error message", // v8: prefix removed
      });
    });

    it("should filter out empty v8: messages", async () => {
      const { promise, requestId } = setupPendingRequest();
      const mockResult = { content: [{ type: "text", text: "success" }] };

      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
        "v8: Real error",
        "v8:", // Empty after stripping
        "v8: ", // Just whitespace after stripping
        "v8:\n", // Just newline after stripping
      );

      const result = await promise;

      // Should only have original content + 1 real error (not 4 errors)
      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toStrictEqual({
        type: "text",
        text: "WARNING: Real error",
      });
    });

    it("should handle error messages without v8: prefix", async () => {
      const { promise, requestId } = setupPendingRequest();
      const mockResult = { content: [{ type: "text", text: "success" }] };

      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
        "Regular error without prefix",
      );

      const result = await promise;

      expect(result.content).toHaveLength(2);
      expect(result.content[1]).toStrictEqual({
        type: "text",
        text: "WARNING: Regular error without prefix",
      });
    });

    it("should handle unknown request ID", async () => {
      // Call with unknown request ID
      handleLiveApiResult(
        "unknown-id",
        JSON.stringify({ content: [] }),
        MAX_ERROR_DELIMITER,
      );

      // The logger uses console.info() which only logs when verbose mode is enabled
      // Since verbose is off by default in tests, Max.post is never called
      // This is actually correct behavior - the message should only log in verbose mode
      expect(Max.post).not.toHaveBeenCalled();
    });

    it("should handle malformed JSON response", async () => {
      const { promise, requestId } = setupPendingRequest();

      // Call with malformed JSON - this should resolve with an error response
      handleLiveApiResult(requestId, "{ malformed json", MAX_ERROR_DELIMITER);

      const result = await promise;

      // Should resolve with an error response instead of throwing or logging
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain(
        "Error parsing tool result from Max",
      );
    });

    it("should clear timeout when response is received", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const { promise, requestId } = setupPendingRequest();
      const mockResult = { content: [{ type: "text", text: "success" }] };

      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
      );

      await promise;

      // Verify timeout was cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it("should handle chunked responses", async () => {
      const { promise, requestId } = setupPendingRequest();
      const mockResult = { content: [{ type: "text", text: "success" }] };
      const jsonString = JSON.stringify(mockResult);
      const chunk1 = jsonString.slice(0, 10);
      const chunk2 = jsonString.slice(10);

      handleLiveApiResult(
        requestId,
        chunk1,
        chunk2,
        MAX_ERROR_DELIMITER,
        "Error 1",
      );

      const result = await promise;

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toStrictEqual({
        type: "text",
        text: "success",
      });
      expect(result.content[1]).toStrictEqual({
        type: "text",
        text: "WARNING: Error 1",
      });
    });

    it("should handle missing delimiter error", async () => {
      const { promise, requestId } = setupPendingRequest();

      // Simulate response without delimiter (should cause error)
      handleLiveApiResult(requestId, "chunk1", "chunk2");

      const result = await promise;

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Missing MAX_ERROR_DELIMITER");
    });
  });
});
