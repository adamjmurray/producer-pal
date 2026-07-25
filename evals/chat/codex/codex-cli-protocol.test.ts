// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";

import {
  codexCliProtocol,
  codexJudgeArgs,
  parseCodexStream,
  resolveCodexModel,
  scrubOpenAiKeys,
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
  expect(args).toContain("--ignore-user-config");
  expect(args).toContain("--ignore-rules");
  expect(args).toContain('approval_policy="never"');
  expect(args).toContain('web_search="disabled"');
  expect(args).toContain('sandbox_mode="read-only"');
}

describe("codexCliProtocol", () => {
  const input = {
    instructionsFile: "/tmp/instructions.md",
    mcpUrl: "http://localhost:3350/mcp",
    model: "terra",
  };

  it("builds a restricted initial MCP turn", () => {
    const args = codexCliProtocol(input);

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
    const args = codexCliProtocol({ ...input, resumeThreadId: "thread-123" });

    expect(args.slice(0, 2)).toStrictEqual(["exec", "resume"]);
    expect(args).not.toContain("--sandbox");
    expectRestrictions(args);
    expect(args.slice(-2)).toStrictEqual(["thread-123", "-"]);
  });
});

describe("codexJudgeArgs", () => {
  it("runs ephemerally without MCP configuration", () => {
    const args = codexJudgeArgs("luna", "/tmp/judge.md");

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

describe("scrubOpenAiKeys", () => {
  it("forces Codex subscription auth while preserving other variables", () => {
    const env = scrubOpenAiKeys({
      CODEX_API_KEY: "codex-secret",
      OPENAI_API_KEY: "api-secret",
      OPENAI_KEY: "eval-secret",
      PATH: "/usr/bin",
      EMPTY: undefined,
    });

    expect(env).toStrictEqual({ PATH: "/usr/bin" });
  });
});

describe("parseCodexStream", () => {
  it("collects text, MCP calls, results, thread id and usage", () => {
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
    expect(parsed.threadId).toBe("thread-abc");
    expect(parsed.toolCalls).toStrictEqual([
      {
        name: "ppal-connect",
        args: {},
        result: JSON.stringify({
          content: [{ type: "text", text: "connected" }],
        }),
      },
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

  it("throws on fatal turn errors and ignores stray output", () => {
    const stdout = [
      "warning line",
      JSON.stringify({ type: "turn.failed", error: { message: "boom" } }),
    ].join("\n");

    expect(() => parseCodexStream(stdout)).toThrow(/boom/);
  });
});
