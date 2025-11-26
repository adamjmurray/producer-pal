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
    it("should convert function_call items to tool call messages", () => {
      const item: RealtimeItem = {
        type: "function_call",
        itemId: "1",
        name: "test_fn",
        arguments: '{"key": "value"}',
        status: "completed",
        output: null,
      };
      const result = convertRealtimeItemToUIMessage(item, 0);
      expect(result).toEqual({
        role: "model",
        parts: [
          {
            type: "tool",
            name: "test_fn",
            args: { key: "value" },
            result: null,
            isError: false,
          },
        ],
        rawHistoryIndex: 0,
      });
    });

    it.each([
      ["input_text", "user", "user"],
      ["output_text", "assistant", "model"],
      ["input_audio", "user", "user"],
      ["output_audio", "assistant", "model"],
    ])(
      "should convert %s content from %s role",
      (contentType, role, expectedRole) => {
        const textKey = contentType.includes("text") ? "text" : "transcript";
        const content = [{ type: contentType, [textKey]: "content" }];
        const item = {
          type: "message",
          itemId: "1",
          role,
          status: "completed",
          content,
        } as unknown as RealtimeItem;
        const result = convertRealtimeItemToUIMessage(item, 0);
        expect(result?.role).toBe(expectedRole);
        expect(result?.parts[0]?.type).toBe("text");
      },
    );

    it.each([
      [
        "empty content",
        {
          type: "message",
          itemId: "1",
          role: "user",
          status: "completed",
          content: [],
        },
      ],
      [
        "no content",
        { type: "message", itemId: "2", role: "user", status: "completed" },
      ],
      [
        "non-array content",
        {
          type: "message",
          itemId: "3",
          role: "user",
          status: "completed",
          content: "str",
        },
      ],
      [
        "function_call_output",
        {
          type: "function_call_output",
          itemId: "4",
          call_id: "c1",
          output: "{}",
        },
      ],
    ])("should return null for %s", (_, item) => {
      expect(
        convertRealtimeItemToUIMessage(item as unknown as RealtimeItem, 0),
      ).toBeNull();
    });

    it("should handle function_call with invalid JSON arguments", () => {
      const item: RealtimeItem = {
        type: "function_call",
        itemId: "9",
        name: "test_fn",
        arguments: "invalid json {",
        status: "completed",
        output: null,
      };
      const result = convertRealtimeItemToUIMessage(item, 8);
      expect(result?.parts[0]).toEqual({
        type: "tool",
        name: "test_fn",
        args: { raw: "invalid json {" },
        result: null,
        isError: false,
      });
    });

    it("should look up function_call result from outputMap", () => {
      const item = {
        type: "function_call",
        itemId: "10",
        name: "test_fn",
        arguments: "{}",
        status: "completed",
        output: null,
        call_id: "call_abc",
      } as unknown as RealtimeItem;
      const outputMap = new Map([["call_abc", '{"success": true}']]);
      const result = convertRealtimeItemToUIMessage(item, 9, outputMap);
      expect(result?.parts[0]).toEqual({
        type: "tool",
        name: "test_fn",
        args: {},
        result: '{"success": true}',
        isError: false,
      });
    });
  });

  describe("convertRealtimeHistoryToUIMessages", () => {
    it("should convert array of realtime items to UI messages including function calls", () => {
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
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
        rawHistoryIndex: 0,
        timestamp: 0, // index 0 * 1000
      });
      expect(result[1]).toEqual({
        role: "model",
        parts: [
          {
            type: "tool",
            name: "test_fn",
            args: {},
            result: null,
            isError: false,
          },
        ],
        rawHistoryIndex: 1,
        timestamp: 1000, // index 1 * 1000
      });
      expect(result[2]).toEqual({
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

    it("should attach function_call_output result to corresponding function_call", () => {
      const history: RealtimeItem[] = [
        {
          type: "function_call",
          itemId: "1",
          name: "test_fn",
          arguments: '{"param": "value"}',
          status: "completed",
          output: null,
          call_id: "call_xyz",
        } as unknown as RealtimeItem,
        {
          type: "function_call_output",
          itemId: "2",
          call_id: "call_xyz",
          output: '{"result": "success"}',
        } as unknown as RealtimeItem,
        {
          type: "message",
          itemId: "3",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Done" }],
        } as unknown as RealtimeItem,
      ];
      const result = convertRealtimeHistoryToUIMessages(history);
      // Should have 2 messages: function_call (with result) and assistant message
      // function_call_output is skipped
      expect(result).toHaveLength(2);
      expect(result[0]?.parts[0]).toEqual({
        type: "tool",
        name: "test_fn",
        args: { param: "value" },
        result: '{"result": "success"}',
        isError: false,
      });
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

    it("should handle text type supervisor activity", () => {
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
                type: "text" as const,
                content: "Some text content",
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
      // First message is supervisor text activity
      expect(result[0]?.parts[0]).toEqual({
        type: "text",
        content: "Some text content",
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

    it("should handle streaming text appropriately", () => {
      // Empty streaming text is ignored
      expect(
        convertRealtimeHistoryToUIMessages([], undefined, ""),
      ).toHaveLength(0);

      // Streaming text shows as thought
      const withStreaming = convertRealtimeHistoryToUIMessages(
        [],
        undefined,
        "Streaming...",
      );
      expect(withStreaming).toHaveLength(1);
      expect(withStreaming[0]?.parts[0]).toEqual({
        type: "thought",
        content: "Streaming...",
      });

      // Streaming appears alongside history
      const history: RealtimeItem[] = [
        {
          type: "message",
          itemId: "1",
          role: "user",
          status: "completed",
          content: [{ type: "input_text", text: "Hi" }],
        } as unknown as RealtimeItem,
      ];
      const result = convertRealtimeHistoryToUIMessages(
        history,
        undefined,
        "Thinking...",
      );
      expect(result).toHaveLength(2);
      expect(result[0]?.role).toBe("user");
      expect(result[1]?.parts[0]).toEqual({
        type: "thought",
        content: "Thinking...",
      });
    });
  });

  describe("createToolPart", () => {
    it("should create tool parts with various configurations", () => {
      const success = createToolPart("tool", { arg: "val" }, "success");
      expect(success).toEqual({
        type: "tool",
        name: "tool",
        args: { arg: "val" },
        result: "success",
        isError: false,
      });

      const error = createToolPart("tool", {}, "failed", true);
      expect(error.isError).toBe(true);

      const nullResult = createToolPart("tool", {}, null);
      expect(nullResult.result).toBeNull();
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

    it("should handle empty arrays", () => {
      const oneMessage: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "msg" }],
          rawHistoryIndex: 0,
        },
      ];
      expect(mergeTextAndVoiceMessages(oneMessage, [])).toHaveLength(1);
      expect(mergeTextAndVoiceMessages([], oneMessage)).toHaveLength(1);
    });
  });
});
