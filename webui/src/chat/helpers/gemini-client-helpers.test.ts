import { describe, it, expect, vi } from "vitest";
import type { Part } from "@google/genai/web";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  isToolCall,
  isErrorResult,
  buildErrorResponse,
  executeSingleTool,
  executeToolCalls,
  hasUnexecutedFunctionCalls,
  shouldMergeWithLastPart,
  addOrMergePartToTurn,
} from "./gemini-client-helpers";

describe("gemini-client-helpers", () => {
  describe("isToolCall", () => {
    it("returns true when functionCall is present", () => {
      expect(isToolCall({ functionCall: { name: "test" } })).toBe(true);
    });

    it("returns false when functionCall is absent", () => {
      expect(isToolCall({ text: "hello" })).toBe(false);
    });
  });

  describe("isErrorResult", () => {
    it("returns true when isError is true", () => {
      expect(isErrorResult({ isError: true })).toBe(true);
    });

    it("returns false when isError is false or absent", () => {
      expect(isErrorResult({ isError: false })).toBe(false);
      expect(isErrorResult({})).toBe(false);
    });
  });

  describe("buildErrorResponse", () => {
    it("builds error response from Error object", () => {
      const error = new Error("test error");
      const result = buildErrorResponse(error, "testTool") as {
        functionResponse: { response: { error: string } };
      };

      expect(result.functionResponse.response.error).toBe("test error");
    });

    it("builds error response from non-Error", () => {
      const result = buildErrorResponse("string error", "testTool") as {
        functionResponse: { response: { error: string } };
      };

      expect(result.functionResponse.response.error).toBe("string error");
    });
  });

  describe("executeSingleTool", () => {
    it("returns error when mcpClient is null", async () => {
      const result = (await executeSingleTool(
        { functionCall: { name: "test" } },
        null,
      )) as { functionResponse: { response: { error: string } } };

      expect(result.functionResponse.response.error).toBe(
        "MCP client not initialized",
      );
    });

    it("returns successful response from callTool", async () => {
      const mockClient = {
        callTool: vi.fn().mockResolvedValue({ content: "success" }),
      } as unknown as Client;

      const result = (await executeSingleTool(
        { functionCall: { name: "test", args: {} } },
        mockClient,
      )) as {
        functionResponse: { response: { content: string } };
      };

      expect(result.functionResponse.response.content).toBe("success");
    });

    it("wraps error response when isError is true", async () => {
      const mockClient = {
        callTool: vi.fn().mockResolvedValue({ isError: true, message: "fail" }),
      } as unknown as Client;

      const result = (await executeSingleTool(
        { functionCall: { name: "test" } },
        mockClient,
      )) as { functionResponse: { response: { error: unknown } } };

      expect(result.functionResponse.response.error).toStrictEqual({
        isError: true,
        message: "fail",
      });
    });

    it("catches and returns error when callTool throws", async () => {
      const mockClient = {
        callTool: vi.fn().mockRejectedValue(new Error("call failed")),
      } as unknown as Client;

      const result = (await executeSingleTool(
        { functionCall: { name: "test" } },
        mockClient,
      )) as { functionResponse: { response: { error: string } } };

      expect(result.functionResponse.response.error).toBe("call failed");
    });
  });

  describe("executeToolCalls", () => {
    it("returns empty array when lastMessage is undefined", async () => {
      const result = await executeToolCalls(undefined, null);

      expect(result).toStrictEqual([]);
    });

    it("skips non-tool-call parts", async () => {
      const message = {
        role: "model" as const,
        parts: [{ text: "hello" }],
      };
      const result = await executeToolCalls(message, null);

      expect(result).toStrictEqual([]);
    });
  });

  describe("hasUnexecutedFunctionCalls", () => {
    it("returns false when role is not model", () => {
      expect(
        hasUnexecutedFunctionCalls({
          role: "user",
          parts: [{ functionCall: { name: "test" } } as Part],
        }),
      ).toBe(false);
    });

    it("returns true when model has function calls", () => {
      expect(
        hasUnexecutedFunctionCalls({
          role: "model",
          parts: [{ functionCall: { name: "test" } } as unknown as Part],
        }),
      ).toBe(true);
    });
  });

  describe("shouldMergeWithLastPart", () => {
    it("returns false when part has no text", () => {
      expect(shouldMergeWithLastPart({}, { text: "hello" })).toBe(false);
    });

    it("returns false when lastPart has no text", () => {
      expect(shouldMergeWithLastPart({ text: "hello" }, {})).toBe(false);
    });

    it("returns false when thought status differs", () => {
      expect(
        shouldMergeWithLastPart(
          { text: "a", thought: true },
          { text: "b", thought: false },
        ),
      ).toBe(false);
    });

    it("returns false when lastPart has thoughtSignature", () => {
      expect(
        shouldMergeWithLastPart(
          { text: "a" },
          { text: "b", thoughtSignature: "sig" },
        ),
      ).toBe(false);
    });

    it("returns false when part has thoughtSignature", () => {
      expect(
        shouldMergeWithLastPart(
          { text: "a", thoughtSignature: "sig" },
          { text: "b" },
        ),
      ).toBe(false);
    });

    it("returns true when both are text without thought differences", () => {
      expect(shouldMergeWithLastPart({ text: "a" }, { text: "b" })).toBe(true);
    });
  });

  describe("addOrMergePartToTurn", () => {
    it("pushes part when cannot merge", () => {
      const turn = { role: "model" as const, parts: [] as Part[] };

      addOrMergePartToTurn(turn, { text: "hello" } as Part);
      expect(turn.parts).toHaveLength(1);
    });

    it("merges text when parts can be merged", () => {
      const turn = {
        role: "model" as const,
        parts: [{ text: "hello" }] as Part[],
      };

      addOrMergePartToTurn(turn, { text: " world" } as Part);
      expect(turn.parts).toHaveLength(1);
      expect((turn.parts[0] as { text: string }).text).toBe("hello world");
    });
  });
});
