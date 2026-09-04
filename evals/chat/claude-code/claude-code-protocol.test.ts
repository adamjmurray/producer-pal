// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";

import {
  claudeCodeJudgeArgs,
  claudeCodeTurnArgs,
  countClaudeCodeSteps,
  parseClaudeCodeStream,
} from "./claude-code-protocol.ts";

/**
 * Assert every isolation flag survives on one argv. `evals/**` is excluded from
 * coverage, so these assertions are the only guard against a dropped flag.
 *
 * @param args - Claude Code CLI arguments to check
 */
function expectRestrictions(args: string[]): void {
  const flat = args.join(" ");

  expect(flat).toContain("--output-format stream-json");
  expect(args).toContain("-p");
  // stream-json in print mode is rejected without it.
  expect(args).toContain("--verbose");
  expect(args).toContain("--disable-slash-commands");
  expect(args).toContain("--strict-mcp-config");
  // Built-in tools off and settings sources off — both take an empty value.
  expect(args[args.indexOf("--tools") + 1]).toBe("");
  expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
  // `--tools <tools...>` is variadic, so whatever follows its empty value must
  // be another flag or the CLI swallows it as a tool name. (`--setting-sources`
  // takes a single value and needs no such guard.)
  expect(args[args.indexOf("--tools") + 2]).toMatch(/^--/);
}

/**
 * Read the `--mcp-config` payload off an argv.
 *
 * @param args - Claude Code CLI arguments
 * @returns The parsed MCP configuration
 */
function mcpConfig(args: string[]): { mcpServers: Record<string, unknown> } {
  return JSON.parse(args[args.indexOf("--mcp-config") + 1] ?? "") as {
    mcpServers: Record<string, unknown>;
  };
}

/**
 * Serialize events as the JSONL Claude Code streams on stdout.
 *
 * @param events - Events to emit, in order
 * @returns Newline-delimited JSON
 */
function jsonl(events: unknown[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

describe("claudeCodeTurnArgs", () => {
  const input = {
    instructions: "You are Producer Pal.",
    instructionsFile: "/tmp/instructions.md",
    mcpUrl: "http://localhost:3350/mcp",
    model: "sonnet",
  };

  it("builds a restricted initial MCP turn", () => {
    const args = claudeCodeTurnArgs(input);

    expectRestrictions(args);
    expect(args).toStrictEqual(expect.arrayContaining(["--model", "sonnet"]));
    // Instructions go inline: --system-prompt REPLACES Claude Code's own
    // coding-agent prompt, and with it the memory injected into that prompt.
    expect(args[args.indexOf("--system-prompt") + 1]).toBe(input.instructions);
    expect(mcpConfig(args).mcpServers).toStrictEqual({
      "producer-pal": { type: "http", url: input.mcpUrl },
    });
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__producer-pal");
    expect(args).not.toContain("--resume");
  });

  it("resumes by session id while keeping every restriction", () => {
    const args = claudeCodeTurnArgs({
      ...input,
      resumeSessionId: "session-123",
    });

    expectRestrictions(args);
    expect(args.slice(-2)).toStrictEqual(["--resume", "session-123"]);
    expect(mcpConfig(args).mcpServers).toHaveProperty("producer-pal");
  });
});

describe("claudeCodeJudgeArgs", () => {
  it("runs without MCP or session persistence", () => {
    const args = claudeCodeJudgeArgs({
      instructions: "You are a judge.",
      instructionsFile: "/tmp/judge.md",
      model: "haiku",
    });

    expectRestrictions(args);
    expect(args).toStrictEqual(expect.arrayContaining(["--model", "haiku"]));
    expect(mcpConfig(args).mcpServers).toStrictEqual({});
    expect(args).toContain("--no-session-persistence");
  });
});

describe("parseClaudeCodeStream", () => {
  it("collects text, MCP calls, results, session id and usage", () => {
    const stdout = jsonl([
      "not json — a startup warning",
      {
        type: "system",
        subtype: "init",
        session_id: "session-abc",
        mcp_servers: [{ name: "producer-pal", status: "connected" }],
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "internal, not part of the reply" },
            { type: "text", text: "Connecting." },
            {
              type: "tool_use",
              id: "toolu_1",
              name: "mcp__producer-pal__ppal-connect",
              input: { greeting: "hi" },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: [
                { type: "text", text: "connected" },
                { type: "text", text: "…skills…" },
              ],
            },
          ],
        },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Ready when you are." }] },
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Ready when you are.",
        session_id: "session-abc",
        usage: {
          input_tokens: 25,
          output_tokens: 424,
          cache_read_input_tokens: 15243,
          cache_creation_input_tokens: 7895,
        },
      },
    ]);
    const parsed = parseClaudeCodeStream(stdout);

    // Separate assistant messages, so a blank line rather than a run-on.
    expect(parsed.text).toBe("Connecting.\n\nReady when you are.");
    expect(parsed.sessionId).toBe("session-abc");
    // The `mcp__<server>__` namespace is stripped so tool-call assertions match
    // what every other transport records.
    expect(parsed.toolCalls).toStrictEqual([
      {
        name: "ppal-connect",
        args: { greeting: "hi" },
        result: "connected",
      },
    ]);
    expect(parsed.usage).toStrictEqual({
      inputTokens: 25,
      outputTokens: 424,
      cacheReadTokens: 15243,
      cacheWriteTokens: 7895,
    });
  });

  // The bug this pins: unwrapping to the payload block dropped the relayed
  // `WARNING:` blocks that follow it, so the device scenarios' acceptance
  // checks — which grade on whether the engine warn-and-skipped — saw a clean
  // result and passed no matter what the engine did.
  it("keeps the relayed WARNING blocks beside the payload", () => {
    const stdout = jsonl([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "mcp__producer-pal__ppal-update-device",
              input: {},
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: [
                { type: "text", text: '{"id":"device1"}' },
                {
                  type: "text",
                  text: 'WARNING: setModulation source "LFO 9" is invalid',
                },
              ],
            },
          ],
        },
      },
    ]);

    expect(parseClaudeCodeStream(stdout).toolCalls).toStrictEqual([
      {
        name: "ppal-update-device",
        args: {},
        result: '{"id":"device1"}',
        warnings: ['WARNING: setModulation source "LFO 9" is invalid'],
      },
    ]);
  });

  it("records a failed tool result without failing the whole turn", () => {
    const stdout = jsonl([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "mcp__producer-pal__ppal-create-clip",
              input: {},
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "no track at index 9",
              is_error: true,
            },
          ],
        },
      },
    ]);

    expect(parseClaudeCodeStream(stdout).toolCalls[0]).toStrictEqual({
      name: "ppal-create-clip",
      args: {},
      result: "ERROR: no track at index 9",
      isError: true,
    });
  });

  it("falls back to JSON for a result carrying no text block", () => {
    const stdout = jsonl([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "mcp__producer-pal__ppal-read-clip",
              input: {},
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: [{ type: "image", data: "…" }],
            },
          ],
        },
      },
    ]);

    expect(parseClaudeCodeStream(stdout).toolCalls[0]?.result).toBe(
      JSON.stringify([{ type: "image", data: "…" }]),
    );
  });

  it("throws when the CLI spilled a tool result to a file", () => {
    // The stub is what the model gets, so the run would grade a model that
    // never received the Skills ppal-connect returns.
    const stdout = jsonl([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "mcp__producer-pal__ppal-connect",
              input: {},
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content:
                "<persisted-output>\nOutput too large (49.7KB). Full output " +
                "saved to: /tmp/x.json\n\nPreview (first 2KB):\n{connected:true",
            },
          ],
        },
      },
      { type: "result", subtype: "success", is_error: false, result: "hi" },
    ]);

    expect(() => parseClaudeCodeStream(stdout)).toThrow(
      /ppal-connect returned more than the claude CLI will inline/,
    );
  });

  it("throws when the Producer Pal MCP server did not connect", () => {
    // Claude Code has no `required=true`; without this the turn would run with
    // no tools at all and grade as a model that simply refused to use them.
    const stdout = jsonl([
      {
        type: "system",
        subtype: "init",
        session_id: "session-abc",
        mcp_servers: [{ name: "producer-pal", status: "failed" }],
      },
      { type: "result", subtype: "success", is_error: false, result: "hi" },
    ]);

    expect(() => parseClaudeCodeStream(stdout)).toThrow(
      /MCP server "producer-pal" is failed/,
    );
  });

  it("throws on a failed result event", () => {
    const stdout = jsonl([
      {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "rate limit reached",
        terminal_reason: "error",
        session_id: "session-abc",
      },
    ]);

    // The specific subtype wins over the coarser terminal_reason ("error").
    expect(() => parseClaudeCodeStream(stdout)).toThrow(
      /error_during_execution: rate limit reached/,
    );
  });

  it("falls back to terminal_reason when subtype is the misleading 'success'", () => {
    // The most common real failure — the API being unreachable — still reports
    // `subtype: "success"` next to `is_error: true`, which would otherwise read
    // "claude CLI error: success:".
    const stdout = jsonl([
      {
        type: "result",
        subtype: "success",
        is_error: true,
        result: "API Error: Unable to connect to API (ConnectionRefused)",
        terminal_reason: "api_error",
        session_id: "session-abc",
      },
    ]);

    expect(() => parseClaudeCodeStream(stdout)).toThrow(
      /api_error: API Error: Unable to connect/,
    );
    expect(() => parseClaudeCodeStream(stdout)).not.toThrow(/success:/);
  });

  it("throws when the permission layer denied the tool calls", () => {
    // Sibling of the dead-MCP case with the same silent outcome: if the
    // --allowedTools rule stops matching, every call comes back denied and the
    // run grades as a model that tried and failed.
    const stdout = jsonl([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "I was unable to use the tools.",
        session_id: "session-abc",
        permission_denials: [
          { tool_name: "mcp__producer-pal__ppal-connect" },
          { tool_name: "mcp__producer-pal__ppal-connect" },
        ],
      },
    ]);

    expect(() => parseClaudeCodeStream(stdout)).toThrow(
      /2 tool call\(s\) denied.*mcp__producer-pal__ppal-connect.*--allowedTools/s,
    );
  });

  it("does not treat an empty permission_denials list as a failure", () => {
    const stdout = jsonl([
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "done",
        session_id: "session-abc",
        permission_denials: [],
      },
    ]);

    expect(parseClaudeCodeStream(stdout).text).toBe("");
  });
});

describe("countClaudeCodeSteps", () => {
  /**
   * Count the steps in an assistant event holding the given blocks.
   * @param content - The message's content blocks
   * @returns Steps the event spends
   */
  function stepsForAssistant(content: unknown[]): number {
    return countClaudeCodeSteps({ type: "assistant", message: { content } });
  }

  it("charges one step for a generation however much it holds", () => {
    // Narration plus two tool calls is still one generation, and that's the
    // unit the AI SDK path budgets in. Charging per block would let narration
    // alone halve the tool calls the same budget buys.
    expect(
      stepsForAssistant([
        { type: "text", text: "Reading the song…" },
        { type: "tool_use", id: "toolu_1", name: "ppal-read-song", input: {} },
        { type: "tool_use", id: "toolu_2", name: "ppal-read-track", input: {} },
      ]),
    ).toBe(1);
    expect(
      stepsForAssistant([
        { type: "tool_use", id: "toolu_1", name: "ppal-read-song", input: {} },
      ]),
    ).toBe(1);
  });

  it("ignores thinking, empty text, and non-assistant events", () => {
    expect(
      stepsForAssistant([
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "" },
      ]),
    ).toBe(0);
    expect(
      countClaudeCodeSteps({ type: "user", message: { content: [] } }),
    ).toBe(0);
    expect(countClaudeCodeSteps({ type: "result", subtype: "success" })).toBe(
      0,
    );
  });
});
