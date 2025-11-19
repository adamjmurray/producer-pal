import { describe, it, expect, vi } from "vitest";
import {
  handleMessageStream,
  createGeminiErrorMessage,
  createOpenAIErrorMessage,
  validateMcpConnection,
} from "./streaming-helpers.js";
import type { GeminiMessage, OpenAIMessage } from "../types/messages.js";

describe("streaming-helpers", () => {
  describe("handleMessageStream", () => {
    it("should handle successful stream", async () => {
      const mockHistory: GeminiMessage[][] = [
        [{ role: "user" as const, parts: [{ text: "hi" }] }],
      ];
      const mockStream = (async function* () {
        for (const h of mockHistory) yield h;
      })();
      const formatter = vi.fn(() => [
        { role: "user" as const, parts: [], rawHistoryIndex: 0 },
      ]);
      const onUpdate = vi.fn();

      const result = await handleMessageStream(mockStream, formatter, onUpdate);

      expect(result).toBe(true);
      expect(onUpdate).toHaveBeenCalled();
    });

    it("should handle AbortError", async () => {
      async function* throwingStream(): AsyncGenerator<
        GeminiMessage[],
        void,
        unknown
      > {
        yield []; // Required by ESLint even though we throw immediately
        throw new DOMException("Aborted", "AbortError");
      }
      const formatter = vi.fn(() => [
        { role: "user" as const, parts: [], rawHistoryIndex: 0 },
      ]);
      const onUpdate = vi.fn();

      const result = await handleMessageStream(
        throwingStream(),
        formatter,
        onUpdate,
      );

      expect(result).toBe(false);
    });
  });

  describe("createGeminiErrorMessage", () => {
    it("should create error message with Error prefix", () => {
      const chatHistory: GeminiMessage[] = [];
      const result = createGeminiErrorMessage("Test error", chatHistory);

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("error");
    });

    it("should not duplicate Error prefix", () => {
      const chatHistory: GeminiMessage[] = [];
      const result = createGeminiErrorMessage("Error: Test", chatHistory);

      const firstPart = result[0]?.parts[0];
      expect(firstPart && "text" in firstPart ? firstPart.text : "").toBe(
        "Error: Test",
      );
    });
  });

  describe("createOpenAIErrorMessage", () => {
    it("should create error message", () => {
      const chatHistory: OpenAIMessage[] = [];
      const result = createOpenAIErrorMessage(chatHistory, "Test error");

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("model");
    });
  });

  describe("validateMcpConnection", () => {
    it("should pass for connected status", async () => {
      await expect(
        validateMcpConnection("connected", null, vi.fn()),
      ).resolves.toBeUndefined();
    });

    it("should throw for error status", async () => {
      const checkMcp = vi.fn().mockResolvedValue(undefined);
      await expect(
        validateMcpConnection("error", "Test error", checkMcp),
      ).rejects.toThrow("MCP connection failed");
      expect(checkMcp).toHaveBeenCalled();
    });
  });
});
