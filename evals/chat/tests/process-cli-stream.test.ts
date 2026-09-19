// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setQuietMode } from "#evals/scenarios/helpers/quiet-mode.ts";
import { processCliStream } from "../stream.ts";

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
      for (const part of parts) {
        yield part;
      }
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

describe("processCliStream — MCP isError", () => {
  beforeEach(() => setQuietMode(true));
  afterEach(() => setQuietMode(false));

  /**
   * One tool call plus its result, matched by id.
   *
   * @param toolCallId - Id shared by the call and its result
   * @returns Stream parts for a single completed tool call
   */
  function callAndResult(toolCallId: string): StreamPart[] {
    return [
      { type: "start-step" },
      {
        type: "tool-call",
        toolCallId,
        toolName: "ppal-create-clip",
        input: { slot: "0/0" },
      },
      {
        type: "tool-result",
        toolCallId,
        toolName: "ppal-create-clip",
        output: "some result",
      },
    ];
  }

  it("stamps isError true for an id in the errored set", async () => {
    const result = await processCliStream(fakeResult(callAndResult("call_a")), {
      erroredToolCallIds: new Set(["call_a"]),
    });

    expect(result.toolCalls[0]?.isError).toBe(true);
  });

  it("stamps isError false for an id the set does not hold", async () => {
    // False is as authoritative as true here: the id matched, so the MCP flag
    // said this call succeeded — grading must not re-guess from the result.
    const result = await processCliStream(fakeResult(callAndResult("call_a")), {
      erroredToolCallIds: new Set(["other_call"]),
    });

    expect(result.toolCalls[0]?.isError).toBe(false);
  });

  it("leaves isError unset when no set is supplied", async () => {
    const result = await processCliStream(fakeResult(callAndResult("call_a")));

    expect(result.toolCalls[0]).not.toHaveProperty("isError");
  });

  it("leaves isError unset on the name-based fallback", async () => {
    // An empty id falls through to name matching, which can't be trusted to
    // identify the call the flag belongs to.
    const result = await processCliStream(fakeResult(callAndResult("")), {
      erroredToolCallIds: new Set([""]),
    });

    expect(result.toolCalls[0]).not.toHaveProperty("isError");
  });
});

describe("processCliStream — step usage line", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setQuietMode(true);
    log = vi.spyOn(console, "log").mockImplementation(() => {}) as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setQuietMode(false);
  });

  /**
   * A finish-step part carrying usage and the SDK's measured timings.
   *
   * @param inputTokens - Input tokens the step reports
   * @param performance - Timings to attach, if any
   * @returns A finish-step stream part
   */
  function finishStep(
    inputTokens: number,
    performance?: Record<string, number>,
  ): StreamPart {
    return {
      type: "finish-step",
      usage: {
        inputTokens,
        inputTokenDetails: {},
        outputTokens: 850,
        outputTokenDetails: { reasoningTokens: 200 },
      },
      ...(performance != null && { performance }),
    };
  }

  /** @returns Everything printed to the console during the stream */
  function printed(): string {
    return log.mock.calls.map((call: unknown[]) => String(call[0])).join("");
  }

  it("prints usage with generation speed from the finish-step part", async () => {
    await processCliStream(
      fakeResult([
        { type: "start-step" },
        { type: "text-delta", text: "hi" },
        finishStep(12300, {
          timeToFirstOutputMs: 1200,
          effectiveOutputTokensPerSecond: 42,
        }),
      ]),
      { showUsage: true },
    );

    expect(printed()).toContain(
      "tokens: 12.3K → 850 (200 reasoning) · 42 tok/s · 1.2s to first token",
    );
  });

  it("prints nothing when usage is not requested", async () => {
    await processCliStream(
      fakeResult([{ type: "start-step" }, finishStep(12300)]),
      {},
    );

    expect(printed()).toBe("");
  });

  it("counts new content against the previous turn's last step", async () => {
    await processCliStream(
      fakeResult([{ type: "start-step" }, finishStep(12300)]),
      { showUsage: true, prevUsage: { inputTokens: 11500, outputTokens: 400 } },
    );

    expect(printed()).toContain("tokens: 12.3K (400 new) →");
  });

  it("carries each step's usage into the next step", async () => {
    await processCliStream(
      fakeResult([
        { type: "start-step" },
        finishStep(11500),
        { type: "start-step" },
        finishStep(13000),
      ]),
      { showUsage: true },
    );

    // 13000 - (11500 + 850), read off the first step's usage.
    expect(printed()).toContain("tokens: 13K (650 new) →");
  });
});
