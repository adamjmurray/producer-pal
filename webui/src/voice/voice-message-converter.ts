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
 * Builds a map of call_id to output from function_call_output items in history
 * @param {RealtimeItem[]} history - The voice session history
 * @returns {Map<string, string>} Map of call_id to output content
 */
function buildFunctionOutputMap(history: RealtimeItem[]): Map<string, string> {
  const outputMap = new Map<string, string>();

  for (const item of history) {
    const itemType = (item as { type: string }).type;
    if (itemType === "function_call_output") {
      const outputItem = item as unknown as {
        type: "function_call_output";
        call_id?: string;
        output?: string;
      };
      if (outputItem.call_id && outputItem.output) {
        outputMap.set(outputItem.call_id, outputItem.output);
      }
    }
  }

  return outputMap;
}

/**
 * Converts a function_call RealtimeItem to a UIMessage showing the tool call
 * @param {RealtimeItem} item - The realtime item (must be function_call type)
 * @param {number} index - The index in the history
 * @param {Map<string, string>} outputMap - Map of call_id to output content
 * @returns {UIMessage | null} The tool call message, or null if not displayable
 */
function convertFunctionCallToUIMessage(
  item: RealtimeItem,
  index: number,
  outputMap: Map<string, string>,
): UIMessage | null {
  // Access function_call properties safely
  const funcItem = item as {
    type: "function_call";
    name?: string;
    arguments?: string;
    call_id?: string;
    status?: string;
  };

  // Look up result from output map
  const result = funcItem.call_id
    ? (outputMap.get(funcItem.call_id) ?? null)
    : null;

  // Parse arguments if available
  let args: Record<string, unknown> = {};
  if (funcItem.arguments) {
    try {
      args = JSON.parse(funcItem.arguments);
    } catch {
      args = { raw: funcItem.arguments };
    }
  }

  const toolPart: UIPart = {
    type: "tool",
    name: funcItem.name ?? "unknown",
    args,
    result,
    isError: false,
  };

  return {
    role: "model",
    parts: [toolPart],
    rawHistoryIndex: index,
  };
}

/**
 * Converts a RealtimeItem from the voice session to a UIMessage for display
 * @param {RealtimeItem} item - The realtime item to convert
 * @param {number} index - The index in the history (used for rawHistoryIndex)
 * @param {Map<string, string>} outputMap - Map of call_id to output content for function calls
 * @returns {UIMessage | null} The converted message, or null if not displayable
 */
export function convertRealtimeItemToUIMessage(
  item: RealtimeItem,
  index: number,
  outputMap: Map<string, string> = new Map(),
): UIMessage | null {
  // Handle different item types - cast to string for comparison since TypeScript
  // only knows about "message" and "function_call", but runtime may have others
  const itemType = item.type as string;

  if (itemType === "function_call") {
    // Show the realtime agent's tool calls (e.g., getNextResponseFromSupervisor)
    return convertFunctionCallToUIMessage(item, index, outputMap);
  }

  if (itemType !== "message") {
    // Skip function_call_output and any other types
    return null;
  }

  // At this point we know it's a message item - cast for type safety
  const messageItem = item as { type: "message"; role?: string };

  // Try to extract text - if content is available, show it regardless of status
  // Assistant messages remain "in_progress" during streaming, but we want to show them
  const text = extractTextFromItem(item);
  if (!text) {
    return null;
  }

  const parts: UIPart[] = [
    {
      type: "text",
      content: text,
    },
  ];

  // Determine role
  const role = messageItem.role === "user" ? "user" : "model";

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
  return activities.map((activity) => {
    if (activity.type === "thought") {
      return { type: "thought" as const, content: activity.content ?? "" };
    }
    if (activity.type === "tool") {
      return {
        type: "tool" as const,
        name: activity.name ?? "",
        args: activity.args ?? {},
        result: activity.result ?? null,
        isError: activity.isError,
      };
    }
    return { type: "text" as const, content: activity.content ?? "" };
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
  // Build map of function call outputs first so we can attach results to function calls
  const outputMap = buildFunctionOutputMap(history);
  const messages: UIMessage[] = [];
  const processedSupervisorIndices = new Set<number>();

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (!item) continue;
    const uiMessage = convertRealtimeItemToUIMessage(item, i, outputMap);
    if (uiMessage) {
      // Use index-based timestamp for stable ordering (each index = 1 second apart)
      // Supervisor messages get timestamp - 500ms to appear before their voice response
      const baseTimestamp = i * 1000;
      uiMessage.timestamp = baseTimestamp;

      // Check if this message index has supervisor activities
      const supervisorData = supervisorActivities?.get(i);
      if (supervisorData) {
        processedSupervisorIndices.add(i);
        const supervisorParts = convertSupervisorActivityToParts(
          supervisorData.activities,
        );
        // Create a separate message bubble for supervisor activities (tools + thought)
        // Give it a slightly earlier timestamp so it appears before the voice response
        const supervisorMessage: UIMessage = {
          role: "model",
          parts: supervisorParts,
          rawHistoryIndex: i,
          timestamp: baseTimestamp - 500,
        };
        messages.push(supervisorMessage);
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
      const supervisorParts = convertSupervisorActivityToParts(data.activities);
      messages.push({
        role: "model",
        parts: supervisorParts,
        rawHistoryIndex: targetIndex,
        timestamp: baseTimestamp - 500,
      });
    }
  }

  // Add streaming text as a partial thought message if present
  if (streamingText && streamingText.length > 0) {
    messages.push({
      role: "model",
      parts: [{ type: "thought", content: streamingText }],
      rawHistoryIndex: history.length,
      timestamp: Date.now(),
    });
  }

  // Sort messages by timestamp to ensure correct order
  messages.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
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
