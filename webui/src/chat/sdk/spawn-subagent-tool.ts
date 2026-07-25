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
  "final message, not its full work log.";

const TASK_DESCRIPTION =
  "Complete, standalone instruction for the subagent to carry out. Include all " +
  "context it needs (track/clip names, key, scale, style, what to write) since it " +
  "cannot see this conversation. Scope it to specific tracks/clips to avoid " +
  "clobbering other work.";

/** Dependencies the spawn tool needs from its owning ChatSdkClient. */
export interface SpawnSubagentDeps {
  /** The orchestrator config, cloned per worker. The clone inherits model,
   * thinking, small-model mode, and tools by default, but a chosen "Default
   * subagent" preset (carried as config.subagentConfig) overrides those in
   * buildWorkerConfig. */
  config: ChatClientConfig;
  /**
   * Run a fully self-contained worker session for `task` and resolve with the
   * worker's final chat history. Injected by the client so this module needs no
   * ChatSdkClient import (avoids an import cycle) and stays unit-testable. The
   * tool-call id goes along so the runner can publish the worker's live status
   * (e.g. a rate-limit backoff) to the card this call renders as.
   */
  runWorker: (
    workerConfig: ChatClientConfig,
    task: string,
    toolCallId: string,
    abortSignal?: AbortSignal,
  ) => Promise<ChatMessage[]>;
  /** Mutable per-conversation spawn counter; enforces MAX_SPAWNS. */
  spawnState: { count: number };
  /**
   * Stash the worker's full transcript for the UI, keyed by tool-call id. The
   * client attaches it to the tool result out-of-band so it reaches the card but
   * NOT the orchestrator model (execute's return value is the only thing the
   * model sees). Optional so the tool works without a UI sink.
   */
  recordTranscript?: (toolCallId: string, transcript: ChatMessage[]) => void;
}

/**
 * Build the client-side spawn_subagent tool. Its execute() clones the
 * orchestrator config, runs a nested worker to completion, and returns a compact
 * result (the worker's final message) to the orchestrator model — never the full
 * sub-transcript, which would blow up the orchestrator's context.
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

      deps.spawnState.count++;

      const workerConfig = buildWorkerConfig(deps.config);
      const transcript = await deps.runWorker(
        workerConfig,
        task,
        toolCallId,
        abortSignal,
      );

      deps.recordTranscript?.(toolCallId, transcript);

      return extractWorkerResult(transcript);
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
 * never carries it).
 *
 * The spawn_subagent recursion guard is applied LAST — over whatever toolset
 * wins — so a worker can never spawn its own subagents, regardless of what a
 * chosen preset's toolset enables. (The worker's ToolSet then omits the spawn
 * tool anyway, since client.initialize only injects it when enabled.)
 * @param config - The orchestrator config to clone
 * @returns A worker config that inherits everything but can't delegate further
 */
export function buildWorkerConfig(config: ChatClientConfig): ChatClientConfig {
  // Drop subagentConfig from the worker (workers never spawn) and pull
  // enabledTools out so the worker's toolset is rebuilt explicitly below.
  const { subagentConfig, enabledTools, ...rest } = config;

  return {
    ...rest,
    ...subagentConfig,
    chatHistory: [],
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
