// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import { processCliStream } from "./stream.ts";

type StreamPart = { type: string; [key: string]: unknown };

/**
 * Wrap fake stream parts in the minimal streamText result processCliStream reads.
 *
 * @param parts - Ordered stream parts to replay
 * @returns A streamText-shaped result whose stream yields the parts
 */
function fakeResult(parts: StreamPart[]): ReturnType<typeof streamText> {
  return {
    stream: (async function* () {
      for (const part of parts) yield part;
    })(),
  } as unknown as ReturnType<typeof streamText>;
}

describe("processCliStream — tool-result matching", () => {
  // Quiet mode suppresses per-part stdout; we only assert on the returned result.
  beforeEach(() => setQuietMode(true));
  afterEach(() => setQuietMode(false));

  it("attaches parallel same-name results to the right call by toolCallId", async () => {
    // The AI SDK emits BOTH tool-call parts before either result. Name-only,
    // last-pending-first matching swaps these two same-tool results, which
    // silently mis-scores per-clip grading (getCreatedClip reads the first
    // create-clip call's result for the read-back id).
    const result = await processCliStream(
      fakeResult([
        { type: "start-step" },
        {
          type: "tool-call",
          toolCallId: "call_a",
          toolName: "ppal-create-clip",
          input: { slot: "0/0" },
        },
        {
          type: "tool-call",
          toolCallId: "call_b",
          toolName: "ppal-create-clip",
          input: { slot: "1/0" },
        },
        {
          type: "tool-result",
          toolCallId: "call_a",
          toolName: "ppal-create-clip",
          output: "result-for-A",
        },
        {
          type: "tool-result",
          toolCallId: "call_b",
          toolName: "ppal-create-clip",
          output: "result-for-B",
        },
      ]),
    );

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).toStrictEqual({
      name: "ppal-create-clip",
      toolCallId: "call_a",
      args: { slot: "0/0" },
      result: "result-for-A",
    });
    expect(result.toolCalls[1]).toStrictEqual({
      name: "ppal-create-clip",
      toolCallId: "call_b",
      args: { slot: "1/0" },
      result: "result-for-B",
    });
  });

  it("falls back to name matching when a server emits empty-string ids", async () => {
    // A spec-violating server can emit id: "" on parallel calls. The id-first
    // match must NOT treat "" === "" as a hit — otherwise every "" result lands
    // on the first ""-id call (overwriting it) and the second call is starved.
    // Empty ids fall through to the name-based fallback so each call still gets
    // its own result.
    const result = await processCliStream(
      fakeResult([
        { type: "start-step" },
        {
          type: "tool-call",
          toolCallId: "",
          toolName: "ppal-create-clip",
          input: { slot: "0/0" },
        },
        {
          type: "tool-call",
          toolCallId: "",
          toolName: "ppal-update-clip",
          input: { ids: "1" },
        },
        {
          type: "tool-result",
          toolCallId: "",
          toolName: "ppal-create-clip",
          output: "result-for-create",
        },
        {
          type: "tool-result",
          toolCallId: "",
          toolName: "ppal-update-clip",
          output: "result-for-update",
        },
      ]),
    );

    expect(result.toolCalls[0]).toStrictEqual({
      name: "ppal-create-clip",
      toolCallId: "",
      args: { slot: "0/0" },
      result: "result-for-create",
    });
    expect(result.toolCalls[1]).toStrictEqual({
      name: "ppal-update-clip",
      toolCallId: "",
      args: { ids: "1" },
      result: "result-for-update",
    });
  });
});

describe("processCliStream — empty-turn warning", () => {
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Verbose mode: the accurate reasoning-only note is verbose-only, and the
    // base-URL warning fires either way — exercise the full branch here.
    setQuietMode(false);
    stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true) as ReturnType<typeof vi.spyOn>;
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setQuietMode(false);
  });

  it("does not blame the base URL on a reasoning-only turn", async () => {
    // A thinking model that spends its whole budget on reasoning finishes with
    // empty text/tool-calls and no error part — a normal finish, not a bad URL.
    await processCliStream(
      fakeResult([
        { type: "start-step" },
        { type: "reasoning-delta", text: "thinking hard about the answer..." },
      ]),
    );

    const written = stderr.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(written).not.toContain("base URL");
    expect(written).toContain("only reasoning");
  });

  it("warns to check the base URL on a truly empty turn (no reasoning)", async () => {
    await processCliStream(fakeResult([{ type: "start-step" }]));

    const written = stderr.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(written).toContain("base URL");
  });
});
