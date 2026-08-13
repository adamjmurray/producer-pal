// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LiveServerMessage, type Session } from "@google/genai";
import { vi } from "vitest";
import { type MutableMic } from "#webui/hooks/voice/gemini/gemini-half-duplex-helpers";
import { type GeminiMessageDeps } from "#webui/hooks/voice/gemini/gemini-message-handler";
import { type GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import { GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";

/**
 * Build message-handler deps with spy-able fakes (a real history builder, a
 * fake player + mic, and an injectable session/tool dispatcher) for both
 * handleGeminiMessage and openResumableGeminiSession tests.
 *
 * @param overrides - Partial deps to override
 * @returns The deps plus the fakes for assertions
 */
export function makeMessageDeps(overrides: Partial<GeminiMessageDeps> = {}) {
  const hasQueued = vi.fn(() => false);
  // Mirror the real player's drain semantics: onDrained runs now when nothing
  // is queued, otherwise it waits for drain() — and flush() DROPS it unrun,
  // since the audio it was waiting on was discarded rather than played.
  let pendingDrain: (() => void) | null = null;

  const drain = (): void => {
    const callback = pendingDrain;

    pendingDrain = null;
    callback?.();
  };

  const player = {
    flush: vi.fn(() => {
      pendingDrain = null;
    }),
    enqueueBase64: vi.fn(),
    hasQueued,
    onDrained: vi.fn((callback: () => void) => {
      if (hasQueued()) pendingDrain = callback;
      else callback();
    }),
    hasPendingDrain: vi.fn(() => pendingDrain != null),
  } as unknown as GeminiPcmPlayer;
  const sendToolResponse = vi.fn();
  const session = { sendToolResponse } as unknown as Session;
  const setMuted = vi.fn<(muted: boolean) => void>();
  const mic: MutableMic & { setMuted: typeof setMuted } = { setMuted };
  const deps: GeminiMessageDeps = {
    builder: new GeminiHistoryBuilder(),
    player,
    getSession: () => session,
    executeTool: vi.fn(async () => "tool-output"),
    publishHistory: vi.fn(),
    setAssistantSpeaking: vi.fn(),
    setAssistantThinking: vi.fn(),
    setError: vi.fn(),
    setResumeHandle: vi.fn(),
    halfDuplex: false,
    getMic: () => mic,
    autoMutedRef: { current: false },
    isMutedRef: { current: false },
    ...overrides,
  };

  return { deps, drain, player, sendToolResponse, session, mic };
}

/**
 * Cast a partial message literal to LiveServerMessage (a class with text/data
 * getters that plain object literals can't satisfy structurally).
 *
 * @param partial - The message fields under test
 * @returns The same value typed as LiveServerMessage
 */
export function msg(partial: Partial<LiveServerMessage>): LiveServerMessage {
  return partial as LiveServerMessage;
}
