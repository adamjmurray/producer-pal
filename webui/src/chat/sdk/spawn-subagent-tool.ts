// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Tool, jsonSchema } from "ai";
import { type ChatClientConfig, type ChatMessage } from "./types";

/**
 * Client-side delegation tool name. Not an MCP tool: it runs a nested chat
 * session in the browser (needs the decrypted API key + chat client, both
 * unreachable from the server), so it has no `ppal-` prefix and never appears in
 * the MCP /tools response. The Tools tab surfaces it as an opt-in "Subagent"
 * toggle keyed by this exact string.
 */
export const SPAWN_SUBAGENT_TOOL_NAME = "spawn_subagent";

/**
 * A worker's nested tool-step budget. Higher than the orchestrator's default so
 * a delegated subtask — which does its own connect plus multi-step editing — has
 * room to finish.
 */
export const MAX_WORKER_STEPS = 20;

/**
 * Safety/cost cap on total subagents spawned in one orchestrator conversation,
 * independent of the step budget. In a future parallel mode this cap — not the
 * step count — bounds fan-out.
 */
export const MAX_SPAWNS = 10;

const TOOL_DESCRIPTION =
  "Delegate a self-contained subtask to a subagent: a nested assistant with the " +
  "full Producer Pal toolset that works in the same Ableton Live Set and reports " +
  "its final result back to you. Break a large job into focused pieces (plan the " +
  "arrangement yourself, then delegate each track). When subtasks are " +
  "independent, call this tool several times in ONE response so the subagents run " +
  "in parallel — the results all come back together. The subagent cannot see this " +
  "conversation, so give a complete, standalone instruction, and scope it to " +
  "specific tracks/clips so parallel subagents don't overwrite each other. " +
  "Subagents cannot spawn their own subagents. You receive only each subagent's " +
  "final message, not its full work log. Each result is labeled with that " +
  "subagent's number — pass it as resumeFrom to give the same subagent more work " +
  "instead of briefing a fresh one.";

const TASK_DESCRIPTION =
  "Complete, standalone instruction for the subagent to carry out. Include all " +
  "context it needs (track/clip names, key, scale, style, what to write) since it " +
  "cannot see this conversation. Scope it to specific tracks/clips to avoid " +
  "clobbering other work. With resumeFrom, this is just the follow-up — that " +
  "subagent still has its own context, so don't repeat it.";

const RESUME_DESCRIPTION =
  "Number of an earlier subagent to continue (from its result label) instead of " +
  "starting a fresh one. It keeps everything it did and knows, so this is the " +
  "cheap way to extend, correct, or finish its work — including work you stopped " +
  "partway. Omit to start a new subagent.";

/** What the runner needs to start (or continue) one worker session. */
export interface RunWorkerOptions {
  /** Cloned orchestrator config, seeded with the session to continue if any. */
  workerConfig: ChatClientConfig;
  /** The instruction to send as this run's user turn. */
  task: string;
  /** Spawn tool-call id; keys the card's live status and the transcript stash. */
  toolCallId: string;
  /** 1-based worker identity, reused when continuing an existing worker. */
  subagentIndex: number;
  /** The orchestrator turn's signal, so Stop aborts the worker too. */
  abortSignal?: AbortSignal;
}

/** Dependencies the spawn tool needs from its owning ChatSdkClient. */
export interface SpawnSubagentDeps {
  /** The orchestrator config, cloned per worker. The clone inherits model,
   * thinking, small-model mode, and tools by default, but a chosen "Default
   * subagent" preset (carried as config.subagentConfig) overrides those in
   * buildWorkerConfig. */
  config: ChatClientConfig;
  /**
   * Run a worker session for `task` and resolve with the worker's final chat
   * history (the whole thing, including any seeded prefix). Injected by the
   * client so this module needs no ChatSdkClient import (avoids an import cycle)
   * and stays unit-testable. The runner publishes the worker's live status (e.g.
   * a rate-limit backoff) to the card, and owns stashing the transcript, because
   * it still holds the worker's history on the paths where this tool throws (a
   * Stop mid-worker above all).
   */
  runWorker: (options: RunWorkerOptions) => Promise<ChatMessage[]>;
  /** Mutable per-conversation spawn state; see SpawnState. */
  spawnState: SpawnState;
  /**
   * The session recorded for worker `index` so far, deep-copied and ready to
   * seed a resume; undefined when this conversation has no such worker.
   */
  getSession?: (index: number) => ChatMessage[] | undefined;
}

/** Mutable spawn bookkeeping shared by the tool and its owning client. */
export interface SpawnState {
  /** Worker runs started in this client's lifetime; enforces MAX_SPAWNS. */
  count: number;
  /**
   * Highest worker index handed out. Seeded from history when a conversation is
   * restored, so a new worker never reuses a persisted worker's number.
   */
  nextIndex: number;
  /**
   * Indices with a run in flight. Two concurrent resumes of one worker would
   * each seed from the same session and then record divergent continuations
   * under the same index, leaving a session that never happened for the next
   * resume to inherit — so the second one is refused instead.
   */
  active: Set<number>;
}

/**
 * Build the client-side spawn_subagent tool. Its execute() clones the
 * orchestrator config, runs a nested worker to completion, and returns a compact
 * result (the worker's final message) to the orchestrator model — never the full
 * sub-transcript, which the runner stashes for the UI instead (it would blow up
 * the orchestrator's context).
 * @param deps - Config to clone, worker runner, and the shared spawn counter
 * @returns An AI SDK tool that spawns and awaits one subagent
 */
export function createSpawnSubagentTool(deps: SpawnSubagentDeps): Tool {
  return {
    description: TOOL_DESCRIPTION,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        task: { type: "string", description: TASK_DESCRIPTION },
        resumeFrom: { type: "number", description: RESUME_DESCRIPTION },
      },
      required: ["task"],
      additionalProperties: false,
    }),
    execute: async (
      args: Record<string, unknown>,
      {
        abortSignal,
        toolCallId,
      }: { abortSignal?: AbortSignal; toolCallId: string },
    ): Promise<string> => {
      const task = args.task;

      if (typeof task !== "string" || task.trim() === "") {
        throw new Error("spawn_subagent requires a non-empty 'task' string.");
      }

      if (deps.spawnState.count >= MAX_SPAWNS) {
        throw new Error(
          `Subagent limit reached (${MAX_SPAWNS} per conversation). ` +
            "Finish the remaining work directly instead of delegating.",
        );
      }

      // A resume inherits the worker's index and its recorded session; a fresh
      // spawn takes the next index and starts empty.
      const resumeFrom = parseResumeFrom(args.resumeFrom);
      const session =
        resumeFrom == null ? undefined : loadSession(resumeFrom, deps);
      const subagentIndex = resumeFrom ?? ++deps.spawnState.nextIndex;

      if (deps.spawnState.active.has(subagentIndex)) {
        throw new Error(
          `Subagent ${subagentIndex} is still running. Wait for its result ` +
            "before giving it more work.",
        );
      }

      deps.spawnState.count++;
      deps.spawnState.active.add(subagentIndex);

      try {
        const transcript = await deps.runWorker({
          workerConfig: buildWorkerConfig(deps.config, session),
          task,
          toolCallId,
          subagentIndex,
          abortSignal,
        });

        return labelWorkerResult(
          subagentIndex,
          extractWorkerResult(transcript),
        );
      } finally {
        deps.spawnState.active.delete(subagentIndex);
      }
    },
  };
}

/**
 * Clone the orchestrator config for a worker: fresh history, the worker step
 * budget, and spawn_subagent disabled. Disabling it is the recursion guard — the
 * worker's ToolSet omits the spawn tool (client.initialize only injects it when
 * enabled), so workers cannot spawn their own subagents.
 *
 * When the user picked a "Default subagent" preset, the orchestrator config
 * carries a resolved `subagentConfig` whose model/inference AND toolset (when
 * the preset saved one) are layered over the clone — so a strong planner can
 * drive uniform cheaper workers. A preset that carries a toolset supplies the
 * worker's tools as-is (its captured sparse map; it does NOT carry over the
 * orchestrator's explicit disables, so a tool the preset never captured stays at
 * its default-enabled state downstream — same as applying the preset in the
 * picker). A preset without one (and the no-preset case) inherits the
 * orchestrator's tools. The system instruction always inherits (subagentConfig
 * never carries it). `notation` layers the same way, through the spread — a
 * worker that carries one runs its whole MCP conversation in it (skills, param
 * descriptions, and how notes are parsed and formatted), independent of the
 * orchestrator.
 *
 * The spawn_subagent recursion guard is applied LAST — over whatever toolset
 * wins — so a worker can never spawn its own subagents, regardless of what a
 * chosen preset's toolset enables. (The worker's ToolSet then omits the spawn
 * tool anyway, since client.initialize only injects it when enabled.)
 *
 * `session` continues an existing worker: it becomes the clone's chatHistory, so
 * the next turn lands on top of everything that worker already did. It must be a
 * copy the worker may mutate freely (collectSubagentTranscript returns one) —
 * this array becomes the worker's live history. Model and inference still resolve
 * from the CURRENT config, exactly as for a fresh spawn; a resumed worker is not
 * pinned to the settings its first run used.
 * @param config - The orchestrator config to clone
 * @param session - Recorded session to continue; omit to start fresh
 * @returns A worker config that inherits everything but can't delegate further
 */
export function buildWorkerConfig(
  config: ChatClientConfig,
  session?: ChatMessage[],
): ChatClientConfig {
  // Drop subagentConfig from the worker (workers never spawn) and pull
  // enabledTools out so the worker's toolset is rebuilt explicitly below.
  const { subagentConfig, enabledTools, ...rest } = config;

  return {
    ...rest,
    ...subagentConfig,
    chatHistory: session ?? [],
    maxSteps: MAX_WORKER_STEPS,
    enabledTools: {
      // Preset toolset (if the preset saved one), used as-is; otherwise inherit
      // the orchestrator's. It's a sparse map — absent keys stay default-enabled
      // downstream (filterEnabledTools), so this does not carry over the
      // orchestrator's disables. Guard applied last, unconditionally.
      ...(subagentConfig?.enabledTools ?? enabledTools),
      [SPAWN_SUBAGENT_TOOL_NAME]: false,
    },
  };
}

/**
 * The compact result handed back to the orchestrator model: the worker's last
 * assistant message. The full transcript is kept UI-side and never sent to the
 * model.
 * @param history - The worker's final chat history (oldest first)
 * @returns The worker's final assistant text, or a fallback if it produced none
 */
export function extractWorkerResult(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];

    if (msg?.role === "assistant" && !msg.isError && msg.content.trim()) {
      return msg.content.trim();
    }
  }

  return "The subagent finished without a final message.";
}

/**
 * Matches the worker label leading a spawn result. Exported so the card can
 * strip it for display — it shows the number in its own header instead.
 */
export const SUBAGENT_LABEL_PATTERN = /^\[subagent (\d+)\]\n/;

/**
 * Tag a worker's result with its index, so the model can address that worker
 * again via `resumeFrom`. This label is the ONLY way the number reaches the
 * model: the tool's return value is all it sees of a spawn, and it can't read
 * the subagentIndex the UI goes by. Note that compaction drops older turns from
 * the model's view, so a label can scroll out of reach — resuming stays possible
 * (lookup reads history), but the model has to still know the number to ask.
 * @param index - The worker's 1-based index
 * @param result - The worker's compact final message
 * @returns The labeled result the orchestrator model receives
 */
export function labelWorkerResult(index: number, result: string): string {
  return `[subagent ${index}]\n${result}`;
}

/**
 * Validate the `resumeFrom` argument, coercing the numeric string LLMs often
 * send. Anything present but unusable throws rather than silently starting a
 * fresh worker — a resume that quietly becomes a new spawn would re-do work and
 * lose the context the caller was trying to reuse.
 * @param value - The raw argument value
 * @returns The worker index to resume, or undefined when not resuming
 */
function parseResumeFrom(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;

  const index = Number(value);

  if (!Number.isInteger(index) || index < 1) {
    throw new Error(
      `resumeFrom must be a subagent number from an earlier result, got ` +
        `${JSON.stringify(value)}. Omit it to start a new subagent.`,
    );
  }

  return index;
}

/**
 * Load the session `resumeFrom` names, or explain why it can't be resumed.
 * @param resumeFrom - The worker index the caller asked to continue
 * @param deps - The tool's injected dependencies
 * @returns The recorded session to seed the worker with
 */
function loadSession(
  resumeFrom: number,
  deps: SpawnSubagentDeps,
): ChatMessage[] {
  const session = deps.getSession?.(resumeFrom);

  if (!session) {
    throw new Error(
      `There is no subagent ${resumeFrom} in this conversation. Omit ` +
        "resumeFrom to start a new subagent for this work.",
    );
  }

  return session;
}
