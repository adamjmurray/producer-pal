// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scaffolding shared by the orchestrator/worker client suites.
 *
 * Every export assumes the importing test file mocked `ai` with
 * `streamText: vi.fn()` and stubbed the MCP tools. The mock registry is
 * per-test-file and covers its whole import graph, so these helpers see
 * whatever that file installed.
 */

import { streamText } from "ai";
import { type vi } from "vitest";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  MAX_SPAWNS,
  SPAWN_SUBAGENT_TOOL_NAME,
} from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  createConfig,
  mockStreamParts,
} from "#webui/chat/sdk/tests/client-test-helpers";
import { type ChatMessage } from "#webui/chat/sdk/types";

/** One entry of a message's `toolResults`. */
type ToolResultEntry = NonNullable<ChatMessage["toolResults"]>[number];

/** The mocked streamText, for queueing per-call streams. */
export const streamTextMock = streamText as ReturnType<typeof vi.fn>;

/** The spawn tool's execute, as the AI SDK calls it. */
export type SpawnExecute = (
  args: Record<string, unknown>,
  opts: { toolCallId: string; messages: []; abortSignal?: AbortSignal },
) => Promise<string>;

/**
 * The `tools` object passed to the most recent streamText call.
 * @returns The tool map streamText last received (empty if none)
 */
export function lastStreamTools(): Record<string, { execute?: unknown }> {
  const calls = streamTextMock.mock.calls;
  const call = calls.at(-1)?.[0] as
    | { tools?: Record<string, { execute?: unknown }> }
    | undefined;

  return call?.tools ?? {};
}

/**
 * Grab the spawn tool the orchestrator injected into its last streamText call.
 * @returns The spawn tool's execute function
 */
export function spawnToolExecute(): SpawnExecute {
  const tool = lastStreamTools()[SPAWN_SUBAGENT_TOOL_NAME] as {
    execute: SpawnExecute;
  };

  return tool.execute;
}

/**
 * A stream that emits `parts` and then fails — how a provider stream ends when
 * the turn is aborted partway through.
 * @param parts - Stream parts to emit before failing
 * @param error - The error to throw after the last part
 * @returns A streamText-shaped result
 */
export function failingAfterStream(
  parts: Record<string, unknown>[],
  error: unknown,
): { stream: AsyncIterable<Record<string, unknown>> } {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;

    throw error;
  }

  return { stream: iterate() };
}

/**
 * A stream that emits `parts`, then parks on `gate` before failing — a worker
 * whose abort is still unwinding after the orchestrator's stream has closed.
 * @param parts - Stream parts to emit before parking
 * @param gate - Resolve to let the stream finish failing
 * @param error - The error to throw once released
 * @returns A streamText-shaped result
 */
export function blockedAfterStream(
  parts: Record<string, unknown>[],
  gate: Promise<void>,
  error: unknown,
): { stream: AsyncIterable<Record<string, unknown>> } {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;

    await gate;

    throw error;
  }

  return { stream: iterate() };
}

/**
 * The error an aborted fetch/stream rejects with.
 * @returns An AbortError
 */
export function abortError(): Error {
  return Object.assign(new Error("The operation was aborted."), {
    name: "AbortError",
  });
}

/**
 * Poll until `condition` holds. Real timers (not fake ones) because the code
 * under test interleaves timer waits with many awaits, and advancing fake timers
 * doesn't reliably flush those. Waiting on an observable condition rather than a
 * fixed delay matters here: a fixed wait that proved too short would make the
 * shared-gate assertions fail as though the gate were per-worker.
 * @param condition - Checked after each tick
 * @param timeoutMs - Give up (and let the assertion report the real state) after this
 */
export async function until(
  condition: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Run one orchestrator turn to completion with a trivial stop stream.
 * @param client - The client to drive
 * @param message - User message to send
 */
export async function runTurn(
  client: ChatSdkClient,
  message = "hi",
): Promise<void> {
  mockStreamParts([{ type: "finish", finishReason: "stop" }]);

  for await (const _ of client.sendMessage(message)) {
    /* consume */
  }
}

/**
 * Boot an orchestrator with spawn_subagent enabled and run one turn, so the
 * injected tool is captured in the streamText args.
 * @returns The client and the injected spawn tool's execute function
 */
export async function orchestratorWithSpawnTool(): Promise<{
  client: ChatSdkClient;
  execute: SpawnExecute;
}> {
  const client = new ChatSdkClient(
    "key",
    createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true } }),
  );

  await client.initialize();
  await runTurn(client);

  return { client, execute: spawnToolExecute() };
}

/**
 * Spend a turn's entire spawn budget, one successful worker per allowance.
 * @param execute - The injected spawn tool's execute function
 */
export async function exhaustSpawnBudget(execute: SpawnExecute): Promise<void> {
  for (let i = 0; i < MAX_SPAWNS; i++) {
    mockStreamParts([
      { type: "text-delta", text: `Worker ${i + 1}.` },
      { type: "finish", finishReason: "stop" },
    ]);
    await execute(
      { task: `piece ${i + 1}` },
      { toolCallId: `tc-${i}`, messages: [], abortSignal: undefined },
    );
  }
}

/**
 * The tool-result entry a spawn tool-call id landed on, wherever in history.
 * @param client - The orchestrator client
 * @param toolCallId - The spawn tool-call id to look up
 * @returns The entry, or undefined when the turn produced none
 */
export function findSpawnEntry(
  client: ChatSdkClient,
  toolCallId: string,
): ToolResultEntry | undefined {
  return client.chatHistory
    .flatMap((m) => m.toolResults ?? [])
    .find((tr) => tr.id === toolCallId);
}
