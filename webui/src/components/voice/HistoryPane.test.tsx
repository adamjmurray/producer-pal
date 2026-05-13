// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { type RealtimeItem } from "@openai/agents/realtime";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { HistoryPane } from "./HistoryPane";

function userMessage(text: string, id = "u1"): RealtimeItem {
  return {
    type: "message",
    role: "user",
    itemId: id,
    content: [{ type: "input_text", text }],
    status: "completed",
  } as unknown as RealtimeItem;
}

function assistantMessage(text: string, id = "a1"): RealtimeItem {
  return {
    type: "message",
    role: "assistant",
    itemId: id,
    content: [{ type: "output_text", text }],
    status: "completed",
  } as unknown as RealtimeItem;
}

function systemMessage(text: string, id = "s1"): RealtimeItem {
  return {
    type: "message",
    role: "system",
    itemId: id,
    content: [{ type: "input_text", text }],
    status: "completed",
  } as unknown as RealtimeItem;
}

function audioMessage(
  role: "user" | "assistant",
  transcript: string,
  id = "audio1",
): RealtimeItem {
  return {
    type: "message",
    role,
    itemId: id,
    content: [
      {
        type: role === "user" ? "input_audio" : "output_audio",
        transcript,
      },
    ],
    status: "completed",
  } as unknown as RealtimeItem;
}

describe("HistoryPane", () => {
  it("renders empty-state copy when history is empty", () => {
    render(<HistoryPane history={[]} />);

    expect(screen.getByText(/conversation will appear here/i)).toBeDefined();
  });

  it("renders user and assistant text messages", () => {
    const items: RealtimeItem[] = [
      userMessage("hello, please list tracks", "u1"),
      assistantMessage("Sure — track 1 is Drums.", "a1"),
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText("hello, please list tracks")).toBeDefined();
    expect(screen.getByText("Sure — track 1 is Drums.")).toBeDefined();
    expect(screen.getByText("user")).toBeDefined();
    expect(screen.getByText("assistant")).toBeDefined();
  });

  it("renders system messages with italic styling", () => {
    const items: RealtimeItem[] = [systemMessage("you are a voice agent")];

    render(<HistoryPane history={items} />);

    expect(screen.getByText("you are a voice agent")).toBeDefined();
    expect(screen.getByText("system")).toBeDefined();
  });

  it("renders audio messages by their transcript", () => {
    const items: RealtimeItem[] = [
      audioMessage("user", "list the tracks", "u-audio"),
      audioMessage("assistant", "Track 1 is Drums.", "a-audio"),
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText("list the tracks")).toBeDefined();
    expect(screen.getByText("Track 1 is Drums.")).toBeDefined();
  });

  it("skips messages with no displayable content", () => {
    // Empty transcript on an audio message → nothing rendered for this item
    const items: RealtimeItem[] = [
      {
        type: "message",
        role: "assistant",
        itemId: "empty",
        content: [{ type: "output_audio", transcript: "" }],
        status: "in_progress",
      } as unknown as RealtimeItem,
      assistantMessage("after the empty one", "a2"),
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText("after the empty one")).toBeDefined();
  });

  it("renders function_call items with name, status, and output", () => {
    const items: RealtimeItem[] = [
      {
        type: "function_call",
        itemId: "fc1",
        name: "ppal-read-track",
        arguments: JSON.stringify({ trackIndex: 0 }),
        output: "Track 1: Drums",
        status: "completed",
        callId: "call_abc",
      } as unknown as RealtimeItem,
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText(/ppal-read-track/)).toBeDefined();
    expect(screen.getByText(/completed/)).toBeDefined();
    expect(screen.getByText("Track 1: Drums")).toBeDefined();
    expect(screen.getByText(/trackIndex/)).toBeDefined();
  });

  it("renders mcp_call items with name and output", () => {
    const items: RealtimeItem[] = [
      {
        type: "mcp_call",
        itemId: "mcp1",
        name: "ppal-create-clip",
        output: "Created clip on track 1",
        status: "completed",
        callId: "call_def",
      } as unknown as RealtimeItem,
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText(/mcp:/i)).toBeDefined();
    expect(screen.getByText(/ppal-create-clip/)).toBeDefined();
    expect(screen.getByText("Created clip on track 1")).toBeDefined();
  });

  it("renders mcp_tool_call (alternate name) the same way", () => {
    const items: RealtimeItem[] = [
      {
        type: "mcp_tool_call",
        itemId: "mcp2",
        name: "ppal-update-clip",
        output: "Updated",
        status: "completed",
        callId: "call_xyz",
      } as unknown as RealtimeItem,
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText(/ppal-update-clip/)).toBeDefined();
    expect(screen.getByText("Updated")).toBeDefined();
  });

  it("ignores unknown item types without crashing", () => {
    const items: RealtimeItem[] = [
      {
        type: "future_thing_we_dont_know",
        itemId: "x",
      } as unknown as RealtimeItem,
      userMessage("after unknown", "after-unknown"),
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText("after unknown")).toBeDefined();
  });

  it("renders function_call without optional arguments/output", () => {
    const items: RealtimeItem[] = [
      {
        type: "function_call",
        itemId: "fc2",
        name: "ppal-pong",
        status: "in_progress",
        callId: "call_pong",
      } as unknown as RealtimeItem,
    ];

    render(<HistoryPane history={items} />);

    expect(screen.getByText(/ppal-pong/)).toBeDefined();
    expect(screen.getByText(/in_progress/)).toBeDefined();
  });
});
