import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { extractReasoningFromDelta } from "./openai-reasoning-helpers";

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
});
