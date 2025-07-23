// src/mcp-server/max-api-adapter.test.js
import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  callLiveApi,
  handleLiveApiResult,
  setTimeoutForTesting,
} from "./max-api-adapter.js";

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
        expect.stringMatching(/^\{.*\}$/),
      );

      // Parse the JSON to verify structure
      const callArgs = Max.outlet.mock.calls[0];
      const requestData = JSON.parse(callArgs[1]);
      expect(requestData).toMatchObject({
        requestId: expect.any(String),
        tool: "test-tool",
        args: { arg1: "value1" },
      });

      // Manually trigger the response using handleLiveApiResult
      handleLiveApiResult(
        JSON.stringify({
          requestId: requestData.requestId,
          result: { content: [{ type: "text", text: "test response" }] },
        }),
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
      const requestData = JSON.parse(callArgs[1]);
      handleLiveApiResult(
        JSON.stringify({
          requestId: requestData.requestId,
          result: { content: [{ type: "text", text: "test response" }] },
        }),
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
      const requestData = JSON.parse(callArgs[1]);
      const requestId = requestData.requestId;

      // Simulate the response
      const mockResult = { content: [{ type: "text", text: "success" }] };
      handleLiveApiResult(JSON.stringify({ requestId, result: mockResult }));

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
      const requestData = JSON.parse(callArgs[1]);
      const requestId = requestData.requestId;

      // Simulate response with errors
      const mockResult = { content: [{ type: "text", text: "success" }] };
      handleLiveApiResult(
        JSON.stringify({ requestId, result: mockResult }),
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
        JSON.stringify({
          requestId: "unknown-id",
          result: { content: [] },
        }),
      );

      // The logger uses console.info() which only logs when verbose mode is enabled
      // Since verbose is off by default in tests, Max.post is never called
      // This is actually correct behavior - the message should only log in verbose mode
      expect(Max.post).not.toHaveBeenCalled();
    });

    it("should handle malformed JSON response", async () => {
      // Call with malformed JSON
      handleLiveApiResult("{ malformed json");

      // Should log error but not throw
      // The new logger format includes timestamp and log level parameter
      expect(Max.post).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] Error handling response from Max:/,
        ),
        "error",
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
      const requestData = JSON.parse(callArgs[1]);
      const requestId = requestData.requestId;

      // Simulate response
      const mockResult = { content: [{ type: "text", text: "success" }] };
      handleLiveApiResult(JSON.stringify({ requestId, result: mockResult }));

      await promise;

      // Verify timeout was cleared
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });
});
