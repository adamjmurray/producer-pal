// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The chat CLI's agent-CLI loop, with the session and readline stubbed out, so
 * these tests cover the wiring only: turn numbering, --once, error handling,
 * and cleanup.
 */

import { type Interface } from "node:readline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EvalSession } from "#evals/scenarios/eval-session.ts";
import {
  runAgentCliChat,
  type AgentCliChatOptions,
} from "../agent-cli-chat.ts";

const { createSessionMock, sendMessageMock, closeMock, createReadlineMock } =
  vi.hoisted(() => ({
    createSessionMock: vi.fn(),
    sendMessageMock: vi.fn(),
    closeMock: vi.fn(async () => {}),
    createReadlineMock: vi.fn(() => ({ close: vi.fn() })),
  }));

vi.mock(import("../agent-cli-session.ts"), () => ({
  createAgentCliSession: createSessionMock as unknown as never,
}));

vi.mock(import("../../shared/readline.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  createReadline: createReadlineMock as unknown as () => Interface,
}));

/**
 * Build chat options for one run.
 *
 * @param overrides - Fields to change from the defaults
 * @returns Options accepted by runAgentCliChat
 */
function makeOptions(
  overrides: Partial<AgentCliChatOptions> = {},
): AgentCliChatOptions {
  return {
    provider: "claude-code",
    model: "sonnet",
    ...overrides,
  };
}

describe("runAgentCliChat", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    sendMessageMock.mockResolvedValue({ text: "ok", toolCalls: [] });
    createSessionMock.mockImplementation(
      async (): Promise<EvalSession> =>
        ({
          sendMessage: sendMessageMock,
          close: closeMock,
        }) as unknown as EvalSession,
    );
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("sends each sequenced message with its turn number, then closes", async () => {
    await runAgentCliChat("", makeOptions({ sequence: ["say a", "say b"] }));

    expect(sendMessageMock.mock.calls).toStrictEqual([
      ["say a", 1],
      ["say b", 2],
    ]);
    expect(closeMock).toHaveBeenCalled();
  });

  it("stops after one turn with --once", async () => {
    await runAgentCliChat(
      "",
      makeOptions({ sequence: ["say a", "say b"], once: true }),
    );

    expect(sendMessageMock.mock.calls).toStrictEqual([["say a", 1]]);
  });

  it("lets the session own the turn log and passes -i and -u through", async () => {
    await runAgentCliChat(
      "",
      makeOptions({ sequence: ["hi"], instructions: "", usage: true }),
    );

    expect(createSessionMock.mock.calls[0]?.[1]).toStrictEqual({
      model: "sonnet",
      instructions: "",
      usage: true,
      logTurns: false,
    });
  });

  it("leaves instructions unset so the session supplies its own prompt", async () => {
    await runAgentCliChat("", makeOptions({ sequence: ["hi"] }));

    expect(createSessionMock.mock.calls[0]?.[1]).toStrictEqual({
      model: "sonnet",
      instructions: undefined,
      usage: undefined,
      logTurns: false,
    });
  });

  it("warns about the flags a spawned CLI cannot take", async () => {
    await runAgentCliChat(
      "",
      makeOptions({
        sequence: ["hi"],
        thinking: "high",
        randomness: 0.5,
        baseUrl: "http://localhost:1234/v1",
      }),
    );

    const warning = String(vi.mocked(console.warn).mock.calls[0]?.[0]);

    expect(warning).toContain("--thinking");
    expect(warning).toContain("--randomness");
    expect(warning).toContain("--base-url");
    expect(warning).not.toContain("--output-tokens");
  });

  it("flags a failing exit code when a turn reports an error", async () => {
    sendMessageMock.mockResolvedValue({
      text: "",
      toolCalls: [],
      error: "stream blew up",
    });

    await runAgentCliChat("", makeOptions({ sequence: ["hi"] }));

    expect(process.exitCode).toBe(1);
  });

  it("reports a thrown turn error and still closes the session", async () => {
    sendMessageMock.mockRejectedValue(new Error("claude not found"));

    await runAgentCliChat("", makeOptions({ sequence: ["hi"] }));

    expect(vi.mocked(console.error).mock.calls[0]).toStrictEqual([
      "Error:",
      "claude not found",
    ]);
    expect(process.exitCode).toBe(1);
    expect(closeMock).toHaveBeenCalled();
  });
});
