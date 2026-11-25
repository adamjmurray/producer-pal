// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isContextOverflow } from "./context-overflow.ts";

const URL = "http://localhost:11434/v1/chat/completions";

describe("isContextOverflow", () => {
  it.each([
    [
      "Ollama's overflow answer",
      `input length (300021 tokens) exceeds the model's maximum context length (131072 tokens) (HTTP 400 ${URL})`,
    ],
    [
      "a context window message",
      `Request exceeds the context window (HTTP 400 ${URL})`,
    ],
    [
      "LM Studio's in-stream overflow answer, which has no status",
      "The number of tokens to keep from the initial prompt is greater than the context length. Try to load the model with a larger context length, or provide a shorter input",
    ],
    [
      "a context size message",
      `Trying to keep more than the context size (HTTP 400 ${URL})`,
    ],
  ])("is true for %s", (_label, error) => {
    expect(isContextOverflow(error)).toBe(true);
  });

  it.each([
    ["a malformed request", `invalid message format (HTTP 400 ${URL})`],
    [
      "a context message with another status",
      `maximum context length exceeded (HTTP 500 ${URL})`,
    ],
    ["a bad key", `Incorrect API key provided (HTTP 401 ${URL})`],
    ["a rate limit", `Too many requests (HTTP 429 ${URL})`],
    ["a refused connection", "Cannot connect to API: connect ECONNREFUSED"],
  ])("is false for %s", (_label, error) => {
    expect(isContextOverflow(error)).toBe(false);
  });
});
