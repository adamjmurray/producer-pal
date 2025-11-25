import { describe, it, expect } from "vitest";
import type { RealtimeItem } from "@openai/agents/realtime";
import {
  convertRealtimeItemToUIMessage,
  convertRealtimeHistoryToUIMessages,
  createToolPart,
  mergeTextAndVoiceMessages,
} from "./voice-message-converter";
import type { UIMessage } from "#webui/types/messages";

describe("voice-message-converter", () => {
  describe("convertRealtimeItemToUIMessage", () => {
    it("should return null for non-message items", () => {
      const item: RealtimeItem = {
        type: "function_call",
        itemId: "1",
        name: "test_fn",
        arguments: "{}",
        status: "completed",
        output: null,
      };
      const result = convertRealtimeItemToUIMessage(item, 0);
      expect(result).toBeNull();
    });

    it("should convert user message with input_text", () => {
      const item = {
        type: "message",
        itemId: "1",
        role: "user",
        status: "completed",
        content: [{ type: "input_text", text: "Hello world" }],
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 0);
      expect(result).toEqual({
        role: "user",
        parts: [{ type: "text", content: "Hello world" }],
        rawHistoryIndex: 0,
      });
    });

    it("should convert assistant message with output_text", () => {
      const item = {
        type: "message",
        itemId: "2",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Hi there" }],
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 1);
      expect(result).toEqual({
        role: "model",
        parts: [{ type: "text", content: "Hi there" }],
        rawHistoryIndex: 1,
      });
    });

    it("should convert user audio message with transcript", () => {
      const item = {
        type: "message",
        itemId: "3",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "Voice input" }],
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 2);
      expect(result).toEqual({
        role: "user",
        parts: [{ type: "text", content: "Voice input" }],
        rawHistoryIndex: 2,
      });
    });

    it("should convert assistant audio message with transcript", () => {
      const item = {
        type: "message",
        itemId: "4",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "Voice output" }],
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 3);
      expect(result).toEqual({
        role: "model",
        parts: [{ type: "text", content: "Voice output" }],
        rawHistoryIndex: 3,
      });
    });

    it("should return null for message with no extractable text", () => {
      const item = {
        type: "message",
        itemId: "5",
        role: "user",
        status: "completed",
        content: [],
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 4);
      expect(result).toBeNull();
    });

    it("should return null for message without content array", () => {
      const item = {
        type: "message",
        itemId: "6",
        role: "user",
        status: "completed",
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 5);
      expect(result).toBeNull();
    });

    it("should return null for message with non-array content", () => {
      const item = {
        type: "message",
        itemId: "7",
        role: "user",
        status: "completed",
        content: "not an array",
      } as unknown as RealtimeItem;
      const result = convertRealtimeItemToUIMessage(item, 6);
      expect(result).toBeNull();
    });
  });

  describe("convertRealtimeHistoryToUIMessages", () => {
    it("should convert array of realtime items to UI messages", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "user",
          status: "completed",
          content: [{ type: "input_text", text: "Hello" }],
        } as unknown as RealtimeItem,
        {
          type: "function_call",
          itemId: "2",
          name: "test_fn",
          arguments: "{}",
          status: "completed",
          output: null,
        },
        {
          type: "message",
          itemId: "3",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hi" }],
        } as unknown as RealtimeItem,
      ];
      const result = convertRealtimeHistoryToUIMessages(history);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
        rawHistoryIndex: 0,
      });
      expect(result[1]).toEqual({
        role: "model",
        parts: [{ type: "text", content: "Hi" }],
        rawHistoryIndex: 2,
      });
    });

    it("should handle empty history", () => {
      const result = convertRealtimeHistoryToUIMessages([]);
      expect(result).toEqual([]);
    });
  });

  describe("createToolPart", () => {
    it("should create a tool part with all properties", () => {
      const result = createToolPart("test_tool", { arg1: "value1" }, "success");
      expect(result).toEqual({
        type: "tool",
        name: "test_tool",
        args: { arg1: "value1" },
        result: "success",
        isError: false,
      });
    });

    it("should create an error tool part", () => {
      const result = createToolPart(
        "test_tool",
        { arg1: "value1" },
        "failed",
        true,
      );
      expect(result).toEqual({
        type: "tool",
        name: "test_tool",
        args: { arg1: "value1" },
        result: "failed",
        isError: true,
      });
    });

    it("should handle null result", () => {
      const result = createToolPart("test_tool", {}, null);
      expect(result.result).toBeNull();
    });
  });

  describe("mergeTextAndVoiceMessages", () => {
    it("should merge text and voice messages with correct indices", () => {
      const textMessages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Text 1" }],
          rawHistoryIndex: 0,
        },
        {
          role: "model",
          parts: [{ type: "text", content: "Response 1" }],
          rawHistoryIndex: 1,
        },
      ];
      const voiceMessages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Voice 1" }],
          rawHistoryIndex: 0,
        },
        {
          role: "model",
          parts: [{ type: "text", content: "Voice Response" }],
          rawHistoryIndex: 1,
        },
      ];
      const result = mergeTextAndVoiceMessages(textMessages, voiceMessages);
      expect(result).toHaveLength(4);
      expect(result[2]).toEqual({
        role: "user",
        parts: [{ type: "text", content: "Voice 1" }],
        rawHistoryIndex: 2,
      });
      expect(result[3]).toEqual({
        role: "model",
        parts: [{ type: "text", content: "Voice Response" }],
        rawHistoryIndex: 3,
      });
    });

    it("should handle empty voice messages", () => {
      const textMessages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Text 1" }],
          rawHistoryIndex: 0,
        },
      ];
      const result = mergeTextAndVoiceMessages(textMessages, []);
      expect(result).toHaveLength(1);
    });

    it("should handle empty text messages", () => {
      const voiceMessages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Voice 1" }],
          rawHistoryIndex: 0,
        },
      ];
      const result = mergeTextAndVoiceMessages([], voiceMessages);
      expect(result).toHaveLength(1);
      expect(result[0]?.rawHistoryIndex).toBe(0);
    });
  });
});
