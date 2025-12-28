/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { geminiAdapter } from "./gemini-adapter";
import { GeminiClient } from "#webui/chat/gemini-client";
import type { GeminiMessage } from "#webui/types/messages";
import { buildGeminiConfig } from "../settings/config-builders";
import { formatGeminiMessages } from "#webui/chat/gemini-formatter";
import { createGeminiErrorMessage } from "./helpers/streaming-helpers";

// Mock GeminiClient
// @ts-expect-error vi.mock partial implementation
vi.mock(import("#webui/chat/gemini-client"), () => ({
  GeminiClient: vi.fn(),
}));

// Mock config builder
vi.mock(import("../settings/config-builders"), () => ({
  buildGeminiConfig: vi.fn(
    (model, temp, thinking, showThoughts, tools, history) => ({
      model,
      temperature: temp,
      thinking,
      showThoughts,
      enabledTools: tools,
      chatHistory: history,
    }),
  ),
}));

// Mock formatters and helpers
vi.mock(import("#webui/chat/gemini-formatter"), () => ({
  formatGeminiMessages: vi.fn((messages) =>
    messages.map((msg: GeminiMessage, idx: number) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: (msg.parts ?? []).map((part) => ({
        type: "text",
        content: part.text ?? "",
      })),
      rawHistoryIndex: idx,
    })),
  ),
}));

vi.mock(import("./helpers/streaming-helpers"), () => ({
  createGeminiErrorMessage: vi.fn((error, chatHistory) => [
    ...chatHistory.map((msg: GeminiMessage, idx: number) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: (msg.parts ?? []).map((part) => ({
        type: "text",
        content: part.text ?? "",
      })),
      rawHistoryIndex: idx,
    })),
    {
      role: "model",
      parts: [
        {
          type: "error",
          content: `${error}`,
          isError: true,
        },
      ],
      rawHistoryIndex: chatHistory.length,
    },
  ]),
}));

describe("gemini-adapter", () => {
  describe("createClient", () => {
    it("creates GeminiClient with API key and config", () => {
      const apiKey = "test-api-key";
      const config = {
        model: "gemini-2.5-flash",
        temperature: 1.0,
        systemInstruction: "Test instruction",
        enabledTools: {},
      };

      geminiAdapter.createClient(apiKey, config);

      expect(GeminiClient).toHaveBeenCalledWith(apiKey, config);
    });
  });

  describe("buildConfig", () => {
    it("calls buildGeminiConfig with correct parameters", () => {
      geminiAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Default",
        {},
        undefined,
        { showThoughts: true },
      );

      expect(buildGeminiConfig).toHaveBeenCalledWith(
        "gemini-2.5-flash",
        1.0,
        "Default",
        true,
        {},
        undefined,
      );
    });

    it("extracts showThoughts as true from extraParams", () => {
      geminiAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Default",
        {},
        undefined,
        { showThoughts: true },
      );

      expect(buildGeminiConfig).toHaveBeenCalledWith(
        "gemini-2.5-flash",
        1.0,
        "Default",
        true,
        {},
        undefined,
      );
    });

    it("extracts showThoughts as false from extraParams", () => {
      geminiAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Default",
        {},
        undefined,
        { showThoughts: false },
      );

      expect(buildGeminiConfig).toHaveBeenCalledWith(
        "gemini-2.5-flash",
        1.0,
        "Default",
        false,
        {},
        undefined,
      );
    });

    it("handles missing extraParams gracefully", () => {
      geminiAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Default",
        {},
        undefined,
      );

      expect(buildGeminiConfig).toHaveBeenCalledWith(
        "gemini-2.5-flash",
        1.0,
        "Default",
        false,
        {},
        undefined,
      );
    });

    it("handles undefined showThoughts in extraParams", () => {
      geminiAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Default",
        {},
        undefined,
        {},
      );

      expect(buildGeminiConfig).toHaveBeenCalledWith(
        "gemini-2.5-flash",
        1.0,
        "Default",
        false,
        {},
        undefined,
      );
    });

    it("passes chatHistory when provided", () => {
      const chatHistory: GeminiMessage[] = [
        { role: "user", parts: [{ text: "Hello" }] },
      ];

      geminiAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Default",
        {},
        chatHistory,
        { showThoughts: true },
      );

      expect(buildGeminiConfig).toHaveBeenCalledWith(
        "gemini-2.5-flash",
        1.0,
        "Default",
        true,
        {},
        chatHistory,
      );
    });
  });

  describe("formatMessages", () => {
    it("delegates to formatGeminiMessages", () => {
      const messages: GeminiMessage[] = [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi there" }] },
      ];

      const result = geminiAdapter.formatMessages(messages);

      expect(formatGeminiMessages).toHaveBeenCalledWith(messages);
      expect(result).toHaveLength(2);
      expect(result[0]?.role).toBe("user");
      expect(result[1]?.role).toBe("model");
    });
  });

  describe("createErrorMessage", () => {
    it("delegates to createGeminiErrorMessage", () => {
      const error = new Error("Test error");
      const chatHistory: GeminiMessage[] = [
        { role: "user", parts: [{ text: "Hello" }] },
      ];

      const result = geminiAdapter.createErrorMessage(error, chatHistory);

      expect(createGeminiErrorMessage).toHaveBeenCalledWith(error, chatHistory);
      expect(result[result.length - 1]?.parts[0]?.type).toBe("error");
    });

    it("handles string errors", () => {
      const error = "String error";
      const chatHistory: GeminiMessage[] = [];

      const result = geminiAdapter.createErrorMessage(error, chatHistory);

      const lastPart = result[result.length - 1]?.parts[0];

      expect(lastPart).toBeDefined();
      expect(lastPart).toHaveProperty("content");
      expect((lastPart as { content: string }).content).toContain(
        "String error",
      );
    });
  });

  describe("extractUserMessage", () => {
    it("extracts text from first text part", () => {
      const message: GeminiMessage = {
        role: "user",
        parts: [{ text: "Hello world" }],
      };

      const result = geminiAdapter.extractUserMessage(message);

      expect(result).toBe("Hello world");
    });

    it("trims extracted text", () => {
      const message: GeminiMessage = {
        role: "user",
        parts: [{ text: "  Hello world  " }],
      };

      const result = geminiAdapter.extractUserMessage(message);

      expect(result).toBe("Hello world");
    });

    it("returns undefined if no text part found", () => {
      const message: GeminiMessage = {
        role: "user",
        parts: [{ functionCall: { name: "test", args: {} } }],
      };

      const result = geminiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });

    it("handles empty parts array", () => {
      const message: GeminiMessage = {
        role: "user",
        parts: [],
      };

      const result = geminiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });

    it("finds first text part among multiple parts", () => {
      const message: GeminiMessage = {
        role: "user",
        parts: [
          { functionCall: { name: "test", args: {} } },
          { text: "Found me!" },
          { text: "Not me" },
        ],
      };

      const result = geminiAdapter.extractUserMessage(message);

      expect(result).toBe("Found me!");
    });

    it("handles undefined parts", () => {
      const message = {
        role: "user",
        parts: undefined,
      } as GeminiMessage;

      const result = geminiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });
  });

  describe("createUserMessage", () => {
    it("creates Gemini message with text part", () => {
      const text = "Hello world";

      const result = geminiAdapter.createUserMessage(text);

      expect(result).toEqual({
        role: "user",
        parts: [{ text: "Hello world" }],
      });
    });

    it("preserves whitespace in message", () => {
      const text = "  Line 1\n  Line 2  ";

      const result = geminiAdapter.createUserMessage(text);

      expect(result.parts?.[0]?.text).toBe("  Line 1\n  Line 2  ");
    });

    it("handles empty string", () => {
      const text = "";

      const result = geminiAdapter.createUserMessage(text);

      expect(result.parts?.[0]?.text).toBe("");
    });
  });
});
