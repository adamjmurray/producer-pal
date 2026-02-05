// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type { OpenAIMessage } from "#webui/types/messages";

export const historyWithEmptyToolCallArgs: OpenAIMessage[] = [
  {
    role: "system",
    content:
      "You are an AI music composition assistant for Ableton Live.\nHelp users create, edit, and arrange music using the Producer Pal tools.\nYou can read and modify tracks, clips, scenes, and MIDI notes.\nIf the user hasn't asked to connect to Ableton Live, ask if they want to. If so, connect.\nYou are Producer Pal. You are creative and focus on the user's musical goals.",
  },
  {
    role: "user",
    content: "Connect to Ableton.",
  },
  {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call_Ia9O4XEhsMiuFurY5hxHRhJg",
        type: "function",
        function: {
          name: "ppal-connect",
          arguments: "",
        },
      },
    ],
  },
];

export const expectedWithEmptyToolCallArgs = [
  {
    role: "user",
    parts: [
      {
        type: "text",
        content: "Connect to Ableton.",
      },
    ],
    rawHistoryIndex: 1,
  },
  {
    role: "model",
    parts: [
      {
        type: "tool",
        name: "ppal-connect",
        args: {},
        result: null,
        isError: undefined,
      },
    ],
    rawHistoryIndex: 2,
  },
];
