import { describe, it, expect } from "vitest";
import type { RealtimeItem } from "@openai/agents/realtime";
import {
  convertRealtimeItemToUIMessage,
  convertRealtimeHistoryToUIMessages,
  createToolPart,
  mergeTextAndVoiceMessages,
} from "./voice-message-converter";
import type { UIMessage } from "#webui/types/messages";

interface SupervisorActivityPart {
  type: "thought" | "tool" | "text";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string | null;
  isError?: boolean;
}

interface SupervisorActivitiesWithTimestamp {
  activities: SupervisorActivityPart[];
  timestamp: number;
  targetHistoryIndex: number;
}

/**
 * Helper to create supervisor activities map entry for tests
 * @param {SupervisorActivityPart[]} activities - Supervisor activity parts
 * @param {number} targetHistoryIndex - Target history index
 * @returns {SupervisorActivitiesWithTimestamp} The supervisor data object
 */
function createSupervisorData(
  activities: SupervisorActivityPart[],
  targetHistoryIndex: number,
): SupervisorActivitiesWithTimestamp {
  return {
    activities,
    timestamp: Date.now(),
    targetHistoryIndex,
  };
}

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
        timestamp: 0, // index 0 * 1000
      });
      expect(result[1]).toEqual({
        role: "model",
        parts: [{ type: "text", content: "Hi" }],
        rawHistoryIndex: 2,
        timestamp: 2000, // index 2 * 1000
      });
    });

    it("should handle empty history", () => {
      const result = convertRealtimeHistoryToUIMessages([]);
      expect(result).toEqual([]);
    });

    it("should integrate supervisor tool call activities as separate bubble", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Response" }],
        } as unknown as RealtimeItem,
      ];
      const supervisorActivities = new Map([
        [
          0,
          createSupervisorData(
            [
              {
                type: "tool" as const,
                name: "test_tool",
                args: { param: "value" },
                result: "success",
              },
            ],
            0,
          ),
        ],
      ]);
      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // Now creates 2 messages: supervisor bubble + voice response bubble
      expect(result).toHaveLength(2);
      // First message is supervisor activities (sorted earlier by timestamp -500)
      expect(result[0]?.parts).toHaveLength(1);
      expect(result[0]?.parts[0]).toEqual({
        type: "tool",
        name: "test_tool",
        args: { param: "value" },
        result: "success",
        isError: undefined,
      });
      // Second message is the voice response
      expect(result[1]?.parts).toHaveLength(1);
      expect(result[1]?.parts[0]).toEqual({
        type: "text",
        content: "Response",
      });
    });

    it("should integrate supervisor thought activities as separate bubble", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Response" }],
        } as unknown as RealtimeItem,
      ];
      const supervisorActivities = new Map([
        [
          0,
          createSupervisorData(
            [
              {
                type: "thought" as const,
                content: "Thinking...",
              },
            ],
            0,
          ),
        ],
      ]);
      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // Now creates 2 messages: supervisor bubble + voice response bubble
      expect(result).toHaveLength(2);
      // First message is supervisor thought
      expect(result[0]?.parts).toHaveLength(1);
      expect(result[0]?.parts[0]).toEqual({
        type: "thought",
        content: "Thinking...",
      });
      // Second message is the voice response
      expect(result[1]?.parts).toHaveLength(1);
      expect(result[1]?.parts[0]).toEqual({
        type: "text",
        content: "Response",
      });
    });

    it("should integrate multiple supervisor tool calls in same bubble", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Done" }],
        } as unknown as RealtimeItem,
      ];
      const supervisorActivities = new Map([
        [
          0,
          createSupervisorData(
            [
              {
                type: "tool" as const,
                name: "tool_one",
                args: { a: 1 },
                result: "result 1",
              },
              {
                type: "tool" as const,
                name: "tool_two",
                args: { b: 2 },
                result: "result 2",
              },
            ],
            0,
          ),
        ],
      ]);
      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // 2 messages: supervisor bubble (with both tools) + voice response bubble
      expect(result).toHaveLength(2);
      // First message has both tools
      expect(result[0]?.parts).toHaveLength(2);
      expect(result[0]?.parts[0]?.type).toBe("tool");
      expect(result[0]?.parts[1]?.type).toBe("tool");
      // Second message is voice response
      expect(result[1]?.parts).toHaveLength(1);
      expect(result[1]?.parts[0]).toEqual({
        type: "text",
        content: "Done",
      });
    });

    it("should handle tool activities with errors", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Error occurred" }],
        } as unknown as RealtimeItem,
      ];
      const supervisorActivities = new Map([
        [
          0,
          createSupervisorData(
            [
              {
                type: "tool" as const,
                name: "failing_tool",
                args: {},
                result: '{"error": "Tool failed"}',
                isError: true,
              },
            ],
            0,
          ),
        ],
      ]);
      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // First message is supervisor with error tool
      expect(result[0]?.parts[0]).toEqual({
        type: "tool",
        name: "failing_tool",
        args: {},
        result: '{"error": "Tool failed"}',
        isError: true,
      });
    });

    it("should handle activities with missing optional fields", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Response" }],
        } as unknown as RealtimeItem,
      ];
      const supervisorActivities = new Map([
        [
          0,
          createSupervisorData(
            [
              {
                type: "tool" as const,
              },
              {
                type: "thought" as const,
              },
            ],
            0,
          ),
        ],
      ]);
      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // First message is supervisor activities
      expect(result[0]?.parts[0]).toEqual({
        type: "tool",
        name: "",
        args: {},
        result: null,
        isError: undefined,
      });
      expect(result[0]?.parts[1]).toEqual({
        type: "thought",
        content: "",
      });
      // Second message is voice response
      expect(result[1]?.parts[0]).toEqual({
        type: "text",
        content: "Response",
      });
    });

    it("should skip supervisor activities if undefined is returned from map", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Response" }],
        } as unknown as RealtimeItem,
      ];
      // Map has the key but get() would return undefined (edge case)
      const supervisorActivities = new Map();
      supervisorActivities.set(0, undefined);

      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // Should skip integration when activities is undefined
      expect(result).toHaveLength(1);
      expect(result[0]?.parts).toHaveLength(1);
      expect(result[0]?.parts[0]).toEqual({
        type: "text",
        content: "Response",
      });
    });

    it("should show unmatched supervisor activities immediately", () => {
      // History doesn't have a message at index 1 yet, but supervisor already completed
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "user",
          status: "completed",
          content: [{ type: "input_text", text: "Hello" }],
        } as unknown as RealtimeItem,
      ];
      // Supervisor activities targeting index 1 (no history item exists yet)
      const supervisorActivities = new Map([
        [
          1,
          createSupervisorData(
            [
              {
                type: "tool" as const,
                name: "ppal_connect",
                args: {},
                result: "Connected",
              },
            ],
            1,
          ),
        ],
      ]);
      const result = convertRealtimeHistoryToUIMessages(
        history,
        supervisorActivities,
      );
      // Should have user message + unmatched supervisor bubble
      expect(result).toHaveLength(2);
      expect(result[1]?.role).toBe("model");
      expect(result[1]?.parts[0]).toEqual({
        type: "tool",
        name: "ppal_connect",
        args: {},
        result: "Connected",
        isError: undefined,
      });
    });

    it("should add streaming text as thought message", () => {
      const history: RealtimeItem[] = [];
      const result = convertRealtimeHistoryToUIMessages(
        history,
        undefined,
        "Streaming response...",
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("model");
      expect(result[0]?.parts[0]).toEqual({
        type: "thought",
        content: "Streaming response...",
      });
    });

    it("should not add streaming text when empty", () => {
      const history: RealtimeItem[] = [];
      const result = convertRealtimeHistoryToUIMessages(history, undefined, "");
      expect(result).toHaveLength(0);
    });

    it("should add streaming text alongside other messages", () => {
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "user",
          status: "completed",
          content: [{ type: "input_text", text: "Hello" }],
        } as unknown as RealtimeItem,
      ];
      const result = convertRealtimeHistoryToUIMessages(
        history,
        undefined,
        "Thinking...",
      );
      expect(result).toHaveLength(2);
      // First is user message
      expect(result[0]?.role).toBe("user");
      // Second is streaming thought (sorted by timestamp - Date.now() is later)
      expect(result[1]?.role).toBe("model");
      expect(result[1]?.parts[0]).toEqual({
        type: "thought",
        content: "Thinking...",
      });
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
