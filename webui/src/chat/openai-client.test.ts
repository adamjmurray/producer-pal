import { describe, expect, it } from "vitest";
import { processDeltaContent } from "./openai-client.js";
import type OpenAI from "openai";

describe("processDeltaContent", () => {
  it("should accumulate regular content", () => {
    const delta = {
      content: "Hello",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = processDeltaContent("", delta);
    expect(result).toBe("Hello");
  });

  it("should concatenate multiple content chunks", () => {
    const delta = {
      content: " world",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = processDeltaContent("Hello", delta);
    expect(result).toBe("Hello world");
  });

  it("should handle empty delta", () => {
    const delta =
      {} as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = processDeltaContent("Hello", delta);
    expect(result).toBe("Hello");
  });

  it("should extract reasoning from reasoning_content (OpenAI format)", () => {
    const delta = {
      reasoning_content: "Thinking about the problem...",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = processDeltaContent("", delta);
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

    const result = processDeltaContent("", delta);
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

    const result = processDeltaContent("", delta);
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

    const result = processDeltaContent("", delta);
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

    const result = processDeltaContent("", delta);
    expect(result).toBe("From reasoning_content");
  });

  it("should handle both content and reasoning_content", () => {
    const delta = {
      content: "Response: ",
      reasoning_content: "After careful thought, ",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = processDeltaContent("", delta);
    expect(result).toBe("Response: After careful thought, ");
  });

  it("should handle both content and reasoning_details", () => {
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

    const result = processDeltaContent("", delta);
    expect(result).toBe("Answer: Based on my analysis, ");
  });

  it("should handle real-world OpenRouter minimax-m2 chunk structure", () => {
    // This is based on the actual chunk structure from OpenRouter's minimax-m2:free model
    const delta = {
      role: "assistant",
      content: "",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: 'The user has just greeted me with "hi". They haven\'t asked me to connect to Ableton Live yet, so I should respond as Producer Pal and ask if they want to connect.',
          index: 0,
          format: null,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = processDeltaContent("", delta);
    expect(result).toBe(
      'The user has just greeted me with "hi". They haven\'t asked me to connect to Ableton Live yet, so I should respond as Producer Pal and ask if they want to connect.',
    );
  });

  it("should handle empty content with reasoning (common in reasoning models)", () => {
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

    const result = processDeltaContent("", delta);
    expect(result).toBe("Reasoning text when content is empty");
  });
});
