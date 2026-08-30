// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";

import { scrubAgentCliEnv } from "../agent-cli/agent-cli-transport.ts";
import {
  CODEX_CLI_TRANSPORT,
  codexJudgeArgs,
  codexTurnArgs,
  countCodexSteps,
  parseCodexStream,
  resolveCodexModel,
} from "./codex-cli-protocol.ts";

/**
 * Assert every sandbox restriction survives on one argv. `evals/**` is excluded
 * from coverage, so these assertions are the only guard against a dropped flag.
 * @param args - Codex CLI arguments to check
 */
function expectRestrictions(args: string[]): void {
  const flat = args.join(" ");

  expect(flat).toContain("--disable shell_tool");
  expect(flat).toContain("--disable unified_exec");
  expect(flat).toContain("--disable multi_agent");
  expect(flat).toContain("--disable apps");
  expect(args).toContain("--ignore-user-config");
  expect(args).toContain("--ignore-rules");
  expect(args).toContain('approval_policy="never"');
  expect(args).toContain('web_search="disabled"');
  expect(args).toContain('sandbox_mode="read-only"');
}

describe("codexTurnArgs", () => {
  const input = {
    instructions: "You are Producer Pal.",
    instructionsFile: "/tmp/instructions.md",
    mcpUrl: "http://localhost:3350/mcp",
    model: "terra",
  };

  it("builds a restricted initial MCP turn", () => {
    const args = codexTurnArgs(input);

    expect(args.slice(0, 3)).toStrictEqual(["exec", "--sandbox", "read-only"]);
    expect(args).toStrictEqual(
      expect.arrayContaining(["--model", "gpt-5.6-terra"]),
    );
    expectRestrictions(args);
    expect(args).toContain("mcp_servers.producer-pal.required=true");
    expect(args).toContain(
      'mcp_servers.producer-pal.default_tools_approval_mode="approve"',
    );
    expect(args.at(-1)).toBe("-");
  });

  it("pins resumed turns to every restriction through config", () => {
    const args = codexTurnArgs({ ...input, resumeSessionId: "thread-123" });

    expect(args.slice(0, 2)).toStrictEqual(["exec", "resume"]);
    expect(args).not.toContain("--sandbox");
    expectRestrictions(args);
    expect(args.slice(-2)).toStrictEqual(["thread-123", "-"]);
  });
});

describe("codexJudgeArgs", () => {
  it("runs ephemerally without MCP configuration", () => {
    const args = codexJudgeArgs({
      instructions: "You are a judge.",
      instructionsFile: "/tmp/judge.md",
      model: "luna",
    });

    expect(args).toContain("--ephemeral");
    expect(args).toStrictEqual(
      expect.arrayContaining(["--model", "gpt-5.6-luna"]),
    );
    expectRestrictions(args);
    expect(args.join(" ")).not.toContain("mcp_servers");
  });
});

describe("resolveCodexModel", () => {
  it("resolves friendly aliases and preserves explicit model ids", () => {
    expect(resolveCodexModel("sol")).toBe("gpt-5.6-sol");
    expect(resolveCodexModel("terra")).toBe("gpt-5.6-terra");
    expect(resolveCodexModel("luna")).toBe("gpt-5.6-luna");
    expect(resolveCodexModel("gpt-5.6-terra")).toBe("gpt-5.6-terra");
  });
});

describe("scrubAgentCliEnv", () => {
  it("forces Codex subscription auth while preserving other variables", () => {
    const env = scrubAgentCliEnv(
      {
        CODEX_API_KEY: "codex-secret",
        OPENAI_API_KEY: "api-secret",
        OPENAI_KEY: "eval-secret",
        PATH: "/usr/bin",
        EMPTY: undefined,
      },
      CODEX_CLI_TRANSPORT.strippedEnvVars,
    );

    expect(env).toStrictEqual({ PATH: "/usr/bin" });
  });
});

describe("parseCodexStream", () => {
  it("collects text, MCP calls, results, session id and usage", () => {
    const stdout = [
      { type: "thread.started", thread_id: "thread-abc" },
      {
        type: "item.started",
        item: {
          id: "call-1",
          type: "mcp_tool_call",
          server: "producer-pal",
          tool: "ppal-connect",
          arguments: "{}",
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "call-1",
          type: "mcp_tool_call",
          server: "producer-pal",
          tool: "ppal-connect",
          arguments: {},
          status: "completed",
          result: { content: [{ type: "text", text: "connected" }] },
        },
      },
      {
        type: "item.completed",
        item: { id: "message-1", type: "agent_message", text: "Connected." },
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 80,
          output_tokens: 20,
          reasoning_output_tokens: 5,
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const parsed = parseCodexStream(stdout);

    expect(parsed.text).toBe("Connected.");
    expect(parsed.sessionId).toBe("thread-abc");
    // The MCP envelope is unwrapped to its text block, matching what the AI SDK
    // path records — this string reaches the console, reports, and judge prompt.
    expect(parsed.toolCalls).toStrictEqual([
      { name: "ppal-connect", args: {}, result: "connected" },
    ]);
    expect(parsed.usage).toStrictEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 80,
      reasoningTokens: 5,
    });
  });

  it("pairs an id-less started/completed item into one call", () => {
    const stdout = [
      {
        type: "item.started",
        item: {
          type: "mcp_tool_call",
          tool: "ppal-create-clip",
          arguments: "",
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          tool: "ppal-create-clip",
          arguments: { trackIndex: 0 },
          status: "completed",
          result: "created",
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");

    expect(parseCodexStream(stdout).toolCalls).toStrictEqual([
      { name: "ppal-create-clip", args: { trackIndex: 0 }, result: "created" },
    ]);
  });

  it("keeps repeat calls to one tool separate", () => {
    const stdout = ["1", "2"]
      .flatMap((sceneIndex) => [
        {
          type: "item.started",
          item: {
            type: "mcp_tool_call",
            tool: "ppal-create-clip",
            status: "in_progress",
          },
        },
        {
          type: "item.completed",
          item: {
            type: "mcp_tool_call",
            tool: "ppal-create-clip",
            arguments: { sceneIndex },
            status: "completed",
          },
        },
      ])
      .map((event) => JSON.stringify(event))
      .join("\n");

    expect(parseCodexStream(stdout).toolCalls).toStrictEqual([
      { name: "ppal-create-clip", args: { sceneIndex: "1" } },
      { name: "ppal-create-clip", args: { sceneIndex: "2" } },
    ]);
  });

  it("refreshes args when the started event reported none", () => {
    const stdout = [
      {
        type: "item.started",
        item: {
          id: "call-1",
          type: "mcp_tool_call",
          tool: "ppal-update-clip",
          arguments: {},
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "call-1",
          type: "mcp_tool_call",
          tool: "ppal-update-clip",
          arguments: { ids: "1/1" },
          status: "completed",
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");

    expect(parseCodexStream(stdout).toolCalls).toStrictEqual([
      { name: "ppal-update-clip", args: { ids: "1/1" } },
    ]);
  });

  it("falls back to JSON for a result carrying no text block", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        id: "call-1",
        type: "mcp_tool_call",
        tool: "ppal-connect",
        arguments: {},
        status: "completed",
        result: { content: [{ type: "image", data: "…" }] },
      },
    });

    expect(parseCodexStream(stdout).toolCalls[0]?.result).toBe(
      JSON.stringify({ content: [{ type: "image", data: "…" }] }),
    );
  });

  // The bug this pins: unwrapping to the payload block dropped the relayed
  // `WARNING:` blocks that follow it, so the device scenarios' acceptance
  // checks — which grade on whether the engine warn-and-skipped — saw a clean
  // result and passed no matter what the engine did.
  it("keeps the relayed WARNING blocks beside the payload", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        id: "call-1",
        type: "mcp_tool_call",
        tool: "ppal-update-device",
        arguments: {},
        status: "completed",
        result: {
          content: [
            { type: "text", text: '{"id":"device1"}' },
            {
              type: "text",
              text: 'WARNING: updateDevice: setModulation target "Flt 1 Freq" — parameter not found',
            },
          ],
        },
      },
    });

    expect(parseCodexStream(stdout).toolCalls).toStrictEqual([
      {
        name: "ppal-update-device",
        args: {},
        result: '{"id":"device1"}',
        warnings: [
          'WARNING: updateDevice: setModulation target "Flt 1 Freq" — parameter not found',
        ],
      },
    ]);
  });

  it("records a failed MCP result without failing the whole turn", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        id: "call-1",
        type: "mcp_tool_call",
        tool: "ppal-connect",
        arguments: {},
        status: "failed",
        error: { message: "connection refused" },
      },
    });

    expect(parseCodexStream(stdout).toolCalls[0]?.result).toBe(
      "ERROR: connection refused",
    );
  });

  // Captured from a real `codex exec --json` run against the device: a tool that
  // throws comes back as `status: "failed"` with the message already in the
  // result's first text block and `error: null`. So the `ERROR:` fallback below
  // is for the no-result case (transport-level failure) only, and a failed call
  // never loses its message.
  it("keeps the message a failed call carries in its own result", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "mcp_tool_call",
        tool: "ppal-read-track",
        arguments: { trackIndex: 999 },
        result: {
          content: [
            {
              type: "text",
              text: "Error executing tool 'ppal-read-track': readTrack: trackIndex 999 does not exist",
            },
          ],
        },
        error: null,
        status: "failed",
      },
    });

    expect(parseCodexStream(stdout).toolCalls[0]?.result).toBe(
      "Error executing tool 'ppal-read-track': readTrack: trackIndex 999 does not exist",
    );
  });

  // Also captured live. An update tool that warn-and-skips reports `completed`
  // with an empty payload — the refusal is only in the WARNING block. Nothing is
  // dropped here, but the payload alone reads as a clean no-op, so anything
  // grading these calls has to read `warnings`, not just `result`.
  it("keeps the WARNING when the payload is an empty success", () => {
    const stdout = JSON.stringify({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "mcp_tool_call",
        tool: "ppal-update-clip",
        arguments: { path: "t0/s0" },
        result: {
          content: [
            { type: "text", text: "[]" },
            { type: "text", text: "WARNING: Failed to update clip 285" },
          ],
        },
        error: null,
        status: "completed",
      },
    });

    expect(parseCodexStream(stdout).toolCalls[0]).toStrictEqual({
      name: "ppal-update-clip",
      args: { path: "t0/s0" },
      result: "[]",
      warnings: ["WARNING: Failed to update clip 285"],
    });
  });

  it("throws on fatal turn errors and ignores stray output", () => {
    const stdout = [
      "warning line",
      JSON.stringify({ type: "turn.failed", error: { message: "boom" } }),
    ].join("\n");

    expect(() => parseCodexStream(stdout)).toThrow(/boom/);
  });
});

describe("countCodexSteps", () => {
  /**
   * Count the steps in a completed item of the given type.
   * @param type - The item's `type` field
   * @returns Steps the event spends
   */
  function stepsForCompleted(type: string): number {
    return countCodexSteps({ type: "item.completed", item: { type } });
  }

  it("counts a finished MCP call", () => {
    expect(stepsForCompleted("mcp_tool_call")).toBe(1);
  });

  it("ignores reasoning, replies, unfinished calls, and non-item events", () => {
    expect(stepsForCompleted("reasoning")).toBe(0);
    // Narration alongside a tool call would otherwise cost the turn two steps,
    // halving the tool work the shared budget buys.
    expect(stepsForCompleted("agent_message")).toBe(0);
    expect(
      countCodexSteps({
        type: "item.started",
        item: { type: "mcp_tool_call" },
      }),
    ).toBe(0);
    expect(countCodexSteps({ type: "turn.completed" })).toBe(0);
    expect(countCodexSteps({ type: "item.completed" })).toBe(0);
  });
});
