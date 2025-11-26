import type { RealtimeItem } from "@openai/agents/realtime";
import type { UIMessage, UIPart, UIToolPart } from "#webui/types/messages";

interface SupervisorActivityPart {
  type: "thought" | "tool" | "text";
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string | null;
  isError?: boolean;
}

/**
 * Extracts text content from a message RealtimeItem's content array
 * @param {RealtimeItem} item - The realtime item (must be a message type)
 * @returns {string | null} The text content if found
 */
function extractTextFromItem(item: RealtimeItem): string | null {
  // Only message items have content
  if (item.type !== "message") {
    return null;
  }

  // Access content safely - it exists on message items
  const messageItem = item as {
    type: "message";
    role?: string;
    content?: Array<{
      type:
        | "input_text"
        | "output_text"
        | "input_audio"
        | "output_audio"
        | "audio";
      text?: string;
      transcript?: string;
    }>;
  };

  console.log("[Message Converter] extractTextFromItem:", {
    role: messageItem.role,
    hasContent: Boolean(messageItem.content),
    contentIsArray: Array.isArray(messageItem.content),
    contentLength: messageItem.content?.length ?? 0,
  });
  console.log(
    "[Message Converter] Full content structure:",
    JSON.stringify(messageItem.content, null, 2),
  );

  if (!messageItem.content || !Array.isArray(messageItem.content)) {
    return null;
  }

  for (const contentItem of messageItem.content) {
    // Input text from user
    if (contentItem.type === "input_text" && contentItem.text) {
      return contentItem.text;
    }
    // Output text from assistant
    if (contentItem.type === "output_text" && contentItem.text) {
      return contentItem.text;
    }
    // Input audio with transcript
    if (contentItem.type === "input_audio" && contentItem.transcript) {
      return contentItem.transcript;
    }
    // Output audio with transcript (can be "output_audio" or just "audio")
    if (
      (contentItem.type === "output_audio" || contentItem.type === "audio") &&
      contentItem.transcript
    ) {
      return contentItem.transcript;
    }
  }

  return null;
}

/**
 * Converts a RealtimeItem from the voice session to a UIMessage for display
 * @param {RealtimeItem} item - The realtime item to convert
 * @param {number} index - The index in the history (used for rawHistoryIndex)
 * @returns {UIMessage | null} The converted message, or null if not displayable
 */
export function convertRealtimeItemToUIMessage(
  item: RealtimeItem,
  index: number,
): UIMessage | null {
  // Access optional properties safely for debug logging
  const itemAny = item as Record<string, unknown>;
  console.log("[Message Converter] convertRealtimeItemToUIMessage called:", {
    index,
    type: item.type,
    role: itemAny.role,
    status: itemAny.status,
  });

  // Only convert message items
  if (item.type !== "message") {
    console.log("[Message Converter] Skipping non-message item");
    return null;
  }

  // Try to extract text - if content is available, show it regardless of status
  // Assistant messages remain "in_progress" during streaming, but we want to show them
  const text = extractTextFromItem(item);
  if (!text) {
    console.log("[Message Converter] No text extracted from item");
    return null;
  }

  const parts: UIPart[] = [
    {
      type: "text",
      content: text,
    },
  ];

  // Determine role
  const role = item.role === "user" ? "user" : "model";

  console.log("[Message Converter] Successfully converted item:", {
    index,
    itemType: item.type,
    itemRole: item.role,
    uiRole: role,
    text: text.substring(0, 50),
  });

  return {
    role,
    parts,
    rawHistoryIndex: index,
  };
}

/**
 * Converts a tool call from voice session to UIToolPart
 * @param {string} name - Tool name
 * @param {Record<string, unknown>} args - Tool arguments
 * @param {string | null} result - Tool result
 * @param {boolean} isError - Whether the tool call resulted in an error
 * @returns {UIToolPart} The tool part for display
 */
export function createToolPart(
  name: string,
  args: Record<string, unknown>,
  result: string | null,
  isError = false,
): UIToolPart {
  return {
    type: "tool",
    name,
    args,
    result,
    isError,
  };
}

/**
 * Converts supervisor activity parts to UI parts for rendering
 * @param {SupervisorActivityPart[]} activities - Supervisor activities to convert
 * @returns {UIPart[]} Array of UI parts
 */
function convertSupervisorActivityToParts(
  activities: SupervisorActivityPart[],
): UIPart[] {
  console.log(
    "[Message Converter] convertSupervisorActivityToParts called with",
    activities.length,
    "activities",
  );

  return activities.map((activity, index) => {
    console.log(
      `[Message Converter] Converting activity ${index}:`,
      activity.type,
    );

    if (activity.type === "thought") {
      return {
        type: "thought" as const,
        content: activity.content ?? "",
      };
    }
    if (activity.type === "tool") {
      console.log(`[Message Converter] Tool activity: ${activity.name}`);
      return {
        type: "tool" as const,
        name: activity.name ?? "",
        args: activity.args ?? {},
        result: activity.result ?? null,
        isError: activity.isError,
      };
    }
    // activity.type === "text"
    console.log(
      `[Message Converter] Text activity, content length:`,
      activity.content?.length ?? 0,
    );
    console.log(
      `[Message Converter] Text content preview:`,
      activity.content?.substring(0, 100),
    );
    return {
      type: "text" as const,
      content: activity.content ?? "",
    };
  });
}

interface SupervisorActivitiesWithTimestamp {
  activities: SupervisorActivityPart[];
  timestamp: number;
  targetHistoryIndex: number;
}

/**
 * Converts a history of RealtimeItems to UIMessages
 * @param {RealtimeItem[]} history - The voice session history
 * @param {Map<number, SupervisorActivitiesWithTimestamp>} supervisorActivities - Optional supervisor activities per message with timestamps
 * @param {string} streamingText - Optional streaming text from supervisor (shown while streaming)
 * @returns {UIMessage[]} Array of UI messages for display
 */
export function convertRealtimeHistoryToUIMessages(
  history: RealtimeItem[],
  supervisorActivities?: Map<number, SupervisorActivitiesWithTimestamp>,
  streamingText?: string,
): UIMessage[] {
  console.log("[Message Converter] Converting history:", {
    historyLength: history.length,
    supervisorActivitiesSize: supervisorActivities?.size ?? 0,
    supervisorActivityKeys: supervisorActivities
      ? Array.from(supervisorActivities.keys())
      : [],
  });

  const messages: UIMessage[] = [];
  const processedSupervisorIndices = new Set<number>();

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (!item) continue;
    const uiMessage = convertRealtimeItemToUIMessage(item, i);
    if (uiMessage) {
      // Use index-based timestamp for stable ordering (each index = 1 second apart)
      // Supervisor messages get timestamp - 500ms to appear before their voice response
      const baseTimestamp = i * 1000;
      uiMessage.timestamp = baseTimestamp;

      // Check if this message index has supervisor activities
      const supervisorData = supervisorActivities?.get(i);
      if (supervisorData) {
        processedSupervisorIndices.add(i);
        console.log(
          "[Message Converter] Found supervisor activities for index:",
          i,
        );
        console.log(
          "[Message Converter] Activities detail:",
          JSON.stringify(supervisorData.activities, null, 2),
        );
        const supervisorParts = convertSupervisorActivityToParts(
          supervisorData.activities,
        );
        console.log(
          "[Message Converter] Converted supervisor parts:",
          supervisorParts,
        );

        // Create a separate message bubble for supervisor activities (tools + thought)
        // Give it a slightly earlier timestamp so it appears before the voice response
        const supervisorMessage: UIMessage = {
          role: "model",
          parts: supervisorParts,
          rawHistoryIndex: i,
          timestamp: baseTimestamp - 500, // 500ms before voice response
        };
        messages.push(supervisorMessage);

        console.log(
          "[Message Converter] Created supervisor message with parts:",
          JSON.stringify(supervisorParts.map((p) => p.type)),
        );
      }

      // Push the voice agent's spoken response as a separate message bubble
      messages.push(uiMessage);
    }
  }

  // Add any supervisor activities that weren't matched to existing messages
  // This ensures they appear immediately even if voice response hasn't arrived
  if (supervisorActivities) {
    for (const [targetIndex, data] of supervisorActivities.entries()) {
      // Skip if already processed or if data is missing (defensive check for untyped Maps)
      if (
        processedSupervisorIndices.has(targetIndex) ||
        !(data as SupervisorActivitiesWithTimestamp | undefined)?.activities
      ) {
        continue;
      }
      const baseTimestamp = targetIndex * 1000;
      console.log(
        "[Message Converter] Adding unmatched supervisor activities for index:",
        targetIndex,
      );
      const supervisorParts = convertSupervisorActivityToParts(data.activities);
      const supervisorMessage: UIMessage = {
        role: "model",
        parts: supervisorParts,
        rawHistoryIndex: targetIndex,
        timestamp: baseTimestamp - 500,
      };
      messages.push(supervisorMessage);
    }
  }

  // Add streaming text as a partial thought message if present
  // This shows the supervisor's response character-by-character as it streams
  if (streamingText && streamingText.length > 0) {
    console.log(
      "[Message Converter] Adding streaming text:",
      streamingText.substring(0, 50),
    );
    const streamingMessage: UIMessage = {
      role: "model",
      parts: [{ type: "thought", content: streamingText }],
      rawHistoryIndex: history.length,
      timestamp: Date.now(),
    };
    messages.push(streamingMessage);
  }

  // Sort messages by timestamp to ensure correct order
  messages.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  console.log("[Message Converter] Converted messages:", messages.length);

  return messages;
}

/**
 * Merges voice messages with existing text chat messages
 * Voice messages are appended after the last text message
 * @param {UIMessage[]} textMessages - Existing text chat messages
 * @param {UIMessage[]} voiceMessages - Voice transcript messages
 * @returns {UIMessage[]} Combined messages array
 */
export function mergeTextAndVoiceMessages(
  textMessages: UIMessage[],
  voiceMessages: UIMessage[],
): UIMessage[] {
  // Voice messages get indices starting after text messages
  const offsetMessages = voiceMessages.map((msg, i) => ({
    ...msg,
    rawHistoryIndex: textMessages.length + i,
  }));

  return [...textMessages, ...offsetMessages];
}
