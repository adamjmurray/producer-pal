// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation } from "#src/shared/notation";
import {
  resolveLockedNotation,
  resolveLockedSmallModelMode,
  resolveLockedSystemInstruction,
  resolveMaxToolSteps,
} from "#webui/hooks/chat/helpers/streaming/locked-settings";
import {
  type ChatClient,
  type MessageOverrides,
} from "#webui/hooks/chat/use-chat-types";
import { type Provider } from "#webui/types/settings";

/**
 * Connect a freshly built client, publishing the in-flight connect so a turn
 * that adopts the client can await it rather than stream on a client whose MCP
 * connection hasn't landed. The connecting turn owns the ref: it clears the
 * promise once it settles, unless a newer init already replaced it.
 * @param client - The client to connect
 * @param pendingInitRef - Where to publish the in-flight connect
 * @param pendingInitRef.current - The published promise, or null when idle
 */
export async function connectClient<TMessage>(
  client: ChatClient<TMessage>,
  pendingInitRef: { current: Promise<void> | null },
): Promise<void> {
  const connecting = client.initialize();

  pendingInitRef.current = connecting;

  try {
    await connecting;
  } finally {
    if (pendingInitRef.current === connecting) {
      pendingInitRef.current = null;
    }
  }
}

/**
 * Validates MCP connection status and throws if there's an error.
 * Auto-retries connection if it failed.
 * @param {"connected" | "connecting" | "error"} mcpStatus - MCP connection status
 * @param {string | null} mcpError - MCP error message if any
 * @param {() => Promise<void>} checkMcpConnection - Callback to retry connection
 * @returns {any} - Hook return value
 */
export async function validateMcpConnection(
  mcpStatus: "connected" | "connecting" | "error",
  mcpError: string | null,
  checkMcpConnection: () => Promise<void>,
): Promise<void> {
  if (mcpStatus === "error") {
    await checkMcpConnection();
    throw new Error(`MCP connection failed: ${mcpError}`);
  }
}

interface ConversationDefaults {
  thinking: string | null;
}

/**
 * Filter per-message overrides to only include fields that differ from
 * conversation defaults. Returns undefined if no fields differ.
 * @param overrides - Raw overrides from the UI (always populated)
 * @param defaults - Conversation-locked defaults
 * @returns Filtered overrides, or undefined if nothing differs
 */
export function filterOverrides(
  overrides: MessageOverrides | undefined,
  defaults: ConversationDefaults,
): MessageOverrides | undefined {
  if (!overrides) {
    return undefined;
  }

  if (overrides.thinking != null && overrides.thinking !== defaults.thinking) {
    return { thinking: overrides.thinking };
  }

  return undefined;
}

/** Effective connection used to (re)build a chat client at init time. */
export interface InitConnection {
  provider: Provider;
  model: string;
  apiKey: string;
  extraParams: Record<string, unknown>;
  /** The resolved system instruction to lock and send for this init. */
  systemInstruction: string;
  /**
   * The notation to lock and send for this init, or null when the caller has no
   * notation of its own (voice mode, tests) and the request should fall through
   * to the device global.
   */
  notation: Notation | null;
  /** The small-model mode to lock and send for this init. */
  smallModelMode: boolean;
  /** The toolset to lock and connect with for this init. */
  enabledTools: Record<string, boolean>;
  /** The per-turn tool-step budget to lock for this init. */
  maxToolSteps: number;
}

/**
 * Resolve the provider/model/connection to (re)build a client with.
 *
 * Honors the conversation's locked provider+model when continuing a restored
 * conversation (locked values are non-null), falling back to current settings
 * for a brand-new conversation. The key + base URL always come from the user's
 * *current* settings for the effective provider — no API key is ever persisted
 * with the conversation.
 *
 * A restored conversation also carries its locked system instruction through as
 * `lockedSystemInstruction`, so the adapter sends what the conversation started
 * with rather than the current global override. Null (brand-new conversation)
 * lets the adapter fall back to resolving the current override. Its locked
 * notation and small-model mode ride along the same way, as `lockedNotation` and
 * `lockedSmallModelMode`.
 *
 * The toolset resolves the same way but NOT through `extraParams` — no adapter
 * reads it; it is passed to the client builder directly.
 *
 * @param locked - Conversation's locked provider/model/system-instruction/notation/small-model mode/toolset (null fields if unset)
 * @param locked.activeProvider - Locked provider, or null when not locked
 * @param locked.activeModel - Locked model, or null when not locked
 * @param locked.activeSystemInstruction - Locked system instruction, or null when not locked
 * @param locked.activeNotation - Locked notation, or null when not locked
 * @param locked.activeSmallModelMode - Locked small-model mode, or null when not locked
 * @param locked.activeEnabledTools - Locked toolset, or null when not locked
 * @param fallback - Current-settings provider/model/toolset (used when not locked)
 * @param fallback.provider - Current-settings provider
 * @param fallback.model - Current-settings model
 * @param fallback.enabledTools - Current-settings toolset
 * @param resolveConnection - Resolves a provider's current key + base URL
 * @param extraParams - Base extra params to merge the connection into
 * @returns Effective provider, model, key, toolset, and merged extra params
 */
export function resolveInitConnection(
  locked: {
    activeProvider: Provider | null;
    activeModel: string | null;
    activeSystemInstruction: string | null;
    activeNotation: Notation | null;
    activeSmallModelMode: boolean | null;
    activeEnabledTools: Record<string, boolean> | null;
  },
  fallback: {
    provider: Provider;
    model: string;
    enabledTools: Record<string, boolean>;
  },
  resolveConnection: (provider: Provider) => {
    apiKey: string;
    baseUrl?: string;
  },
  extraParams?: Record<string, unknown>,
): InitConnection {
  const provider = locked.activeProvider ?? fallback.provider;
  const model = locked.activeModel ?? fallback.model;
  const { apiKey, baseUrl } = resolveConnection(provider);
  const mergedExtraParams = {
    ...extraParams,
    provider,
    apiKey,
    baseUrl,
    lockedSystemInstruction: locked.activeSystemInstruction,
    lockedNotation: locked.activeNotation,
    lockedSmallModelMode: locked.activeSmallModelMode,
  };

  return {
    provider,
    model,
    apiKey,
    extraParams: mergedExtraParams,
    systemInstruction: resolveLockedSystemInstruction(mergedExtraParams),
    notation: resolveLockedNotation(mergedExtraParams),
    smallModelMode: resolveLockedSmallModelMode(mergedExtraParams),
    enabledTools: locked.activeEnabledTools ?? fallback.enabledTools,
    maxToolSteps: resolveMaxToolSteps(mergedExtraParams),
  };
}
