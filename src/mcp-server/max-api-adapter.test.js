import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "../shared/mcp-response-utils.js";
import {
  callLiveApi,
  handleLiveApiResult,
  setTimeoutForTesting,
} from "./max-api-adapter.js";

// Make sure the module's handler is registered
import "./max-api-adapter.js";

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
      );

      // Get the requestId from the outlet call
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];
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
      expect(result.content[0].text).toBe("test response");
    });

    it("should timeout after specified timeout period", async () => {
      // Set a short timeout for fast testing
      setTimeoutForTesting(2);

      // Replace Max.outlet with a simple mock that doesn't auto-respond
      Max.outlet = vi.fn();

      const result = await callLiveApi("test-tool", {});

      // Should resolve with isError: true instead of rejecting
      expect(result).toEqual({
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
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];
      handleLiveApiResult(
        requestId,
        JSON.stringify({ content: [{ type: "text", text: "test response" }] }),
        MAX_ERROR_DELIMITER,
      );

      await promise;
    });

    it("should handle Max.outlet throwing an error", async () => {
      const errorMessage = "Simulated Max error";
      Max.outlet = vi.fn(() => {
        throw new Error(errorMessage);
      });

      const result = await callLiveApi("test-tool", {});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      });
    });

    it("should handle Max.outlet throwing an error with no message", async () => {
      Max.outlet = vi.fn(() => {
        throw new Error();
      });

      const result = await callLiveApi("test-tool", {});

      expect(result).toEqual({
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

  describe("handleLiveApiResult", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should handle valid response with matching request ID", async () => {
      // Ensure Max.outlet is mocked properly and doesn't throw
      Max.outlet = vi.fn();

      // Start a request to create a pending request
      const promise = callLiveApi("test-tool", {});

      // Get the request ID from the outlet call
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];

      // Simulate the response
      const mockResult = { content: [{ type: "text", text: "success" }] };
      handleLiveApiResult(
        requestId,
        JSON.stringify(mockResult),
        MAX_ERROR_DELIMITER,
      );

      const result = await promise;
      expect(result).toEqual(mockResult);
    });

    it("should add maxErrors to result content", async () => {
      // Ensure Max.outlet is mocked properly and doesn't throw
      Max.outlet = vi.fn();

      // Start a request
      const promise = callLiveApi("test-tool", {});

      // Get request ID
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];

      // Simulate response with errors
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
      expect(result.content[0]).toEqual({ type: "text", text: "success" });
      expect(result.content[1]).toEqual({
        type: "text",
        text: "WARNING: Error 1",
      });
      expect(result.content[2]).toEqual({
        type: "text",
        text: "WARNING: Error 2",
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
      // Ensure Max.outlet is mocked properly and doesn't throw
      Max.outlet = vi.fn();

      // Start a request to create a pending request
      const promise = callLiveApi("test-tool", {});

      // Get the request ID from the outlet call
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];

      // Call with malformed JSON - this should resolve with an error response
      handleLiveApiResult(requestId, "{ malformed json", MAX_ERROR_DELIMITER);

      const result = await promise;

      // Should resolve with an error response instead of throwing or logging
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "Error parsing tool result from Max",
      );
    });

    it("should clear timeout when response is received", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      // Ensure Max.outlet is mocked properly and doesn't throw
      Max.outlet = vi.fn();

      // Start a request
      const promise = callLiveApi("test-tool", {});

      // Get request ID
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];

      // Simulate response
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
      // Ensure Max.outlet is mocked properly and doesn't throw
      Max.outlet = vi.fn();

      // Start a request
      const promise = callLiveApi("test-tool", {});

      // Get request ID
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];

      // Simulate chunked response
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
      expect(result.content[0]).toEqual({ type: "text", text: "success" });
      expect(result.content[1]).toEqual({
        type: "text",
        text: "WARNING: Error 1",
      });
    });

    it("should handle missing delimiter error", async () => {
      // Ensure Max.outlet is mocked properly and doesn't throw
      Max.outlet = vi.fn();

      // Start a request
      const promise = callLiveApi("test-tool", {});

      // Get request ID
      const callArgs = Max.outlet.mock.calls[0];
      const requestId = callArgs[1];

      // Simulate response without delimiter (should cause error)
      handleLiveApiResult(requestId, "chunk1", "chunk2");

      const result = await promise;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Missing MAX_ERROR_DELIMITER");
    });
  });
});
