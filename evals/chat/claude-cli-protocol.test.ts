// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  buildJudgeArgs,
  buildMcpConfig,
  buildSessionArgs,
  mapUsage,
  normalizeMcpToolName,
  parseJudgeEnvelope,
  parseSessionStream,
  scrubAnthropicKey,
} from "./claude-cli-protocol.ts";

describe("scrubAnthropicKey", () => {
  it("removes Anthropic API keys but keeps everything else", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-secret",
      ANTHROPIC_KEY: "sk-ant-secret-2",
      PATH: "/usr/bin",
      HOME: "/home/x",
    };
    const out = scrubAnthropicKey(env);

    expect(out.ANTHROPIC_API_KEY).toBeUndefined();
    expect(out.ANTHROPIC_KEY).toBeUndefined();
    expect(out.PATH).toBe("/usr/bin");
    expect(out.HOME).toBe("/home/x");
  });

  it("drops undefined values", () => {
    const out = scrubAnthropicKey({ A: undefined, B: "b" });

    expect(out).toStrictEqual({ B: "b" });
  });
});

describe("buildMcpConfig", () => {
  it("emits an http MCP server under the producer-pal key", () => {
    const cfg = JSON.parse(buildMcpConfig("http://localhost:9999/mcp"));

    expect(cfg).toStrictEqual({
      mcpServers: {
        "producer-pal": { type: "http", url: "http://localhost:9999/mcp" },
      },
    });
  });
});

describe("buildSessionArgs", () => {
  it("builds stream-json args with allowed Producer Pal tools and default system prompt", () => {
    const args = buildSessionArgs({ model: "sonnet", mcpConfig: "{}" });

    expect(args).toContain("--print");
    expect(args).toContain("--verbose");
    expect(args).toStrictEqual(
      expect.arrayContaining(["--output-format", "stream-json"]),
    );
    expect(args).toStrictEqual(
      expect.arrayContaining(["--allowedTools", "mcp__producer-pal"]),
    );
    expect(args).toStrictEqual(expect.arrayContaining(["--model", "sonnet"]));
    // Replaces (not appends) Claude Code's default prompt with the Producer Pal one.
    expect(args).toContain("--system-prompt");
    expect(args).not.toContain("--append-system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toMatch(/Producer Pal/);
    expect(args).not.toContain("--resume");
  });

  it("adds --resume and uses a scenario's instructions as the system prompt", () => {
    const args = buildSessionArgs({
      model: "haiku",
      mcpConfig: "{}",
      resumeSessionId: "sess-123",
      systemPrompt: "be terse",
    });

    expect(args).toStrictEqual(
      expect.arrayContaining(["--resume", "sess-123"]),
    );
    expect(args).toStrictEqual(
      expect.arrayContaining(["--system-prompt", "be terse"]),
    );
  });
});

describe("buildJudgeArgs", () => {
  it("disables MCP and uses the plain json envelope", () => {
    const args = buildJudgeArgs("haiku", "judge system");

    expect(args).toStrictEqual(
      expect.arrayContaining(["--output-format", "json"]),
    );
    expect(args).toStrictEqual(
      expect.arrayContaining(["--mcp-config", '{"mcpServers":{}}']),
    );
    expect(args).toStrictEqual(
      expect.arrayContaining(["--system-prompt", "judge system"]),
    );
  });
});

describe("normalizeMcpToolName", () => {
  it("strips the mcp__<server>__ prefix", () => {
    expect(normalizeMcpToolName("mcp__producer-pal__ppal-connect")).toBe(
      "ppal-connect",
    );
    expect(normalizeMcpToolName("mcp__producer-pal__ppal-read-live-set")).toBe(
      "ppal-read-live-set",
    );
  });

  it("passes non-MCP names through unchanged", () => {
    expect(normalizeMcpToolName("Bash")).toBe("Bash");
    expect(normalizeMcpToolName("ppal-connect")).toBe("ppal-connect");
  });
});

describe("mapUsage", () => {
  it("returns undefined for missing usage", () => {
    expect(mapUsage(undefined)).toBeUndefined();
  });

  it("sums fresh + cache tokens into inputTokens and records cache reads", () => {
    const usage = mapUsage({
      input_tokens: 10,
      output_tokens: 40,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 5,
    });

    expect(usage).toStrictEqual({
      inputTokens: 115,
      outputTokens: 40,
      totalTokens: 155,
      cachedInputTokens: 100,
    });
  });
});

describe("parseSessionStream", () => {
  it("extracts text, normalized tool calls, usage and session id", () => {
    const stream = [
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "sess-abc",
      }),
      JSON.stringify({
        type: "assistant",
        session_id: "sess-abc",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "mcp__producer-pal__ppal-connect",
              input: {},
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_1",
              content: [{ type: "text", text: "connected" }],
            },
          ],
        },
      }),
      JSON.stringify({
        type: "assistant",
        session_id: "sess-abc",
        message: { content: [{ type: "text", text: "Connected to Live." }] },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Connected to Live.",
        session_id: "sess-abc",
        usage: { input_tokens: 9, output_tokens: 20 },
      }),
    ].join("\n");

    const parsed = parseSessionStream(stream);

    expect(parsed.text).toBe("Connected to Live.");
    expect(parsed.sessionId).toBe("sess-abc");
    expect(parsed.toolCalls).toStrictEqual([
      { name: "ppal-connect", args: {}, result: "connected" },
    ]);
    expect(parsed.usage?.inputTokens).toBe(9);
    expect(parsed.usage?.outputTokens).toBe(20);
  });

  it("tolerates stray non-JSON lines", () => {
    const stream = [
      "not json",
      JSON.stringify({ type: "result", result: "ok", is_error: false }),
    ].join("\n");

    expect(parseSessionStream(stream).text).toBe("ok");
  });

  it("throws on an error result", () => {
    const stream = JSON.stringify({
      type: "result",
      is_error: true,
      result: "boom",
    });

    expect(() => parseSessionStream(stream)).toThrow(/boom/);
  });
});

describe("parseJudgeEnvelope", () => {
  it("returns the result text", () => {
    const out = parseJudgeEnvelope(
      JSON.stringify({ is_error: false, result: '{"accuracy":1}' }),
    );

    expect(out).toBe('{"accuracy":1}');
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJudgeEnvelope("nonsense")).toThrow(/not valid JSON/);
  });

  it("throws on an error envelope", () => {
    expect(() =>
      parseJudgeEnvelope(JSON.stringify({ is_error: true, result: "bad" })),
    ).toThrow(/error envelope/);
  });
});
