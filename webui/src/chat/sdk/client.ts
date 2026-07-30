// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type FinishReason, type ToolSet, stepCountIs, streamText } from "ai";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import { getMcpUrl } from "#webui/utils/mcp-url";
import {
  buildModelMessages,
  reconcileDanglingToolCalls,
} from "./build-model-messages";
import { summarizeHistory } from "./compaction";
import { createMcpTools } from "./mcp-tools";
import { handleStreamPart } from "./streaming/stream-part-handlers";
import { createStreamErrorSignal } from "./streaming/stream-with-error-signal";
import {
  type RunWorkerOptions,
  SPAWN_SUBAGENT_TOOL_NAME,
  createSpawnSubagentTool,
} from "./subagent/spawn-subagent-tool";
import { fetchSubagentBriefing } from "./subagent/subagent-briefing";
import {
  RateLimitGate,
  runSubagentWithRetry,
  setSubagentRateLimit,
} from "./subagent/subagent-rate-limit";
import {
  type SubagentTranscriptStash,
  attachStashedTranscripts,
  collectSubagentTranscript,
  highestSubagentIndex,
  isSpawnToolResult,
  recordedSubagentRuns,
} from "./subagent/subagent-session";
import { type ChatClientConfig, type ChatMessage, toTokenUsage } from "./types";

const MAX_TOOL_STEPS = 10;

/**
 * Orchestrator step budget when subagents are enabled. Widened off the default
 * because context-gathering steps and each SEQUENTIAL spawn share this budget (a
 * spawn costs one step; N parallel spawns in one turn cost just one). MAX_SPAWNS,
 * not this, is the real ceiling on total worker count.
 */
const MAX_ORCHESTRATOR_STEPS = 25;

/**
 * AI SDK client that wraps streamText for chat with MCP tool support.
 * Implements the ChatClient<ChatMessage> interface expected by useChat.
 */
export class ChatSdkClient {
  chatHistory: ChatMessage[];
  /**
   * True when the most recent stream stopped because it hit the tool-step
   * limit (the model still wanted to call tools). Reset on each sendMessage.
   */
  toolLimitReached = false;
  private tools: ToolSet = {};
  private config: ChatClientConfig;
  /**
   * This client's tool-step budget for streamText's stopWhen. Set in
   * initialize(): MAX_ORCHESTRATOR_STEPS when subagents are enabled, the config's
   * budget for a worker (MAX_WORKER_STEPS), else the shared MAX_TOOL_STEPS.
   */
  private maxSteps = MAX_TOOL_STEPS;
  /**
   * Per-conversation subagent bookkeeping, shared with the spawn tool: MAX_SPAWNS
   * caps total worker runs across the conversation, and the index allocator hands
   * each worker its durable number. Both `count` and `nextIndex` are seeded from
   * history in initialize(), so a restored conversation resumes its cap and its
   * numbering rather than colliding with — or being handed a fresh budget
   * alongside — its own persisted workers.
   */
  private spawnState = { count: 0, nextIndex: 0, active: new Set<number>() };
  /**
   * Worker transcripts recorded by runSubagent, keyed by tool-call id. Read in
   * processStream to attach each transcript to its tool-result (UI-only; the
   * model never sees it). A restored conversation reads the transcript straight
   * off the persisted tool-result, so this stays empty then.
   */
  private spawnTranscripts: SubagentTranscriptStash = new Map();
  /**
   * Backoff window shared by every worker this client spawns. Parallel workers
   * stream on separate connections, so without it a provider-wide 429 hits each
   * one independently; with it, the first worker to be rate-limited parks its
   * siblings for the same cooldown. Orchestrator turns keep using useChat's
   * executeWithRetry — no worker is in flight while that retry runs.
   */
  private rateLimitGate = new RateLimitGate();
  /**
   * The MCP client backing `tools`. Each tool's execute() closure calls
   * mcpClient.callTool(), so it must stay connected for this client's whole
   * lifetime and only close when the client is discarded — see dispose().
   */
  private mcpClient: Client | null = null;

  /**
   * @param _apiKey - API key (handled by the model instance in config)
   * @param config - Client configuration
   */
  constructor(_apiKey: string, config: ChatClientConfig) {
    this.config = config;
    this.chatHistory = config.chatHistory ?? [];
  }

  /**
   * Initialize MCP connection and convert tools to AI SDK format.
   */
  async initialize(): Promise<void> {
    const mcpUrl = this.config.mcpUrl ?? getMcpUrl();
    const { tools, mcpClient } = await createMcpTools(
      mcpUrl,
      this.config.enabledTools,
      this.config.smallModelMode,
      this.config.notation,
    );

    this.mcpClient = mcpClient;

    if (this.config.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME] === true) {
      // Orchestrator with subagents enabled: add the client-side spawn tool and
      // widen the step budget so sequential spawns and context-gathering steps
      // share enough headroom. A worker never reaches here — its cloned config
      // sets spawn_subagent false (the recursion guard).
      this.maxSteps = MAX_ORCHESTRATOR_STEPS;
      this.spawnState.nextIndex = highestSubagentIndex(this.chatHistory);
      this.spawnState.count = recordedSubagentRuns(this.chatHistory);
      this.tools = {
        ...tools,
        [SPAWN_SUBAGENT_TOOL_NAME]: createSpawnSubagentTool({
          config: this.config,
          runWorker: (options) => this.runSubagent(options),
          spawnState: this.spawnState,
          getSession: (index) =>
            collectSubagentTranscript(this.chatHistory, index),
          getBriefing: fetchSubagentBriefing,
        }),
      };
    } else {
      // Worker (config.maxSteps = MAX_WORKER_STEPS) or a subagents-off
      // orchestrator (undefined → shared default; behavior unchanged).
      this.maxSteps = this.config.maxSteps ?? MAX_TOOL_STEPS;
      this.tools = tools;
    }
  }

  /**
   * Run a nested subagent session to completion and return its final chat
   * history. The worker gets its OWN ChatSdkClient — own MCP client, own tools,
   * own abort — so aborting or disposing it never touches the orchestrator's
   * long-lived client. Injected into the spawn tool as runWorker.
   *
   * The run is wrapped in rate-limit backoff (runSubagentWithRetry) because
   * nothing above it retries: the worker streams below the tool boundary, out of
   * reach of useChat's executeWithRetry, so an unhandled 429 would come back as a
   * dead tool-error. Retries share this client's gate with the worker's siblings
   * and publish their backoff to the card.
   *
   * Each attempt is a fresh sendMessage, so it gets its own MAX_WORKER_STEPS
   * budget rather than resuming under the first attempt's — a worker that
   * rate-limits repeatedly can therefore run more total tool steps than one that
   * doesn't. Accepted: retries are rare, and carrying a partial budget forward
   * risks stranding a resumed worker mid-task with no steps left to finish.
   *
   * The transcript is stashed in a finally, so it survives the failure paths too
   * — above all a Stop mid-worker, where the partial log is the only record of
   * work the worker may already have done in the Live Set. Discarding it there
   * would lose that; attachStashedTranscripts hangs it off the synthetic
   * "canceled" tool-result instead. It is also what a later resume seeds from.
   *
   * A resume arrives as a workerConfig already carrying the session to continue.
   * Only what this run ADDS to it is stashed — the seeded prefix is already
   * persisted on the earlier run's tool-result, and re-storing it per resume
   * would duplicate the worker's whole history (its connect result included)
   * every time.
   * @param options - Worker config, instruction, tool-call id, index, and signal
   * @returns The worker's complete chat history, seeded prefix included
   */
  private async runSubagent(options: RunWorkerOptions): Promise<ChatMessage[]> {
    const { workerConfig, task, toolCallId, subagentIndex, abortSignal } =
      options;
    const worker = new ChatSdkClient("", workerConfig);
    // Where this run's own messages begin. Doubles as the floor the rate-limit
    // restart path truncates to, so a retry never eats the seeded session.
    const seedLength = workerConfig.chatHistory?.length ?? 0;

    await worker.initialize();

    try {
      await runSubagentWithRetry({
        task,
        runAttempt: async (message) => {
          // Drain the generator; we only need the accumulated final history.
          const stream = worker.sendMessage(message, abortSignal);
          let step = await stream.next();

          while (!step.done) step = await stream.next();
        },
        getHistory: () => worker.chatHistory,
        baselineLength: seedLength,
        gate: this.rateLimitGate,
        abortSignal,
        onStatus: (status) => setSubagentRateLimit(toolCallId, status),
      });

      return worker.chatHistory;
    } finally {
      this.spawnTranscripts.set(toolCallId, {
        index: subagentIndex,
        transcript: worker.chatHistory.slice(seedLength),
      });
      setSubagentRateLimit(toolCallId, null);
      worker.dispose();
    }
  }

  /**
   * Close the underlying MCP connection. Idempotent. useChat discards a client
   * on every new/restored/cleared conversation; without this each discard
   * leaks the client's open HTTP connection (the connection-test path closes
   * its client in a finally for the same reason). Fire-and-forget: close() can
   * reject if connect() never completed, which is harmless on teardown.
   */
  dispose(): void {
    const client = this.mcpClient;

    this.mcpClient = null;
    this.tools = {};
    void client?.close().catch(() => {});
  }

  /**
   * Summarize a slice of chat history into a single compaction summary,
   * using this conversation's model with no tools.
   * @param history - Messages to compact (oldest first)
   * @returns The compaction summary text
   */
  async summarize(history: ChatMessage[]): Promise<string> {
    return await summarizeHistory(this.config.model, history);
  }

  /**
   * Send a message and stream back the evolving chat history.
   * The AI SDK handles multi-step tool calling via stopWhen.
   * @param message - User message text
   * @param abortSignal - Signal to abort the stream
   * @param overrides - Per-message overrides for thinking
   * @param shouldInterrupt - Callback checked between tool steps; returns true to stop early
   * @yields Complete chat history after each stream update
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    overrides?: MessageOverrides,
    shouldInterrupt?: () => boolean,
  ): AsyncGenerator<ChatMessage[], void, unknown> {
    const userMsg: ChatMessage = { role: "user", content: message };

    this.toolLimitReached = false;
    stampOverrides(userMsg, overrides);
    this.chatHistory.push(userMsg);
    yield [...this.chatHistory];

    const providerOptions =
      overrides?.thinking != null && this.config.buildProviderOptions
        ? this.config.buildProviderOptions(overrides.thinking)
        : this.config.providerOptions;

    yield* this.processStream(providerOptions, abortSignal, shouldInterrupt);
    // Final yield to ensure last step's usage (attached by onStepEnd) is emitted
    yield [...this.chatHistory];
  }

  /**
   * Call streamText, process the stream, and yield chat history updates.
   * Wires the AI SDK's onError callback into the stream iterator so browser
   * CORS/network errors (which hang the stream) surface immediately.
   * @param providerOptions - Provider-specific options for streamText
   * @param abortSignal - Signal to abort the stream
   * @param shouldInterrupt - Callback checked between tool steps; returns true to stop early
   * @yields Updated chat history after each meaningful stream event
   */
  private async *processStream(
    providerOptions: Parameters<typeof streamText>[0]["providerOptions"],
    abortSignal?: AbortSignal,
    shouldInterrupt?: () => boolean,
  ): AsyncGenerator<ChatMessage[]> {
    let currentMsg: ChatMessage = { role: "assistant", content: "" };
    let addedCurrentMsg = false;

    const historyLengthBefore = this.chatHistory.length;
    let stepIndex = 0;

    const errorSignal = createStreamErrorSignal();

    const result = streamText({
      model: this.config.model,
      maxRetries: 0, // Disable SDK-level retry so app-level retry (executeWithRetry) handles 429s with UI feedback
      instructions: this.config.systemInstruction,
      messages: buildModelMessages(
        this.chatHistory,
        isAnthropicThinkingEnabled(providerOptions),
      ),
      tools: Object.keys(this.tools).length > 0 ? this.tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      providerOptions,
      abortSignal,
      onError: errorSignal.onError,
      onStepEnd: (event) => {
        let count = 0;

        for (let i = historyLengthBefore; i < this.chatHistory.length; i++) {
          const msg = this.chatHistory[i] as ChatMessage;

          if (msg.role === "assistant" && count++ === stepIndex) {
            msg.usage = toTokenUsage(event.usage);

            if (event.response.modelId) {
              msg.responseModel = event.response.modelId;
            }

            break;
          }
        }

        stepIndex++;
      },
    });

    const stream = errorSignal.wrapStream(result.stream);

    let completedSteps = 0;
    let finalFinishReason: FinishReason | undefined;

    try {
      for await (const part of stream) {
        const handled = handleStreamPart(part.type, part, currentMsg);

        if (handled) {
          if (!addedCurrentMsg) {
            this.chatHistory.push(currentMsg);
            addedCurrentMsg = true;
          }

          // A worker just finished: get its transcript onto the tool-result the
          // card renders from, before this yield paints it.
          if (isSpawnToolResult(part)) {
            attachStashedTranscripts(
              this.chatHistory,
              historyLengthBefore,
              this.spawnTranscripts,
            );
          }

          yield [...this.chatHistory];
        } else if (part.type === "start-step" && addedCurrentMsg) {
          // Between tool steps: check if a queued user message should interrupt
          if (shouldInterrupt?.()) return;
          // New step means new assistant turn (after tool results)
          currentMsg = { role: "assistant", content: "" };
          addedCurrentMsg = false;
        } else if (part.type === "finish-step") {
          completedSteps++;
        } else if (part.type === "finish") {
          finalFinishReason = (part as { finishReason?: FinishReason })
            .finishReason;
        }
      }
    } finally {
      // If the user pressed Stop mid-tool, the in-flight assistant message holds
      // a tool-call with no tool-result. Backfill a "canceled" result so the
      // history stays valid (providers reject an unmatched tool-call) and the UI
      // doesn't render the tool as perpetually running. No-op on clean finishes.
      reconcileDanglingToolCalls(this.chatHistory, historyLengthBefore);
      // A stopped subagent's tool-result is one of those synthetic "canceled"
      // entries, so it never passed through the mid-stream attach above. Hang the
      // worker's partial transcript off it here so its work log survives the Stop.
      attachStashedTranscripts(
        this.chatHistory,
        historyLengthBefore,
        this.spawnTranscripts,
      );
    }

    this.toolLimitReached = detectToolLimitReached(
      completedSteps,
      finalFinishReason,
      this.maxSteps,
    );
  }
}

/**
 * Decide whether a finished stream hit the multi-step tool-call limit.
 *
 * The AI SDK's `stopWhen: stepCountIs(maxSteps)` halts the agentic loop once
 * `maxSteps` steps complete. If the model still wanted to call tools at that
 * point, the final finishReason is `"tool-calls"` — that combination is the
 * genuine limit hit. A clean `"stop"`, a user abort (no `finish` part, so
 * finishReason is undefined), and errors all fail this check and must NOT show
 * the notice.
 * @param completedSteps - Number of completed steps (finish-step parts seen)
 * @param finishReason - Overall finishReason from the finish part, if any
 * @param maxSteps - The step budget this stream ran with (client's maxSteps)
 * @returns True only when the tool-step limit was reached mid-task
 */
export function detectToolLimitReached(
  completedSteps: number,
  finishReason: FinishReason | undefined,
  maxSteps: number = MAX_TOOL_STEPS,
): boolean {
  return completedSteps >= maxSteps && finishReason === "tool-calls";
}

/**
 * Whether the request's provider options enable Anthropic thinking. Only then is
 * it valid to re-send signed reasoning blocks (the API rejects reasoning content
 * when thinking is disabled), and only then does re-sending help caching.
 *
 * Note: this keys off the `anthropic` provider namespace, so it is intentionally
 * false on the OpenRouter→Claude path (those options live under the `openrouter`
 * namespace). Reasoning re-emission therefore does not run for OpenRouter; its
 * cache prefix is stabilized separately by transformOpenRouterRequest. This is an
 * intended asymmetry, not a missed case — don't "fix" it by widening the check.
 * @param providerOptions - Provider options passed to streamText
 * @returns True when Anthropic thinking is enabled for this request
 */
function isAnthropicThinkingEnabled(
  providerOptions: Parameters<typeof streamText>[0]["providerOptions"],
): boolean {
  const anthropic = providerOptions?.anthropic as
    { thinking?: unknown } | undefined;

  return anthropic?.thinking != null;
}

/**
 * Stamp per-message setting overrides onto a user message.
 * Only sets fields that are present in the overrides.
 * @param msg - User message to stamp
 * @param overrides - Per-message overrides (undefined = no overrides)
 */
function stampOverrides(msg: ChatMessage, overrides?: MessageOverrides): void {
  if (!overrides) return;

  if (overrides.thinking != null) msg.thinkingOverride = overrides.thinking;
}
