// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

export const historyEndingInThought = [
  {
    role: "user",
    parts: [
      {
        text: "Connect to Ableton.",
      },
    ],
  },
  {
    role: "model",
    parts: [
      {
        text: "**Considering Connection Logic**\n\nI'm currently focused on how to connect the model to Ableton. The need is clear: to leverage the `ppal-connect` function. Since this function is argument-free, integrating it seems straightforward, and I've decided to call the function.\n\n\n",
        thought: true,
      },
    ],
  },
];

export const expectedEndingInThought = [
  {
    role: "user",
    parts: [
      {
        type: "text",
        content: "Connect to Ableton.",
      },
    ],
    rawHistoryIndex: 0,
  },
  {
    role: "model",
    parts: [
      {
        type: "thought",
        content:
          "**Considering Connection Logic**\n\nI'm currently focused on how to connect the model to Ableton. The need is clear: to leverage the `ppal-connect` function. Since this function is argument-free, integrating it seems straightforward, and I've decided to call the function.\n\n\n",
        isOpen: true,
      },
    ],
    rawHistoryIndex: 1,
  },
];
