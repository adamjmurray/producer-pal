// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MutableRef, useCallback, useRef } from "preact/hooks";
import {
  connectClient,
  resolveInitConnection,
  validateMcpConnection,
} from "#webui/hooks/chat/helpers/streaming-helpers";
import {
  type LockedSettingsInput,
  type UseActiveSettingsReturn,
} from "#webui/hooks/chat/helpers/use-active-settings";
import {
  type ChatAdapter,
  type ChatClient,
  type MessageOverrides,
} from "#webui/hooks/chat/use-chat-types";
import { type Provider } from "#webui/types/settings";

/** What {@link useInitializeChat} needs from the parent chat hook. */
export interface UseInitializeChatDeps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  provider: Provider;
  model: string;
  thinking: string;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  resolveConnection: (provider: Provider) => {
    apiKey: string;
    baseUrl?: string;
  };
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  extraParams?: Record<string, unknown>;
  /** The conversation's locked settings (read for resolution, written on lock). */
  active: UseActiveSettingsReturn;
  clientRef: MutableRef<TClient | null>;
  pendingInitRef: MutableRef<Promise<void> | null>;
}

/** What {@link useInitializeChat} hands back to the parent chat hook. */
export interface UseInitializeChatReturn<TMessage> {
  /**
   * Build a client, connect it, and lock what it connected with. `stillLive`
   * is checked at both await points; a caller that is no longer live bails
   * without disposing or locking. Every caller passes one — a turn's tracks the
   * turn, the compaction bootstrap's tracks the conversation.
   */
  initializeChat: (
    chatHistory?: TMessage[],
    overrides?: MessageOverrides,
    stillLive?: () => boolean,
  ) => Promise<void>;
  /** Apply the lock published for the current client, if one is still waiting. */
  applyPendingLock: () => void;
  /** Drop the published lock — the client it describes is gone. */
  clearPendingLock: () => void;
}

/**
 * Owns client (re)initialization and the settings lock that goes with it.
 *
 * The lock describes the CLIENT, not the turn that built it, which is why it is
 * published rather than applied directly. Turns overlap: a turn stopped
 * mid-connect gets superseded by one that adopts its half-built client and never
 * runs an init of its own. If the connecting turn applied its own lock on the
 * way out it would overwrite the live turn's with a snapshot of a turn that
 * never streamed; if it dropped the lock instead, the adopting turn — which has
 * none of its own — would stream with nothing locked, and the next init would
 * fall back to current settings (the "restored conversation silently switches
 * model" bug the locking exists to prevent). So it publishes, and whichever turn
 * streams applies it.
 *
 * Publishing happens BEFORE the connect, not after: the adopting turn wakes from
 * the same connect promise the connecting turn does, so a lock published
 * afterward can lose that race and leave the adopter with nothing to apply.
 *
 * @param deps - Settings, adapter, and the client refs shared with the chat hook
 * @returns initializeChat plus the pending-lock controls
 */
export function useInitializeChat<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(
  deps: UseInitializeChatDeps<TClient, TMessage, TConfig>,
): UseInitializeChatReturn<TMessage> {
  const { provider, model, thinking, enabledTools, adapter, extraParams } =
    deps;
  const { mcpStatus, mcpError, checkMcpConnection, resolveConnection } = deps;
  const { active, clientRef, pendingInitRef } = deps;
  const { lockSettings } = active;
  const pendingLockRef = useRef<LockedSettingsInput | null>(null);

  const applyPendingLock = useCallback(() => {
    const pending = pendingLockRef.current;

    if (!pending) return;

    pendingLockRef.current = null;
    lockSettings(pending);
  }, [lockSettings]);

  const clearPendingLock = useCallback(() => {
    pendingLockRef.current = null;
  }, []);

  const initializeChat = useCallback(
    async (
      chatHistory?: TMessage[],
      overrides?: MessageOverrides,
      stillLive?: () => boolean,
    ) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);

      const effectiveThinking = overrides?.thinking ?? thinking;
      // Continue a restored conversation on its locked provider+model (see
      // resolveInitConnection); brand-new conversations fall back to current
      // settings. Rebuilding from current settings here is what previously
      // switched restored conversations to the selected model on the next send.
      const init = resolveInitConnection(
        active,
        { provider, model, enabledTools },
        resolveConnection,
        extraParams,
      );

      const config = adapter.buildConfig(
        init.model,
        effectiveThinking,
        init.enabledTools,
        chatHistory,
        init.extraParams,
      );

      // The connection check can take real network round-trips, and Stop
      // re-enables the composer while this turn is still in it — so by now the
      // user may have stopped, switched conversations, or re-sent, and a newer
      // turn may already be streaming on the client below. Disposing it would
      // close that stream's MCP connection mid-flight, so a turn that is no
      // longer live bails instead.
      if (stillLive && !stillLive()) return;

      // Dispose any prior client before replacing it — initializeChat is the
      // fork/retry re-init path, so a live client (with an open MCP connection)
      // can already be here.
      clientRef.current?.dispose?.();
      clientRef.current = adapter.createClient(init.apiKey, config);
      pendingLockRef.current = {
        model: init.model,
        provider: init.provider,
        thinking: effectiveThinking,
        smallModelMode: init.smallModelMode,
        systemInstruction: init.systemInstruction,
        notation: init.notation,
        // Pinned like the rest: a restored conversation reconnects with the
        // toolset it ran with, so the model never loses a tool it has already
        // used (or gains one its transcript never mentions).
        enabledTools: init.enabledTools,
        maxToolSteps: init.maxToolSteps,
      };
      await connectClient(clientRef.current, pendingInitRef);

      // Stopped or superseded while connecting: applying the lock now would
      // overwrite the live turn's with a snapshot of a turn that never streamed.
      // Leave it published instead — whoever streams on this client applies it.
      if (stillLive && !stillLive()) return;

      applyPendingLock();
    },
    [
      mcpStatus,
      mcpError,
      checkMcpConnection,
      model,
      provider,
      thinking,
      enabledTools,
      resolveConnection,
      active,
      adapter,
      extraParams,
      clientRef,
      pendingInitRef,
      applyPendingLock,
    ],
  );

  return { initializeChat, applyPendingLock, clearPendingLock };
}
