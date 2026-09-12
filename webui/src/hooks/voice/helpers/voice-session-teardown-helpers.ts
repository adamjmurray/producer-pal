// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type RealtimeSession } from "@openai/agents/realtime";
import { teardownAudioElement } from "#webui/hooks/voice/helpers/voice-audio-element-helpers";
import {
  teardownVoiceAudioGraph,
  type VoiceAudioGraph,
} from "#webui/hooks/voice/voice-audio-graph";

/** The session-owned refs a teardown clears. */
export interface VoiceSessionRefs {
  sessionRef: { current: RealtimeSession | null };
  mcpClientRef: { current: Client | null };
  connectingRef: { current: boolean };
  /** Bumped so a connect() suspended on an await bails when it resumes. */
  connectGenRef: { current: number };
  audioGraphRef: { current: VoiceAudioGraph | null };
  audioElementRef: { current: HTMLAudioElement | null };
  /** True between response.created and response.done. */
  activeResponseRef: { current: boolean };
}

/**
 * Release everything a live voice session holds: the audio graph and element,
 * the session itself, and the MCP client. Clears the refs first so a concurrent
 * caller can't double-close, then closes. Extracted from useVoiceSession to keep
 * the hook within its line budget.
 *
 * @param refs - The hook's session-owned refs
 */
export async function releaseVoiceSessionResources(
  refs: VoiceSessionRefs,
): Promise<void> {
  // Capture and null refs synchronously so any subsequent await can't race a
  // concurrent caller into double-closing.
  const session = refs.sessionRef.current;
  const mcpClient = refs.mcpClientRef.current;

  refs.sessionRef.current = null;
  refs.mcpClientRef.current = null;
  refs.connectingRef.current = false;
  // Tear the Web Audio graph down before the element so no AudioContext or
  // audio routing lingers after Stop / a reconnect.
  teardownVoiceAudioGraph(refs.audioGraphRef.current);
  refs.audioGraphRef.current = null;
  teardownAudioElement(refs.audioElementRef.current);
  refs.audioElementRef.current = null;
  // Invalidate any connect() still suspended on an await: when it resumes it
  // will see a changed generation and abort.
  refs.connectGenRef.current++;

  if (session) {
    closeRealtimeSession(session, refs.activeResponseRef.current);
  }

  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // swallow
    }
  }
}

/**
 * Tear a realtime session down: cancel a still-running response first (so the
 * server isn't left holding/billing an orphaned response and a stop→restart
 * can't race a lingering one), then close. Both steps are best-effort — a throw
 * from either must not abort teardown.
 *
 * @param session - The session to close
 * @param cancelInFlight - Whether a response is active and should be cancelled
 *   (via interrupt) before closing
 */
function closeRealtimeSession(
  session: RealtimeSession,
  cancelInFlight: boolean,
): void {
  if (cancelInFlight) {
    try {
      session.interrupt();
    } catch {
      // swallow — best-effort cancel
    }
  }

  try {
    session.close();
  } catch {
    // swallow — best-effort teardown
  }
}
