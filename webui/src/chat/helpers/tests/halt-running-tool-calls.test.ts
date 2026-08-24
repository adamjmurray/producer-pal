// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { haltRunningToolCalls } from "#webui/chat/helpers/halt-running-tool-calls";
import { CANCELED_TOOL_RESULT_TEXT } from "#webui/chat/sdk/build-model-messages";
import { type UIMessage, type UIToolPart } from "#webui/types/messages";

/**
 * One model message holding a single tool part.
 * @param result - The tool result, or null while the call is running
 * @returns A transcript of one message
 */
function transcript(result: string | null): UIMessage[] {
  return [
    {
      role: "model",
      parts: [
        { type: "text", content: "on it" },
        { type: "tool", name: "ppal-read-live-set", args: {}, result },
      ],
      rawHistoryIndex: 0,
      timestamp: 0,
    },
  ];
}

/**
 * Read the tool part back out of a halted transcript.
 * @param messages - The transcript to read
 * @returns The first tool part
 */
function toolPart(messages: UIMessage[]): UIToolPart {
  return messages[0]!.parts[1] as UIToolPart;
}

describe("haltRunningToolCalls", () => {
  it("stamps the canceled placeholder on a call with no result", () => {
    const halted = haltRunningToolCalls(transcript(null));

    // Quoted, because that is how the formatter encodes a string result — so
    // the card reads the same live as it does after a reload.
    expect(toolPart(halted).result).toBe(
      JSON.stringify(CANCELED_TOOL_RESULT_TEXT),
    );
  });

  it("leaves every other part alone", () => {
    const halted = haltRunningToolCalls(transcript(null));

    expect(halted[0]?.parts[0]).toStrictEqual({
      type: "text",
      content: "on it",
    });
  });

  it("leaves a call that already returned alone", () => {
    const messages = transcript('{"id":"44"}');

    expect(haltRunningToolCalls(messages)).toBe(messages);
  });

  it("returns the same array when nothing is running", () => {
    const messages: UIMessage[] = [];

    expect(haltRunningToolCalls(messages)).toBe(messages);
  });

  it("does not mutate the transcript it was given", () => {
    const messages = transcript(null);

    haltRunningToolCalls(messages);

    expect(toolPart(messages).result).toBeNull();
  });
});
