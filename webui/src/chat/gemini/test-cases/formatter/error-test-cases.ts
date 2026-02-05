// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

const CONNECT_TO_ABLETON = "Connect to Ableton";

export const historyWithError = [
  {
    role: "user",
    parts: [{ text: CONNECT_TO_ABLETON }],
  },
  {
    role: "model",
    parts: [{ text: "Connecting to Ableton..." }],
  },
  {
    role: "error",
    parts: [{ text: "Error: API connection failed" }],
  },
];

export const expectedWithError = [
  {
    role: "user",
    parts: [{ type: "text", content: CONNECT_TO_ABLETON }],
    rawHistoryIndex: 0,
  },
  {
    role: "model",
    parts: [
      { type: "text", content: "Connecting to Ableton..." },
      { type: "error", content: "Error: API connection failed", isError: true },
    ],
    rawHistoryIndex: 1,
  },
];

export const historyWithErrorNoModel = [
  {
    role: "user",
    parts: [{ text: CONNECT_TO_ABLETON }],
  },
  {
    role: "error",
    parts: [{ text: "Error: Network timeout" }],
  },
];

export const expectedWithErrorNoModel = [
  {
    role: "user",
    parts: [{ type: "text", content: CONNECT_TO_ABLETON }],
    rawHistoryIndex: 0,
  },
  {
    role: "model",
    parts: [
      { type: "error", content: "Error: Network timeout", isError: true },
    ],
    rawHistoryIndex: 1,
  },
];
