// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { formatProviderList, listModels } from "#evals/shared/list-models.ts";

describe("formatProviderList", () => {
  it("lists every provider and annotates defaults", () => {
    const text = formatProviderList();

    expect(text).toContain("anthropic");
    expect(text).toContain("openrouter");
    expect(text).toContain("default:");
  });
});

describe("listModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prints providers and returns 0 when no provider is given", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await listModels(true);

    expect(code).toBe(0);
    const output = log.mock.calls.map((call) => call[0]).join("\n");

    expect(output).toContain("A provider is required");
    expect(output).toContain("anthropic");
  });

  it("returns 1 and reports an unknown provider", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await listModels("bogus");

    expect(code).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Unknown provider"),
    );
  });

  it("fetches and prints sorted models for an OpenAI-style provider", async () => {
    process.env.OPENAI_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: "gpt-5" }, { id: "gpt-4" }] }),
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await listModels("openai");

    expect(code).toBe(0);
    const output = log.mock.calls.map((call) => call[0]).join("\n");

    expect(output).toContain("gpt-4");
    expect(output).toContain("gpt-5");
  });

  it("caps openrouter to 50 models and notes the total", async () => {
    process.env.OPENROUTER_KEY = "test-key";
    const many = Array.from({ length: 75 }, (_unused, index) => ({
      id: `m${String(index).padStart(3, "0")}`,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: many }),
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await listModels("openrouter");

    const header = log.mock.calls[0]?.[0] as string;

    expect(header).toContain("showing 50 of 75");
  });

  it("strips the models/ prefix for google", async () => {
    process.env.GEMINI_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: "models/gemini-3.5-flash" }] }),
      }),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await listModels("google");

    const output = log.mock.calls.map((call) => call[0]).join("\n");

    expect(output).toContain("gemini-3.5-flash");
    expect(output).not.toContain("models/gemini");
  });

  it("returns 1 and reports a non-OK response without a stack trace", async () => {
    await expectFailureReported(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
      ["Failed to list models for openai: ", "401"],
    );
  });

  it("returns 1 and unwraps a fetch-failed cause for network errors", async () => {
    const fetchError = new TypeError("fetch failed");

    fetchError.cause = new Error("connect ECONNREFUSED 127.0.0.1:11434");

    await expectFailureReported(vi.fn().mockRejectedValue(fetchError), [
      "fetch failed (connect ECONNREFUSED",
    ]);
  });

  it("unwraps an AggregateError cause via its sub-errors", async () => {
    const fetchError = new TypeError("fetch failed");
    // Undici's `fetch failed` wraps connection attempts in an AggregateError
    // whose own message is empty.
    const aggregate = new AggregateError(
      [new Error("connect ECONNREFUSED ::1:11434")],
      "",
    );

    fetchError.cause = aggregate;

    await expectFailureReported(vi.fn().mockRejectedValue(fetchError), [
      "fetch failed (connect ECONNREFUSED ::1:11434)",
    ]);
  });

  it("falls back to a cause error code when no message is available", async () => {
    const fetchError = new TypeError("fetch failed");
    const cause = new Error("");

    (cause as Error & { code?: string }).code = "ENOTFOUND";
    fetchError.cause = cause;

    await expectFailureReported(vi.fn().mockRejectedValue(fetchError), [
      "fetch failed (ENOTFOUND)",
    ]);
  });

  it("returns 1 and stringifies a non-Error rejection", async () => {
    await expectFailureReported(vi.fn().mockRejectedValue("boom"), [
      "Failed to list models for openai: boom",
    ]);
  });
});

/**
 * Stub fetch, list the openai models, and assert the run failed with the given
 * text in what it printed to console.error.
 * @param fetchStub - The fetch stub for this case
 * @param expected - Substrings the reported error must contain
 * @returns Promise resolving once the assertions have run
 */
async function expectFailureReported(
  fetchStub: ReturnType<typeof vi.fn>,
  expected: string[],
): Promise<void> {
  process.env.OPENAI_KEY = "test-key";
  vi.stubGlobal("fetch", fetchStub);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  const code = await listModels("openai");

  expect(code).toBe(1);

  for (const text of expected) {
    expect(error).toHaveBeenCalledWith(expect.stringContaining(text));
  }
}
