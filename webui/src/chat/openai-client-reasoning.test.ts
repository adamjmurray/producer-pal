import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { processReasoningDelta, type ReasoningDetail } from "./openai-client";

describe("processReasoningDelta", () => {
  it("should merge fields from later chunks (e.g., thought_signature)", () => {
    const reasoningDetailsMap = new Map<string, ReasoningDetail>();

    // First chunk: initial block with text
    const delta1 = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "First part...",
          index: 0,
          format: "google-gemini-v1",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta1, reasoningDetailsMap);

    // Second chunk: more text, same index
    const delta2 = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: " second part...",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta2, reasoningDetailsMap);

    // Third chunk: final text with thought_signature
    const delta3 = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: " done.",
          index: 0,
          thought_signature: "sig_abc123",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta3, reasoningDetailsMap);

    // Verify the merged result
    expect(reasoningDetailsMap.size).toBe(1);
    const block = reasoningDetailsMap.get("reasoning.text-0");
    expect(block?.text).toBe("First part... second part... done.");
    expect(block?.format).toBe("google-gemini-v1");
    expect(block?.thought_signature).toBe("sig_abc123");
  });

  it("should not overwrite existing fields from earlier chunks", () => {
    const reasoningDetailsMap = new Map<string, ReasoningDetail>();

    // First chunk with id
    const delta1 = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Start...",
          index: 0,
          id: "original_id",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta1, reasoningDetailsMap);

    // Second chunk tries to set id again (should be ignored)
    const delta2 = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: " end.",
          index: 0,
          id: "new_id",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta2, reasoningDetailsMap);

    const block = reasoningDetailsMap.get("reasoning.text-0");
    expect(block?.id).toBe("original_id");
    expect(block?.text).toBe("Start... end.");
  });
});
