/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { openaiAdapter } from "./openai-adapter";
import { OpenAIClient } from "#webui/chat/openai-client";
import type { OpenAIMessage } from "#webui/types/messages";
import { buildOpenAIConfig } from "../settings/config-builders";
import { formatOpenAIMessages } from "#webui/chat/openai-formatter";
import { createOpenAIErrorMessage } from "./helpers/streaming-helpers";

// Mock OpenAIClient
// @ts-expect-error vi.mock partial implementation
vi.mock(import("#webui/chat/openai-client"), () => ({
  OpenAIClient: vi.fn(),
}));

// Mock config builder
vi.mock(import("../settings/config-builders"), () => ({
  buildOpenAIConfig: vi.fn(
    (model, temp, thinking, baseUrl, showThoughts, tools, history) => ({
      model,
      temperature: temp,
      thinking,
      baseUrl,
      showThoughts,
      enabledTools: tools,
      chatHistory: history,
    }),
  ),
}));

// Mock formatters and helpers
vi.mock(import("#webui/chat/openai-formatter"), () => ({
  formatOpenAIMessages: vi.fn((messages) =>
    messages.map((msg: OpenAIMessage, idx: number) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [
        {
          type: "text",
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        },
      ],
      rawHistoryIndex: idx,
    })),
  ),
}));

vi.mock(import("./helpers/streaming-helpers"), () => ({
  createOpenAIErrorMessage: vi.fn((chatHistory, error) => [
    ...chatHistory.map((msg: OpenAIMessage, idx: number) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [
        {
          type: "text",
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        },
      ],
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

describe("openai-adapter", () => {
  describe("createClient", () => {
    it("creates OpenAIClient with API key and config", () => {
      const apiKey = "test-api-key";
      const config = {
        model: "gpt-4",
        temperature: 1.0,
        systemInstruction: "Test instruction",
        enabledTools: {},
      };

      openaiAdapter.createClient(apiKey, config);

      expect(OpenAIClient).toHaveBeenCalledWith(apiKey, config);
    });
  });

  describe("buildConfig", () => {
    it("calls buildOpenAIConfig with correct parameters", () => {
      openaiAdapter.buildConfig("gpt-4", 1.0, "Low", {}, undefined, {
        baseUrl: "https://api.openai.com/v1",
      });

      expect(buildOpenAIConfig).toHaveBeenCalledWith(
        "gpt-4",
        1.0,
        "Low",
        "https://api.openai.com/v1",
        false,
        {},
        undefined,
      );
    });

    it("extracts baseUrl from extraParams", () => {
      openaiAdapter.buildConfig("gpt-4", 1.0, "Low", {}, undefined, {
        baseUrl: "https://custom.api.com/v1",
      });

      expect(buildOpenAIConfig).toHaveBeenCalledWith(
        "gpt-4",
        1.0,
        "Low",
        "https://custom.api.com/v1",
        false,
        {},
        undefined,
      );
    });

    it("handles undefined baseUrl in extraParams", () => {
      openaiAdapter.buildConfig("gpt-4", 1.0, "Low", {}, undefined, {});

      expect(buildOpenAIConfig).toHaveBeenCalledWith(
        "gpt-4",
        1.0,
        "Low",
        undefined,
        false,
        {},
        undefined,
      );
    });

    it("handles missing extraParams gracefully", () => {
      openaiAdapter.buildConfig("gpt-4", 1.0, "Low", {}, undefined);

      expect(buildOpenAIConfig).toHaveBeenCalledWith(
        "gpt-4",
        1.0,
        "Low",
        undefined,
        false,
        {},
        undefined,
      );
    });

    it("passes chatHistory when provided", () => {
      const chatHistory: OpenAIMessage[] = [{ role: "user", content: "Hello" }];

      openaiAdapter.buildConfig("gpt-4", 1.0, "Low", {}, chatHistory, {
        baseUrl: "https://api.openai.com/v1",
      });

      expect(buildOpenAIConfig).toHaveBeenCalledWith(
        "gpt-4",
        1.0,
        "Low",
        "https://api.openai.com/v1",
        false,
        {},
        chatHistory,
      );
    });

    it("extracts showThoughts from extraParams", () => {
      openaiAdapter.buildConfig("gpt-4", 1.0, "Low", {}, undefined, {
        baseUrl: "https://openrouter.ai/api/v1",
        showThoughts: true,
      });

      expect(buildOpenAIConfig).toHaveBeenCalledWith(
        "gpt-4",
        1.0,
        "Low",
        "https://openrouter.ai/api/v1",
        true,
        {},
        undefined,
      );
    });
  });

  describe("formatMessages", () => {
    it("delegates to formatOpenAIMessages", () => {
      const messages: OpenAIMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];

      const result = openaiAdapter.formatMessages(messages);

      expect(formatOpenAIMessages).toHaveBeenCalledWith(messages);
      expect(result).toHaveLength(2);
      expect(result[0]?.role).toBe("user");
      expect(result[1]?.role).toBe("model");
    });
  });

  describe("createErrorMessage", () => {
    it("delegates to createOpenAIErrorMessage with correct argument order", () => {
      const error = new Error("Test error");
      const chatHistory: OpenAIMessage[] = [{ role: "user", content: "Hello" }];

      const result = openaiAdapter.createErrorMessage(error, chatHistory);

      // Note: createOpenAIErrorMessage takes (chatHistory, error) - different order than Gemini
      expect(createOpenAIErrorMessage).toHaveBeenCalledWith(chatHistory, error);
      expect(result[result.length - 1]?.parts[0]?.type).toBe("error");
    });

    it("handles string errors", () => {
      const error = "String error";
      const chatHistory: OpenAIMessage[] = [];

      const result = openaiAdapter.createErrorMessage(error, chatHistory);

      const lastPart = result[result.length - 1]?.parts[0];

      expect(lastPart).toBeDefined();
      expect(lastPart).toHaveProperty("content");
      expect((lastPart as { content: string }).content).toContain(
        "String error",
      );
    });
  });

  describe("extractUserMessage", () => {
    it("extracts content from user messages with string content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: "Hello world",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBe("Hello world");
    });

    it("trims extracted content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: "  Hello world  ",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBe("Hello world");
    });

    it("returns undefined for non-user role", () => {
      const message: OpenAIMessage = {
        role: "assistant",
        content: "Hello world",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });

    it("returns undefined for non-string content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
          },
        ],
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });

    it("returns undefined for system role", () => {
      const message: OpenAIMessage = {
        role: "system",
        content: "System message",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });

    it("returns undefined for tool role", () => {
      const message: OpenAIMessage = {
        role: "tool",
        content: "Tool result",
        tool_call_id: "123",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBeUndefined();
    });

    it("handles empty string content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: "",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBe("");
    });

    it("handles whitespace-only content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: "   \n\t   ",
      };

      const result = openaiAdapter.extractUserMessage(message);

      expect(result).toBe("");
    });
  });

  describe("createUserMessage", () => {
    it("creates OpenAI message with role and content", () => {
      const text = "Hello world";

      const result = openaiAdapter.createUserMessage(text);

      expect(result).toEqual({
        role: "user",
        content: "Hello world",
      });
    });

    it("preserves whitespace in message", () => {
      const text = "  Line 1\n  Line 2  ";

      const result = openaiAdapter.createUserMessage(text);

      expect(result.content).toBe("  Line 1\n  Line 2  ");
    });

    it("handles empty string", () => {
      const text = "";

      const result = openaiAdapter.createUserMessage(text);

      expect(result.content).toBe("");
    });
  });
});
