import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import {
  extractReasoningFromDelta,
  processReasoningDelta,
  type ReasoningDetail,
} from "#webui/chat/openai/reasoning-helpers";

describe("extractReasoningFromDelta", () => {
  it("should return empty string for regular content (not reasoning)", () => {
    const delta = {
      content: "Hello",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("");
  });

  it("should return empty string for empty delta", () => {
    const delta =
      {} as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("");
  });

  it("should extract reasoning from reasoning_content (OpenAI format)", () => {
    const delta = {
      reasoning_content: "Thinking about the problem...",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("Thinking about the problem...");
  });

  it("should extract reasoning from reasoning_details (OpenRouter format)", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Let me analyze this step by step.",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("Let me analyze this step by step.");
  });

  it("should extract multiple reasoning details chunks", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "First, ",
          index: 0,
        },
        {
          type: "reasoning.text",
          text: "I need to understand the requirements.",
          index: 1,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("First, I need to understand the requirements.");
  });

  it("should ignore non-text reasoning details", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.summary",
          summary: "This should be ignored",
          index: 0,
        },
        {
          type: "reasoning.text",
          text: "This should be included",
          index: 1,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("This should be included");
  });

  it("should prioritize reasoning_content over reasoning_details", () => {
    const delta = {
      reasoning_content: "From reasoning_content",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "From reasoning_details",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("From reasoning_content");
  });

  it("should skip reasoning.text blocks without text property", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          // text property is missing
          index: 0,
        },
        {
          type: "reasoning.text",
          text: "Has text",
          index: 1,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("Has text");
  });

  it("should return empty string when reasoning_details has no text blocks", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.encrypted",
          data: "encrypted-content",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("");
  });

  it("should ignore regular content and only extract reasoning", () => {
    const delta = {
      content: "Response: ",
      reasoning_content: "After careful thought, ",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("After careful thought, ");
  });

  it("should ignore regular content when reasoning_details present", () => {
    const delta = {
      content: "Answer: ",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Based on my analysis, ",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("Based on my analysis, ");
  });

  it("should handle real-world OpenRouter minimax-m2 chunk structure", () => {
    const delta = {
      role: "assistant",
      content: "",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: 'The user has just greeted me with "hi".',
          index: 0,
          format: null,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe('The user has just greeted me with "hi".');
  });

  it("should extract reasoning even when content is empty", () => {
    const delta = {
      content: "",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Reasoning text when content is empty",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);

    expect(result).toBe("Reasoning text when content is empty");
  });
});

describe("processReasoningDelta", () => {
  it("should do nothing when delta has no reasoning_details", () => {
    const delta = {
      content: "Hello",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;
    const map = new Map<string, ReasoningDetail>();

    processReasoningDelta(delta, map);

    expect(map.size).toBe(0);
  });

  it("should add new reasoning detail to the map", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "First part",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;
    const map = new Map<string, ReasoningDetail>();

    processReasoningDelta(delta, map);

    expect(map.size).toBe(1);
    expect(map.get("reasoning.text-0")).toStrictEqual({
      type: "reasoning.text",
      text: "First part",
      index: 0,
    });
  });

  it("should accumulate text for existing detail", () => {
    const map = new Map<string, ReasoningDetail>();

    map.set("reasoning.text-0", {
      type: "reasoning.text",
      text: "First ",
      index: 0,
    });

    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "second",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta, map);

    expect(map.get("reasoning.text-0")?.text).toBe("First second");
  });

  it("should merge new fields from later chunks", () => {
    const map = new Map<string, ReasoningDetail>();

    map.set("reasoning.encrypted-0", {
      type: "reasoning.encrypted",
      index: 0,
      signature: "",
    });

    const delta = {
      reasoning_details: [
        {
          type: "reasoning.encrypted",
          index: 0,
          signature: "abc123",
          thought_signature: "xyz789",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta, map);

    const result = map.get("reasoning.encrypted-0");

    expect(result?.signature).toBe("abc123");
    expect(result?.thought_signature).toBe("xyz789");
  });

  it("should not overwrite existing non-empty fields", () => {
    const map = new Map<string, ReasoningDetail>();

    map.set("reasoning.text-0", {
      type: "reasoning.text",
      index: 0,
      id: "original-id",
    });

    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          index: 0,
          id: "new-id",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta, map);

    expect(map.get("reasoning.text-0")?.id).toBe("original-id");
  });

  it("should handle detail without index (default to 0)", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.summary",
          text: "Summary text",
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;
    const map = new Map<string, ReasoningDetail>();

    processReasoningDelta(delta, map);

    expect(map.has("reasoning.summary-0")).toBe(true);
  });

  it("should accumulate text starting from empty", () => {
    const map = new Map<string, ReasoningDetail>();

    map.set("reasoning.text-0", {
      type: "reasoning.text",
      index: 0,
    });

    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "new text",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    processReasoningDelta(delta, map);

    expect(map.get("reasoning.text-0")?.text).toBe("new text");
  });
});
