// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { type LanguageModel, type LanguageModelUsage } from "ai";

/**
 * The `Notation` union, inlined rather than imported from #src/shared/notation.
 * This module is compiled by BOTH the webui project (bundler resolution, which
 * rejects `.ts` in import paths) and the evals project (NodeNext, which requires
 * them) — evals imports TokenUsage from here — so no single spelling of that
 * import satisfies both. Same reason src/types/max-globals.d.ts inlines it.
 * types.test.ts asserts this stays identical to the real union.
 */
type Notation = "barbeat" | "midi-json" | "stark";

/**
 * Intermediate message type for the AI SDK client.
 * We use this instead of the SDK's ModelMessage because ModelMessage uses
 * union content types (string | Array<Part>) that are awkward to incrementally
 * build during streaming and to format for the UI. This flat structure is
 * simpler for both the stream processor and the UIMessage formatter.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** True for error messages persisted in history (not sent to LLM) */
  isError?: boolean;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    isError?: boolean;

    /**
     * For a spawn_subagent result: the worker's chat history, kept for the UI
     * deep-dive. Persisted with the conversation but NEVER sent to the model
     * (buildModelMessages reads only `result`), so the orchestrator context can't
     * blow up. Absent for ordinary tool results.
     *
     * A resumed run stores only what it ADDED to the session it continued — the
     * seeded prefix already lives on the earlier run's entry, so each card shows
     * just its own work and a repeatedly-resumed worker doesn't re-persist its
     * whole history every time. collectSubagentTranscript stitches the entries
     * back into one session when seeding the next resume.
     */
    subagentTranscript?: ChatMessage[];

    /**
     * For a spawn_subagent result: which subagent produced it, 1-based. Doubles
     * as the worker's durable identity — resuming keeps the index, so every run
     * of one worker shares it, and `resumeFrom` addresses a worker by this
     * number. Absent for ordinary tool results and for spawns from before
     * subagents were resumable.
     */
    subagentIndex?: number;
  }>;

  reasoning?: string;
  /**
   * Structured reasoning blocks with provider signatures, captured from the
   * stream so they can be re-emitted verbatim on later turns. Re-sending the
   * signed thinking blocks keeps the Anthropic request prefix byte-stable across
   * turns, so the conversation history (incl. the ppal-connect skills result)
   * stays prompt-cached when adaptive thinking is on. `reasoning` holds the same
   * text flattened for display.
   */
  reasoningParts?: Array<{
    text: string;
    signature?: string;
    redactedData?: string;
  }>;
  /** Model ID from the API response (assistant messages only) */
  responseModel?: string;
  /** Token usage from the API response (assistant messages only) */
  usage?: TokenUsage;
  /** Per-message setting override (only present when user overrode the conversation default) */
  thinkingOverride?: string;
  /** True for a synthetic compaction summary that replaces older turns */
  isCompactionSummary?: boolean;
}

/** Token usage summary extracted from LanguageModelUsage */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  /** Cached input tokens read from a prompt cache (Anthropic + auto-caching providers) */
  cacheReadTokens?: number;
  /** Input tokens written to a prompt cache this request */
  cacheWriteTokens?: number;
}

/**
 * Convert AI SDK LanguageModelUsage to our TokenUsage type.
 * @param sdkUsage - Usage data from the AI SDK
 * @returns Token usage summary
 */
export function toTokenUsage(sdkUsage: LanguageModelUsage): TokenUsage {
  const reasoning = sdkUsage.outputTokenDetails.reasoningTokens;
  const cacheRead = sdkUsage.inputTokenDetails.cacheReadTokens;
  const cacheWrite = sdkUsage.inputTokenDetails.cacheWriteTokens;

  return {
    inputTokens: sdkUsage.inputTokens ?? undefined,
    outputTokens: sdkUsage.outputTokens ?? undefined,
    ...(reasoning != null && reasoning > 0 && { reasoningTokens: reasoning }),
    ...(cacheRead != null && cacheRead > 0 && { cacheReadTokens: cacheRead }),
    ...(cacheWrite != null &&
      cacheWrite > 0 && { cacheWriteTokens: cacheWrite }),
  };
}

/**
 * Config a subagent worker runs under, resolved from the user's chosen "Default
 * subagent" preset. Carries the fields a preset can swap: provider/model baked
 * into `model`, thinking into `providerOptions`/`buildProviderOptions`,
 * `smallModelMode`, and `enabledTools` (the preset's toolset, when it saved one;
 * absent means the worker inherits the orchestrator's tools). The system
 * instruction is deliberately NOT here, so a worker always inherits it
 * (buildWorkerConfig). Absent on the orchestrator config = "inherit current
 * settings", the shipped phase-1 behavior.
 */
export interface SubagentConfigOverride {
  model: LanguageModel;
  smallModelMode: boolean;
  providerOptions?: ProviderOptions;
  buildProviderOptions?: (thinking: string) => ProviderOptions | undefined;
  /** The preset's captured toolset, used as-is (a sparse map — an absent key
   * means that tool keeps its default-enabled state downstream, same as applying
   * the preset in the picker; it does NOT carry over the orchestrator's explicit
   * disables). Absent = inherit the orchestrator's tools. buildWorkerConfig
   * always re-strips spawn_subagent over this map. */
  enabledTools?: Record<string, boolean>;
  /**
   * The notation this worker runs under — e.g. a stark worker doing drum work
   * for a bar|beat orchestrator. Reaches the worker through buildWorkerConfig's
   * `...subagentConfig` spread. Absent = inherit (the orchestrator's own value,
   * or the global when it has none). A stark worker should generate fresh
   * content or edit via `transforms`, not read-modify-write `notes`: stark
   * carries no probability, so a round trip through it drops any the
   * orchestrator authored.
   */
  notation?: Notation;
}

/** Configuration for the AI SDK client */
export interface ChatClientConfig {
  model: LanguageModel;
  systemInstruction?: string;
  mcpUrl?: string;
  enabledTools?: Record<string, boolean>;
  /**
   * Small-model mode for THIS client's MCP requests, sent as a per-request
   * header so the server shrinks tool schemas and serves the basic skills
   * variant for this caller alone. A subagent worker inherits it from the
   * orchestrator config unless a chosen "Default subagent" preset overrides it
   * (buildWorkerConfig applies subagentConfig), so a small-model worker gets the
   * reduced context even while the orchestrator runs full-strength.
   */
  smallModelMode?: boolean;
  /**
   * Notation for THIS client's MCP requests, sent as a per-request header. It
   * picks both the notation the skills teach and the one the server parses and
   * formats clip notes in, so the two can never disagree. Absent = the device's
   * global notation setting, which is what the main chat uses; a worker gets its
   * own only when a subagent preset supplies one (buildWorkerConfig).
   */
  notation?: Notation;
  providerOptions?: ProviderOptions;
  /** Recompute provider options for a given thinking level (used for mid-conversation overrides) */
  buildProviderOptions?: (thinking: string) => ProviderOptions | undefined;
  chatHistory?: ChatMessage[];
  /**
   * Tool-step budget for streamText's stopWhen. Defaults to the shared
   * MAX_TOOL_STEPS in client.ts. A subagent worker sets MAX_WORKER_STEPS; an
   * orchestrator with subagents enabled widens to MAX_ORCHESTRATOR_STEPS.
   */
  maxSteps?: number;
  /**
   * Preset-derived config a spawned worker runs under (model/inference + the
   * preset's toolset when it saved one). Set on the orchestrator config when the
   * user picked a "Default subagent" preset; read only by buildWorkerConfig,
   * which layers it over the cloned orchestrator config. Absent = the worker
   * inherits the orchestrator's config. This tracks the CURRENT global
   * preference — it is deliberately not locked per conversation, so continuing a
   * restored conversation spawns workers under whatever preset is selected now.
   */
  subagentConfig?: SubagentConfigOverride;
}
