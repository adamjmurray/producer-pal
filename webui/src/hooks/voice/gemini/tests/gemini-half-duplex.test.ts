// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  beginGeminiHalfDuplexMute,
  endGeminiHalfDuplexMute,
} from "#webui/hooks/voice/gemini/gemini-half-duplex-helpers";
import { handleGeminiMessage } from "#webui/hooks/voice/gemini/gemini-message-handler";
import {
  makeMessageDeps,
  msg,
} from "#webui/hooks/voice/gemini/tests/gemini-message-handler-test-helpers";

/**
 * Build a modelTurn message carrying one inlineData audio part.
 * @param data - The base64 audio payload
 * @returns A LiveServerMessage with one audio chunk
 */
const audioChunk = (data: string) =>
  msg({ serverContent: { modelTurn: { parts: [{ inlineData: { data } }] } } });

/** A turnComplete server-content message. */
const turnDone = msg({ serverContent: { turnComplete: true } });

/** An interrupted server-content message. */
const interrupted = msg({ serverContent: { interrupted: true } });

/**
 * Half-duplex deps that have played one audio chunk and still hold queued
 * audio — where every auto-mute hold/lift case starts.
 * @returns Everything makeMessageDeps returns, after the first chunk
 */
async function startHeldTurn(): Promise<ReturnType<typeof makeMessageDeps>> {
  const parts = makeMessageDeps({ halfDuplex: true });

  vi.mocked(parts.player.hasQueued).mockReturnValue(true);
  await handleGeminiMessage(audioChunk("A"), parts.deps);

  return parts;
}

describe("handleGeminiMessage half-duplex behavior", () => {
  it("auto-mutes the mic on first audio chunk when half-duplex is on", async () => {
    const { deps, mic } = makeMessageDeps({ halfDuplex: true });

    await handleGeminiMessage(audioChunk("A"), deps);

    expect(mic.setMuted).toHaveBeenCalledTimes(1);
    expect(mic.setMuted).toHaveBeenCalledWith(true);
    expect(deps.autoMutedRef.current).toBe(true);
  });

  it("does not auto-mute additional chunks within the same turn", async () => {
    const { deps, mic } = makeMessageDeps({ halfDuplex: true });

    await handleGeminiMessage(
      msg({
        serverContent: {
          modelTurn: {
            parts: [
              { inlineData: { data: "A" } },
              { inlineData: { data: "B" } },
            ],
          },
        },
      }),
      deps,
    );

    expect(mic.setMuted).toHaveBeenCalledTimes(1);
  });

  it("leaves the mic alone when half-duplex is off", async () => {
    const { deps, mic } = makeMessageDeps({ halfDuplex: false });

    await handleGeminiMessage(audioChunk("A"), deps);
    await handleGeminiMessage(turnDone, deps);

    expect(mic.setMuted).not.toHaveBeenCalled();
    expect(deps.autoMutedRef.current).toBe(false);
  });

  it("restores the user's manual mute state on turnComplete", async () => {
    const { deps, mic } = makeMessageDeps({ halfDuplex: true });

    // User had manually muted before the turn started.
    deps.isMutedRef.current = true;

    await handleGeminiMessage(audioChunk("A"), deps);
    await handleGeminiMessage(turnDone, deps);

    expect(mic.setMuted).toHaveBeenNthCalledWith(1, true);
    // Restored to the user's manual mute state, not naively false.
    expect(mic.setMuted).toHaveBeenNthCalledWith(2, true);
    expect(deps.autoMutedRef.current).toBe(false);
  });

  it("defers the auto-mute lift on interruption while audio is still queued", async () => {
    const { deps, mic, player } = makeMessageDeps({ halfDuplex: true });

    // Mid-stream interrupt (legal under NO_INTERRUPTION): audio is still queued,
    // so lifting now would flicker the Muted indicator before the next chunk.
    vi.mocked(player.hasQueued).mockReturnValue(true);

    await handleGeminiMessage(audioChunk("A"), deps);
    await handleGeminiMessage(interrupted, deps);

    // Only the initial auto-mute fired; the interrupt did not unmute.
    expect(mic.setMuted).toHaveBeenCalledTimes(1);
    expect(mic.setMuted).toHaveBeenCalledWith(true);
    expect(deps.autoMutedRef.current).toBe(true);

    // The interrupt's flush emptied the queue, so the real turn end lifts it.
    vi.mocked(player.hasQueued).mockReturnValue(false);
    await handleGeminiMessage(turnDone, deps);
    expect(mic.setMuted).toHaveBeenNthCalledWith(2, false);
    expect(deps.autoMutedRef.current).toBe(false);
  });

  // turnComplete only means the server stopped sending — the tail of the turn
  // is still scheduled locally, and that's when a user talks over the assistant.
  it("holds the auto-mute past turnComplete until the queue drains", async () => {
    const { deps, drain, mic } = await startHeldTurn();

    await handleGeminiMessage(turnDone, deps);

    expect(mic.setMuted).toHaveBeenCalledTimes(1);
    expect(deps.autoMutedRef.current).toBe(true);

    drain();

    expect(mic.setMuted).toHaveBeenNthCalledWith(2, false);
    expect(deps.autoMutedRef.current).toBe(false);
  });

  it("keeps the speaking indicator up as long as the mic is held muted", async () => {
    // The indicator and the mute have to move together. Clearing it at
    // turnComplete showed "Listening — go ahead" while the assistant was still
    // audible and every word the user said was dropped at the mic.
    const { deps, drain } = await startHeldTurn();

    await handleGeminiMessage(turnDone, deps);

    expect(deps.setAssistantSpeaking).not.toHaveBeenCalledWith(false);

    drain();

    expect(deps.setAssistantSpeaking).toHaveBeenLastCalledWith(false);
  });

  it("lifts the auto-mute when an interrupt discards the turn's tail", async () => {
    // turnComplete parked its lift on onDrained, and the interrupt's flush
    // drops that callback. Nothing later would ever lift the mute, so the
    // interrupt has to — otherwise the mic stays shut for the rest of the
    // session and the Muted indicator disagrees with it. Safe here precisely
    // because turnComplete already ran: no further chunk can re-mute.
    const { deps, mic } = await startHeldTurn();

    await handleGeminiMessage(turnDone, deps);
    await handleGeminiMessage(interrupted, deps);

    expect(mic.setMuted).toHaveBeenNthCalledWith(2, false);
    expect(deps.autoMutedRef.current).toBe(false);
  });

  it("keeps holding the auto-mute for a mid-stream interrupt", async () => {
    // No turnComplete yet, so the server is still sending: lifting now would
    // let the next chunk re-mute and flicker the indicator.
    const { deps, mic } = await startHeldTurn();

    await handleGeminiMessage(interrupted, deps);

    expect(mic.setMuted).toHaveBeenCalledTimes(1);
    expect(deps.autoMutedRef.current).toBe(true);
  });

  it("lifts the auto-mute on interruption once the queue has drained", async () => {
    const { deps, mic, player } = makeMessageDeps({ halfDuplex: true });

    // No queued audio: the turn really ended at the interrupt, so lift now.
    vi.mocked(player.hasQueued).mockReturnValue(false);

    await handleGeminiMessage(audioChunk("A"), deps);
    await handleGeminiMessage(interrupted, deps);

    expect(mic.setMuted).toHaveBeenNthCalledWith(2, false);
    expect(deps.autoMutedRef.current).toBe(false);
  });

  it("turnComplete with no active auto-mute leaves the mic alone", async () => {
    const { deps, mic } = makeMessageDeps({ halfDuplex: true });

    await handleGeminiMessage(turnDone, deps);

    expect(mic.setMuted).not.toHaveBeenCalled();
  });
});

describe("beginGeminiHalfDuplexMute", () => {
  it("no-ops when half-duplex is off", () => {
    const mic = { setMuted: vi.fn() };
    const autoMutedRef = { current: false };

    beginGeminiHalfDuplexMute(mic, autoMutedRef, false);

    expect(mic.setMuted).not.toHaveBeenCalled();
    expect(autoMutedRef.current).toBe(false);
  });

  it("no-ops when an auto-mute is already active", () => {
    const mic = { setMuted: vi.fn() };
    const autoMutedRef = { current: true };

    beginGeminiHalfDuplexMute(mic, autoMutedRef, true);

    expect(mic.setMuted).not.toHaveBeenCalled();
  });

  it("no-ops when the mic is gone (post-teardown)", () => {
    const autoMutedRef = { current: false };

    beginGeminiHalfDuplexMute(null, autoMutedRef, true);

    expect(autoMutedRef.current).toBe(false);
  });

  it("mutes and sets the flag when half-duplex is on", () => {
    const mic = { setMuted: vi.fn() };
    const autoMutedRef = { current: false };

    beginGeminiHalfDuplexMute(mic, autoMutedRef, true);

    expect(mic.setMuted).toHaveBeenCalledWith(true);
    expect(autoMutedRef.current).toBe(true);
  });
});

describe("endGeminiHalfDuplexMute", () => {
  it("no-ops when no auto-mute is active", () => {
    const mic = { setMuted: vi.fn() };

    endGeminiHalfDuplexMute(mic, { current: false }, { current: false });

    expect(mic.setMuted).not.toHaveBeenCalled();
  });

  it("restores the user's manual state (false) and clears the flag", () => {
    const mic = { setMuted: vi.fn() };
    const autoMutedRef = { current: true };

    endGeminiHalfDuplexMute(mic, autoMutedRef, { current: false });

    expect(mic.setMuted).toHaveBeenCalledWith(false);
    expect(autoMutedRef.current).toBe(false);
  });

  it("restores the user's manual state (true) and clears the flag", () => {
    const mic = { setMuted: vi.fn() };
    const autoMutedRef = { current: true };

    endGeminiHalfDuplexMute(mic, autoMutedRef, { current: true });

    expect(mic.setMuted).toHaveBeenCalledWith(true);
    expect(autoMutedRef.current).toBe(false);
  });

  it("clears the flag even when the mic is gone (post-teardown)", () => {
    const autoMutedRef = { current: true };

    endGeminiHalfDuplexMute(null, autoMutedRef, { current: false });

    expect(autoMutedRef.current).toBe(false);
  });
});
