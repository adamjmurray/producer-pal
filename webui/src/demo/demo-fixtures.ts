// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Fixture data for demo mode — realistic tool result scenarios
 * for visual testing of the chat UI.
 *
 * Data captured from real ppal-client calls against the e2e-test-set Live Set.
 */

import { type TokenUsage } from "#webui/chat/sdk/types";
import { type UIMessage } from "#webui/types/messages";

/** Tool name mapping for demo mode (mirrors real MCP tool display names) */
export const DEMO_TOOL_NAMES: Record<string, string> = {
  "ppal-connect": "Connect",
  "ppal-read-live-set": "Read Live Set",
  "ppal-read-track": "Read Track",
  "ppal-read-clip": "Read Clip",
  "ppal-update-clip": "Update Clip",
  "ppal-update-live-set": "Update Live Set",
  "ppal-select": "Select",
  "ppal-create-clip": "Create Clip",
  "nonexistent-tool": "nonexistent-tool",
};

/**
 * Build a tool result string matching the MCP content array format.
 * @param data - The tool result object
 * @param warnings - Optional warning strings to append as extra content blocks
 * @returns Serialized result string matching production format
 */
function toolResult(data: object, ...warnings: string[]): string {
  return JSON.stringify([
    { type: "text", text: JSON.stringify(data) },
    ...warnings.map((w) => ({ type: "text", text: w })),
  ]);
}

let idx = 0;

/**
 * @param text - User message text
 * @returns UIMessage for user
 */
function userMsg(text: string): UIMessage {
  return {
    role: "user",
    parts: [{ type: "text", content: text }],
    rawHistoryIndex: idx++,
    timestamp: Date.now() - 60000 * (20 - idx),
  };
}

/**
 * @param config - Message configuration
 * @param config.text - Optional text content
 * @param config.thought - Optional thinking/reasoning content
 * @param config.tools - Optional tool call(s) with results
 * @param config.error - Optional connection-level error
 * @param config.textAfter - Optional text after tool calls
 * @param config.responseModel - Optional model ID from API response
 * @param config.toolUsage - Optional usage for the tool call step
 * @param config.usage - Optional token usage for the final step
 * @returns UIMessage for model
 */
function modelMsg(config: {
  text?: string;
  thought?: string;
  tools?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: string | null;
    isError?: boolean;
  }>;
  error?: string;
  textAfter?: string;
  responseModel?: string;
  toolUsage?: TokenUsage;
  usage?: TokenUsage;
}): UIMessage {
  const parts: UIMessage["parts"] = [];

  if (config.thought) {
    parts.push({ type: "thought", content: config.thought });
  }

  if (config.text) {
    parts.push({ type: "text", content: config.text });
  }

  if (config.tools) {
    for (const tool of config.tools) {
      parts.push({
        type: "tool",
        name: tool.name,
        args: tool.args,
        result: tool.result,
        isError: tool.isError,
      });
    }

    if (config.toolUsage) {
      parts.push({ type: "step-usage", usage: config.toolUsage });
    }
  }

  if (config.error) {
    parts.push({ type: "error", content: config.error, isError: true });
  }

  if (config.textAfter) {
    parts.push({ type: "text", content: config.textAfter });
  }

  return {
    role: "model",
    parts,
    rawHistoryIndex: idx++,
    timestamp: Date.now() - 60000 * (20 - idx),
    responseModel: config.responseModel,
    usage: config.usage,
  };
}

// Real data captured from e2e-test-set via ppal-client
const CONNECT_RESULT = {
  connected: true,
  producerPalVersion: "1.4.3",
  abletonLiveVersion: "12.3.5",
  liveSet: {
    name: "e2e-test-set",
    tempo: 108,
    timeSignature: "4/4",
    sceneCount: 8,
    regularTrackCount: 12,
    returnTrackCount: 2,
    scale: "A Minor",
  },
};

const READ_TRACK_RESULT = {
  id: "1",
  type: "midi",
  name: "Drums",
  instrument: "Drum Rack",
  trackIndex: 0,
  sessionClipCount: 1,
  arrangementClipCount: 1,
  deviceCount: 1,
  state: "muted-via-solo",
};

const READ_CLIP_RESULT = {
  id: "13",
  type: "midi",
  name: "Beat",
  view: "session",
  trackIndex: 0,
  sceneIndex: 0,
  timeSignature: "4/4",
  looping: true,
  start: "1|1",
  end: "2|1",
  length: "1:0",
  notes: "v127 t/4 C1 1|1,3 v113 D1 1|2 v99 D1 1|4",
};

const UPDATE_CLIP_RESULT = { id: "44" };

// Tool name constants to avoid duplicate string violations
const TOOL_READ_TRACK = "ppal-read-track";
const TOOL_UPDATE_CLIP = "ppal-update-clip";

/** All demo scenarios as a flat conversation */
export const demoMessages: UIMessage[] = [
  // --- Scenario 1: Success (simple connect) ---
  userMsg("Connect to Ableton Live"),
  modelMsg({
    text: "I've connected to Ableton Live successfully. You're working with the **e2e-test-set** project at 108 BPM in A Minor.",
    tools: [
      {
        name: "ppal-connect",
        args: {},
        result: toolResult(CONNECT_RESULT),
      },
    ],
    usage: { inputTokens: 6078, outputTokens: 33, reasoningTokens: 22 },
  }),

  // --- Scenario 2: Success (read track — larger JSON) ---
  userMsg("Read the Drums track"),
  modelMsg({
    text: "Here's the Drums track info. It has a Drum Rack with 1 session clip and 1 arrangement clip.",
    tools: [
      {
        name: TOOL_READ_TRACK,
        args: { trackIndex: 0 },
        result: toolResult(READ_TRACK_RESULT),
      },
    ],
    responseModel: "gemini-2.5-flash-preview-05-20",
    usage: { inputTokens: 9496, outputTokens: 178 },
  }),

  // --- Scenario 3: Hard error (isError: true) ---
  userMsg("Read track 99"),
  modelMsg({
    text: "I couldn't read that track — it doesn't exist in this Live Set.",
    tools: [
      {
        name: TOOL_READ_TRACK,
        args: { trackIndex: 99 },
        result: JSON.stringify(
          "Error executing tool 'ppal-read-track': readTrack: trackIndex 99 does not exist",
        ),
        isError: true,
      },
    ],
  }),

  // --- Scenario 4: Heuristic error detection (result contains "error" key) ---
  userMsg("Read the clip at track 0, scene 5"),
  modelMsg({
    text: "There's no clip in that slot.",
    tools: [
      {
        name: "ppal-read-clip",
        args: { trackIndex: 0, sceneIndex: 5 },
        result: toolResult({
          error: "No clip in this slot",
          id: null,
          type: null,
          trackIndex: 0,
          sceneIndex: 5,
        }),
      },
    ],
  }),

  // --- Scenario 5: Success with one warning ---
  userMsg("Quantize the audio clip on track 4"),
  modelMsg({
    text: "I applied the update, but quantization was skipped because it only works on MIDI clips.",
    tools: [
      {
        name: TOOL_UPDATE_CLIP,
        args: { ids: "44", quantize: 0.5, quantizeGrid: "1/8" },
        result: toolResult(
          UPDATE_CLIP_RESULT,
          "WARNING: quantize parameter ignored for audio clip (id 44)",
        ),
      },
    ],
  }),

  // --- Scenario 6: Success with multiple warnings ---
  userMsg("Update this clip's color and quantize settings"),
  modelMsg({
    text: "The clip was updated, but some settings couldn't be applied to this audio clip.",
    tools: [
      {
        name: TOOL_UPDATE_CLIP,
        args: {
          ids: "44",
          quantize: 0.5,
          quantizeGrid: "1/8",
          color: "#ZZZZZZ",
        },
        result: toolResult(
          UPDATE_CLIP_RESULT,
          "WARNING: quantize parameter ignored for audio clip (id 44)",
          "WARNING: Color #ZZZZZZ is not a valid hex color, skipping",
        ),
      },
    ],
  }),

  // --- Scenario 7: Extra args warning ---
  userMsg("Select the Drums track"),
  modelMsg({
    tools: [
      {
        name: "ppal-select",
        args: { trackIndex: 0, invalidParam: "test" },
        result: toolResult(
          {
            view: "arrangement",
            detailView: "clip",
            showBrowser: true,
            selectedTrack: { trackId: "1", type: "midi", trackIndex: 0 },
            selectedClipId: "47",
            selectedDeviceId: null,
            selectedScene: { sceneId: "16", sceneIndex: 0 },
            selectedClipSlot: { trackIndex: 0, sceneIndex: 0 },
          },
          "Warning: ppal-select ignored unexpected argument(s): invalidParam",
        ),
      },
    ],
    text: "I've selected the Drums track. Note that an invalid parameter was ignored.",
  }),

  // --- Scenario 8: Timeout error ---
  userMsg("Read the arrangement clips"),
  modelMsg({
    text: "The tool call timed out. Ableton Live may be busy or unresponsive.",
    tools: [
      {
        name: TOOL_READ_TRACK,
        args: { trackIndex: 0, include: ["arrangement-clips"] },
        result: JSON.stringify(
          "Tool call 'ppal-read-track' timed out after 30000ms",
        ),
        isError: true,
      },
    ],
  }),

  // --- Scenario 9: Input validation failure ---
  userMsg("Read track abc"),
  modelMsg({
    text: "That's not a valid track index — it needs to be a number.",
    tools: [
      {
        name: TOOL_READ_TRACK,
        args: { trackIndex: "abc" },
        result: JSON.stringify(
          'MCP error -32602: Input validation error: Invalid arguments for tool ppal-read-track: [\n  {\n    "expected": "number",\n    "code": "invalid_type",\n    "received": "NaN",\n    "path": [\n      "trackIndex"\n    ],\n    "message": "Invalid input"\n  }\n]',
        ),
        isError: true,
      },
    ],
  }),

  // --- Scenario 10: Invalid tool name ---
  userMsg("Use the nonexistent tool"),
  modelMsg({
    text: "That tool doesn't exist. Let me use the correct one.",
    tools: [
      {
        name: "nonexistent-tool",
        args: {},
        result: JSON.stringify(
          "MCP error -32602: Tool nonexistent-tool not found",
        ),
        isError: true,
      },
    ],
  }),

  // --- Scenario 11: Multi-part message (thought + text + tools + text) ---
  userMsg("Read the Beat clip with notes and show me what's on track 1"),
  modelMsg({
    thought:
      "The user wants two things: read clip details with notes, and read track 1. I'll call both tools.",
    text: "Let me read the clip and the track for you.",
    tools: [
      {
        name: "ppal-read-clip",
        args: { clipId: "13", include: ["notes", "timing"] },
        result: toolResult(READ_CLIP_RESULT),
      },
      {
        name: TOOL_READ_TRACK,
        args: { trackIndex: 1 },
        result: toolResult({
          id: "3",
          type: "midi",
          name: "Bass",
          instrument: "Instrument Rack",
          trackIndex: 1,
          sessionClipCount: 1,
          arrangementClipCount: 0,
          deviceCount: 1,
          state: "muted-via-solo",
        }),
      },
    ],
    toolUsage: { inputTokens: 10365, outputTokens: 135, reasoningTokens: 94 },
    textAfter:
      "The **Beat** clip is a 1-bar looping MIDI pattern with kick on beats 1 and 3, and snare on beats 2 and 4. The **Bass** track has an Instrument Rack with 1 session clip.",
    usage: { inputTokens: 12632, outputTokens: 845, reasoningTokens: 125 },
  }),

  // --- Scenario 12: Connection-level error (UIErrorPart) ---
  userMsg("What tracks are available?"),
  modelMsg({
    error:
      "Connection to AI provider failed: 429 Too Many Requests. Rate limit exceeded. Please wait a moment and try again.",
  }),

  // --- Scenario 13: Pending tool call (still loading) ---
  userMsg("Read the Live Set overview"),
  modelMsg({
    tools: [
      {
        name: "ppal-read-live-set",
        args: { include: ["tracks"] },
        result: null,
      },
    ],
  }),
];
