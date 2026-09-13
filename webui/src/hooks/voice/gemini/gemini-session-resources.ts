// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Session } from "@google/genai";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type RealtimeItem } from "@openai/agents/realtime";
import { GEMINI_INPUT_MIME_TYPE } from "#webui/hooks/voice/gemini/gemini-client";
import { GeminiMicCapture } from "#webui/hooks/voice/gemini/gemini-mic-capture";
import { type GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import { type GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";

/**
 * Open the mic and stream its 16 kHz PCM chunks into the live session.
 * @param micRef - Ref the capture is stored on for teardown
 * @param sessionRef - Ref holding the session chunks are sent to
 * @param isMutedRef - The user's manual mute, applied before capture starts
 * @returns The started capture
 */
export async function startGeminiMic(
  micRef: { current: GeminiMicCapture | null },
  sessionRef: { current: Session | null },
  isMutedRef: { current: boolean },
): Promise<GeminiMicCapture> {
  const mic = new GeminiMicCapture();

  micRef.current = mic;
  mic.setMuted(isMutedRef.current);
  await mic.start({
    onChunk: (data) => {
      // Read the session per chunk so a resumed one keeps receiving audio
      // without restarting capture.
      try {
        sessionRef.current?.sendRealtimeInput({
          audio: { data, mimeType: GEMINI_INPUT_MIME_TYPE },
        });
      } catch {
        // a chunk racing teardown — drop it
      }
    },
  });

  return mic;
}

/** The refs a Gemini session teardown clears. */
export interface GeminiSessionRefs {
  sessionRef: { current: Session | null };
  mcpClientRef: { current: Client | null };
  micRef: { current: GeminiMicCapture | null };
  playerRef: { current: GeminiPcmPlayer | null };
  builderRef: { current: GeminiHistoryBuilder | null };
  connectingRef: { current: boolean };
  /** Bumped so a connect() suspended on an await bails when it resumes. */
  connectGenRef: { current: number };
}

/**
 * Release everything a live Gemini session holds: mic, player, session, and MCP
 * client. Clears the refs first so a concurrent caller can't double-close, then
 * closes.
 * @param refs - The hook's session-owned refs
 */
export async function releaseGeminiSessionResources(
  refs: GeminiSessionRefs,
): Promise<void> {
  const session = refs.sessionRef.current;
  const mcp = refs.mcpClientRef.current;
  const mic = refs.micRef.current;
  const player = refs.playerRef.current;

  refs.sessionRef.current = null;
  refs.mcpClientRef.current = null;
  refs.micRef.current = null;
  refs.playerRef.current = null;
  refs.builderRef.current = null;
  refs.connectingRef.current = false;
  // Invalidate any connect() suspended on an await so it bails on resume.
  refs.connectGenRef.current++;

  await mic?.stop();
  await player?.close();
  await closeSessionAndMcp(session, mcp);
}

/**
 * Best-effort teardown of the live session + MCP client. A close that throws
 * shouldn't stall the rest of cleanup (the refs are already nulled), so each is
 * swallowed individually.
 * @param session - The live session, or null
 * @param mcp - The MCP client, or null
 */
async function closeSessionAndMcp(
  session: Session | null,
  mcp: Client | null,
): Promise<void> {
  try {
    session?.close();
  } catch {
    // best-effort
  }

  try {
    await mcp?.close();
  } catch {
    // best-effort
  }
}

/**
 * Seed prior context onto a fresh Gemini session so a continued chat keeps the
 * model's memory. Gemini has no item-replay API, so the transcript goes as one
 * turnComplete:false text turn (context, no reply); only messages are carried.
 * @param session - The connected Live session
 * @param initialHistory - Saved history to seed, or undefined
 */
export function seedGeminiContext(
  session: Pick<Session, "sendClientContent">,
  initialHistory: RealtimeItem[] | undefined,
): void {
  if (!initialHistory || initialHistory.length === 0) {
    return;
  }

  const transcript = transcriptText(initialHistory);

  if (!transcript) {
    return;
  }

  session.sendClientContent({
    turns: [
      {
        role: "user",
        parts: [
          {
            text: `Here is the transcript of our conversation so far, for context. Do not respond to it; just continue from here.\n\n${transcript}`,
          },
        ],
      },
    ],
    turnComplete: false,
  });
}

/**
 * Flatten saved message items into a "Speaker: text" transcript for seeding.
 * @param items - Saved history items
 * @returns Newline-joined transcript, or empty string
 */
function transcriptText(items: RealtimeItem[]): string {
  const lines: string[] = [];

  for (const item of items) {
    if (item.type !== "message") {
      continue;
    }

    if (item.role === "system") {
      continue;
    }

    const text = item.content
      .map((c) =>
        "text" in c ? c.text : "transcript" in c ? (c.transcript ?? "") : "",
      )
      .filter(Boolean)
      .join(" ");

    if (text) {
      lines.push(`${item.role === "user" ? "User" : "You"}: ${text}`);
    }
  }

  return lines.join("\n");
}
