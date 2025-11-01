export const historyWithError = [
  {
    role: "user",
    parts: [{ text: "Connect to Ableton" }],
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
    parts: [{ type: "text", content: "Connect to Ableton" }],
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
    parts: [{ text: "Connect to Ableton" }],
  },
  {
    role: "error",
    parts: [{ text: "Error: Network timeout" }],
  },
];

export const expectedWithErrorNoModel = [
  {
    role: "user",
    parts: [{ type: "text", content: "Connect to Ableton" }],
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
