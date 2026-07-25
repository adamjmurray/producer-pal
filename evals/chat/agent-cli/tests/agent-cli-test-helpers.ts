// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared plumbing for the agent-CLI transport tests: the fixture binary's path,
 * a temp working directory per test, and canned JSONL in each CLI's schema.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The stand-in binary `*_BIN` is pointed at. See agent-cli-fixture.mjs. */
export const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  "agent-cli-fixture.mjs",
);

/**
 * Make a temp directory for one test to spawn in and record into.
 *
 * @returns The directory, a record-file path inside it, and a cleanup callback
 */
export async function makeFixtureDir(): Promise<{
  dir: string;
  recordFile: string;
  cleanup: () => Promise<void>;
}> {
  // Resolved, because macOS hands out /var/… paths that the child reports back
  // as /private/var/… once it is the process cwd.
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "producer-pal-agent-cli-test-")),
  );

  return {
    dir,
    recordFile: join(dir, "invocations.jsonl"),
    cleanup: async () => await rm(dir, { recursive: true, force: true }),
  };
}

/** One recorded fixture invocation. */
export interface FixtureInvocation {
  argv: string[];
  stdin: string;
  cwd: string;
}

/**
 * Read every invocation the fixture appended, in call order.
 *
 * @param recordFile - Path the fixture was told to record to
 * @returns The recorded invocations
 */
export function readInvocations(recordFile: string): FixtureInvocation[] {
  return readFileSync(recordFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FixtureInvocation);
}

/**
 * Serialize events as the JSONL these CLIs stream on stdout.
 *
 * @param events - Events to emit, in order
 * @returns Newline-delimited JSON
 */
export function toJsonl(events: unknown[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

/**
 * Build a one-tool Codex turn: thread id, an MCP call, a reply, and usage.
 *
 * @param threadId - Thread id the turn reports
 * @param text - The assistant's reply
 * @returns Codex JSONL stdout
 */
export function codexTurnStdout(threadId: string, text: string): string {
  return toJsonl([
    { type: "thread.started", thread_id: threadId },
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
    { type: "item.completed", item: { type: "agent_message", text } },
    {
      type: "turn.completed",
      usage: { input_tokens: 10, output_tokens: 4 },
    },
  ]);
}

/**
 * Build a one-tool Claude Code turn in the same shape as codexTurnStdout.
 *
 * @param sessionId - Session id the turn reports
 * @param text - The assistant's reply
 * @returns Claude Code JSONL stdout
 */
export function claudeTurnStdout(sessionId: string, text: string): string {
  return toJsonl([
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      mcp_servers: [{ name: "producer-pal", status: "connected" }],
    },
    {
      type: "assistant",
      session_id: sessionId,
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
      session_id: sessionId,
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [{ type: "text", text: "connected" }],
          },
        ],
      },
    },
    {
      type: "assistant",
      session_id: sessionId,
      message: { content: [{ type: "text", text }] },
    },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      result: text,
      session_id: sessionId,
      usage: { input_tokens: 10, output_tokens: 4 },
    },
  ]);
}
