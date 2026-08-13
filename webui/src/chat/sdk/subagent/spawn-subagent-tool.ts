// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Tool, jsonSchema } from "ai";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";
import {
  isToolEnabled,
  SPAWN_SUBAGENT_TOOL_NAME,
} from "#webui/lib/utils/enabled-tools";
import { withBriefing, withheldToolsApplied } from "./subagent-briefing";

/**
 * A worker's nested tool-step budget. Higher than the orchestrator's default so
 * a delegated subtask — reading what it needs, then multi-step editing — has
 * room to finish. Not lowered when a briefing removes the connect step: a worker
 * that runs out of steps strands the orchestrator, and the unused headroom of a
 * short task costs nothing.
 */
export const MAX_WORKER_STEPS = 20;

/**
 * Safety/cost cap on worker spawn ATTEMPTS one orchestrator TURN may make,
 * independent of the step budget. Resuming a worker counts — it costs a full
 * nested session, same as a fresh spawn — and so does an attempt this tool
 * rejects, which is what stops a model repeating a call it keeps getting wrong.
 *
 * Per turn, not per conversation: the human is in the loop between turns and can
 * see what the last one spent, so this exists to stop ONE runaway turn, not to
 * retire a long conversation's ability to delegate. With parallel spawns (several
 * calls in one response) this cap — not the step count — is what bounds fan-out,
 * since a whole burst costs a single step.
 */
export const MAX_SPAWNS = 10;

const TOOL_DESCRIPTION =
  "Delegate a self-contained subtask to a subagent: a nested assistant with the " +
  "full Producer Pal toolset, working in the same Ableton Live Set. Break a large " +
  "job into focused pieces (plan the arrangement yourself, then delegate each " +
  "track), and call this tool several times in ONE response to run independent " +
  "subtasks in parallel. Subagents cannot spawn their own. You receive only each " +
  "subagent's final message, labeled with its number — pass that number as " +
  "resumeFrom to give the same subagent more work instead of briefing a fresh one.";

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
  'partway. For a NEW subagent, leave this field out: {"task": "..."}.';

/** What the runner needs to start (or continue) one worker session. */
export interface RunWorkerOptions {
  /**
   * Produce the config this worker runs under (a clone of the orchestrator's,
   * seeded with the session to continue if any, briefed if a briefing can be
   * had). A thunk, not a value: fetching the briefing is a real round trip, and
   * awaiting it before handing the run to the runner would leave the run
   * untracked for its whole duration — a turn that ended in that window would
   * tear down while a worker was still about to edit the Live Set.
   */
  resolveConfig: () => Promise<ChatClientConfig>;
  /** The instruction to send as this run's user turn. */
  task: string;
  /** Spawn tool-call id; keys the card's live status and the transcript stash. */
  toolCallId: string;
  /** 1-based worker identity, reused when continuing an existing worker. */
  subagentIndex: number;
  /** The orchestrator turn's signal, so Stop aborts the worker too. */
  abortSignal?: AbortSignal;
}

/** What one worker run produced. */
export interface WorkerRunResult {
  /**
   * The messages THIS run added — a resume's seeded prefix is excluded, so the
   * result reported back is always an answer to the task just given, never the
   * previous run's closing message.
   */
  messages: ChatMessage[];
  /** Whether the run stopped on its step budget rather than finishing. */
  toolLimitReached: boolean;
}

/** Dependencies the spawn tool needs from its owning ChatSdkClient. */
export interface SpawnSubagentDeps {
  /** The orchestrator config, cloned per worker. The clone inherits model,
   * thinking, small-model mode, and tools by default, but a chosen "Default
   * subagent" preset (carried as config.subagentConfig) overrides those in
   * buildWorkerConfig. */
  config: ChatClientConfig;
  /**
   * Run a worker session for `task` and resolve with what that run produced.
   * Injected by the client so this module needs no ChatSdkClient import (avoids
   * an import cycle) and stays unit-testable. The runner publishes the worker's
   * live status (e.g. a rate-limit backoff) to the card, and owns stashing the
   * transcript, because it still holds the worker's history on the paths where
   * this tool throws (a Stop mid-worker above all).
   */
  runWorker: (options: RunWorkerOptions) => Promise<WorkerRunResult>;
  /** Mutable per-conversation spawn state; see SpawnState. */
  spawnState: SpawnState;
  /**
   * The session recorded for worker `index` so far, deep-copied and ready to
   * seed a resume; undefined when this conversation has no such worker.
   */
  getSession?: (index: number) => ChatMessage[] | undefined;
  /**
   * Fetch the worker's system-prompt briefing (skills, Live Set, context) for a
   * resolved worker config. Resolving null — or omitting this dep entirely —
   * leaves the worker to bootstrap itself with ppal-connect, which is the
   * pre-briefing behavior and the required fallback when the server or Live
   * can't be reached.
   */
  getBriefing?: (
    config: ChatClientConfig,
    abortSignal?: AbortSignal,
  ) => Promise<string | null>;
}

/** Mutable spawn bookkeeping shared by the tool and its owning client. */
export interface SpawnState {
  /**
   * Spawn attempts made in the CURRENT turn, refused ones included; enforces
   * MAX_SPAWNS. Reset at the top of every sendMessage, so the cap bounds a single
   * turn's fan-out rather than budgeting a whole conversation. Unlike `nextIndex`
   * it is deliberately NOT seeded from history — see MAX_SPAWNS for why per-turn
   * is the intended shape.
   */
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
      if (deps.spawnState.count >= MAX_SPAWNS) {
        throw new Error(
          `Subagent limit reached (${MAX_SPAWNS} per turn). Finish the ` +
            "remaining work directly, or say what is left for the next turn.",
        );
      }

      // Count the ATTEMPT, ahead of every check below that can reject it. A
      // model repeating a call this tool refuses would otherwise loop uncounted
      // until the orchestrator's whole step budget was gone.
      deps.spawnState.count++;

      const task = args.task;

      if (typeof task !== "string" || task.trim() === "") {
        throw new Error("spawn_subagent requires a non-empty 'task' string.");
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

      deps.spawnState.active.add(subagentIndex);

      try {
        const run = await deps.runWorker({
          resolveConfig: () => resolveWorkerConfig(deps, session, abortSignal),
          task,
          toolCallId,
          subagentIndex,
          abortSignal,
        });

        return labelWorkerResult(
          subagentIndex,
          extractWorkerResult(run.messages, run.toolLimitReached),
        );
      } finally {
        deps.spawnState.active.delete(subagentIndex);
      }
    },
  };
}

/**
 * The config a worker actually starts with: the cloned orchestrator config,
 * briefed if a briefing can be had.
 *
 * The order matters and is not interchangeable. The withheld tools are applied
 * FIRST because the briefing request reads its toolset off the config — asking
 * for a briefing before withholding ppal-context would ship the worker guidance
 * for a tool it won't have. They are only KEPT when a briefing came back: a
 * worker with neither a briefing nor ppal-connect knows nothing about the Live
 * Set it is about to edit, which is strictly worse than the round-trip this
 * whole path exists to avoid.
 *
 * @param deps - The tool's injected dependencies
 * @param session - Recorded session to continue; omit to start fresh
 * @param abortSignal - The turn's signal, so Stop cancels the briefing fetch
 * @returns The worker config to run
 */
async function resolveWorkerConfig(
  deps: SpawnSubagentDeps,
  session?: ChatMessage[],
  abortSignal?: AbortSignal,
): Promise<ChatClientConfig> {
  const inherited = buildWorkerConfig(deps.config, session);

  if (!deps.getBriefing) return inherited;

  const narrowed = withheldToolsApplied(inherited);
  const briefing = await deps.getBriefing(narrowed, abortSignal);

  return briefing == null ? inherited : withBriefing(narrowed, briefing);
}

/**
 * Clone the orchestrator config for a worker: fresh history, the worker step
 * budget, and spawn_subagent disabled. Disabling it is the recursion guard — the
 * worker's ToolSet omits the spawn tool (client.initialize only injects it when
 * enabled), so workers cannot spawn their own subagents.
 *
 * When the user picked a "Subagent preset", the orchestrator config
 * carries a resolved `subagentConfig` whose model/inference AND toolset (when
 * the preset saved one) are layered over the clone — so a strong planner can
 * drive uniform cheaper workers. A preset that carries a toolset supplies the
 * worker's tools as-is (its captured sparse map; it does NOT carry over the
 * orchestrator's explicit disables, so a tool the preset never captured stays at
 * its default-enabled state downstream — same as applying the preset in the
 * picker), except for the Direct Live API tool — see withInheritedLiveApi. A
 * preset without one (and the no-preset case) inherits the
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
 * This is the INHERITED config, not the final one: resolveWorkerConfig layers
 * the briefing and its withheld tools on top when a briefing is available.
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
      ...(subagentConfig?.enabledTools
        ? withInheritedLiveApi(subagentConfig.enabledTools, enabledTools)
        : enabledTools),
      [SPAWN_SUBAGENT_TOOL_NAME]: false,
    },
  };
}

/**
 * Carry the orchestrator's Direct Live API state into a preset's toolset.
 *
 * That tool is the one a preset can never speak for: its checkbox writes the
 * device-global flag instead of a map entry, so a captured toolset structurally
 * has no key for it, and absent reads as enabled everywhere downstream. Left
 * alone, a worker would follow the device flag while its orchestrator follows
 * the state pinned into the conversation — a chat locked before the flag was
 * switched on would spawn workers that can call it when it cannot. The
 * conversation's pin wins, so the worker matches the chat that spawned it.
 *
 * @param presetTools - The preset's captured toolset
 * @param inherited - The orchestrator's toolset (carrying the pinned state)
 * @returns The preset's toolset with the Live API entry filled in
 */
function withInheritedLiveApi(
  presetTools: Record<string, boolean>,
  inherited?: Record<string, boolean>,
): Record<string, boolean> {
  return {
    [LIVE_API_TOOL_ID]: isToolEnabled(inherited ?? {}, LIVE_API_TOOL_ID),
    ...presetTools,
  };
}

/**
 * The compact result handed back to the orchestrator model: the worker's last
 * assistant message. The full transcript is kept UI-side and never sent to the
 * model.
 *
 * Takes THIS run's messages only. Scanning a resumed worker's whole history
 * would walk back into the previous run and report its closing message as the
 * answer to the new task — success claimed for work that never happened.
 *
 * @param messages - What this run added to the worker's history (oldest first)
 * @param toolLimitReached - Whether the run stopped on its step budget
 * @returns The worker's final assistant text, or a fallback if it produced none
 */
export function extractWorkerResult(
  messages: ChatMessage[],
  toolLimitReached = false,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg?.role === "assistant" && !msg.isError && msg.content.trim()) {
      return msg.content.trim();
    }
  }

  return toolLimitReached
    ? "The subagent ran out of tool steps before reporting back. Resume it " +
        "(resumeFrom) to let it finish, or take the rest on yourself."
    : "The subagent finished without a final message.";
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
 * send. Anything else present but unusable throws rather than silently starting
 * a fresh worker — a resume that quietly becomes a new spawn would re-do work
 * and lose the context the caller was trying to reuse.
 *
 * `0` is the exception, and it is deliberate. Worker indices are 1-based, so 0
 * names no worker, but it is exactly what a model sends for an optional number
 * it means to leave empty — observed repeatedly from GPT-5.6, which kept sending
 * it after being told to omit the field. Treating it as "omitted" costs nothing
 * (there is no worker it could have meant) and turns a whole failed turn into a
 * normal spawn.
 * @param value - The raw argument value
 * @returns The worker index to resume, or undefined when not resuming
 */
function parseResumeFrom(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;

  const index = Number(value);

  if (index === 0) return undefined;

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
 *
 * The error names the numbers that WOULD work, because a model that guessed
 * wrong once has nothing to guess better from otherwise — and re-guessing burns
 * the turn's spawn budget a call at a time.
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
    const existing = existingSubagents(deps);

    throw new Error(
      `There is no subagent ${resumeFrom} in this conversation. ` +
        (existing.length > 0
          ? `Existing subagents: ${existing.join(", ")}. `
          : "It has no subagents yet. ") +
        "Omit resumeFrom to start a new subagent for this work.",
    );
  }

  return session;
}

/**
 * The worker numbers this conversation can actually resume. Indices are handed
 * out 1..nextIndex, but only those with a recorded transcript are resumable, so
 * each is probed rather than assumed. Error path only — one history walk per
 * index is fine there.
 * @param deps - The tool's injected dependencies
 * @returns Resumable worker indices, ascending
 */
function existingSubagents(deps: SpawnSubagentDeps): number[] {
  const indices: number[] = [];

  for (let i = 1; i <= deps.spawnState.nextIndex; i++) {
    if (deps.getSession?.(i)) indices.push(i);
  }

  return indices;
}
