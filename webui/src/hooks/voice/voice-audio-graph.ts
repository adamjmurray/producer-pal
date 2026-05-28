// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/settings-helpers";

/**
 * The Web Audio graph that routes the remote voice stream:
 * MediaStreamAudioSourceNode → GainNode → AudioContext.destination. The
 * GainNode lets output volume exceed unity (the <audio> element's .volume is
 * hard-capped at 1.0 by the HTML spec), so the slider can boost up to 125%.
 */
export interface VoiceAudioGraph {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

/**
 * Clamp a volume to the GainNode range, defaulting an undefined/invalid value to
 * unity. Unlike element .volume, the GainNode allows boost above 1.0, so the max
 * is VOICE_VOLUME_MAX (1.25), not unity.
 *
 * @param volume - Desired volume (0.0–1.25), or undefined
 * @returns A finite gain in [VOICE_VOLUME_MIN, VOICE_VOLUME_MAX]
 */
export function clampGain(volume: number | undefined): number {
  if (volume == null || !Number.isFinite(volume)) return VOICE_VOLUME_DEFAULT;

  return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, volume));
}

/**
 * Build the Web Audio graph from the remote stream attached to the playback
 * element. The WebRTC transport sets `srcObject` on our `<audio>` element when
 * the remote track arrives; we route that stream through a GainNode so output
 * can exceed unity. The element is muted (but keeps `srcObject` — WebRTC needs
 * a live media element to keep the track flowing into Web Audio). The
 * AudioContext is resumed because it is created during a user gesture (Talk).
 *
 * Returns null when there is no remote stream yet or the environment lacks Web
 * Audio (older/headless contexts) — callers fall back to element .volume.
 *
 * @param audioElement - The playback element the transport attached the stream to
 * @param volume - Initial output volume (0.0–1.25)
 * @returns The constructed graph, or null when it can't be built
 */
export function createVoiceAudioGraph(
  audioElement: HTMLAudioElement | null,
  volume: number | undefined,
): VoiceAudioGraph | null {
  if (audioElement == null) return null;
  const stream = audioElement.srcObject;

  if (!(stream instanceof MediaStream)) return null;

  const AudioCtx = resolveAudioContext();

  if (AudioCtx == null) return null;

  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain();

  gain.gain.value = clampGain(volume);
  source.connect(gain);
  gain.connect(context.destination);

  // Mute the element so the stream is heard only through the gain graph (playing
  // both would double the output). Keep srcObject attached: WebRTC requires the
  // remote track to be consumed by a live media element to keep flowing into the
  // MediaStreamAudioSourceNode.
  audioElement.muted = true;

  // Created inside the Talk user gesture, but resume defensively in case the
  // context starts suspended (autoplay policy). Best-effort: ignore rejection.
  void context.resume().catch(() => {});

  return { context, source, gain };
}

/**
 * Push a live volume change to the GainNode so the slider adjusts loudness
 * mid-session. No-op when there is no graph (idle session or element-only
 * fallback).
 *
 * @param graph - The active audio graph, or null
 * @param volume - Desired volume (0.0–1.25)
 */
export function setGraphGain(
  graph: VoiceAudioGraph | null,
  volume: number | undefined,
): void {
  if (graph == null) return;
  graph.gain.gain.value = clampGain(volume);
}

/**
 * Tear down the audio graph on session close/reconnect: disconnect the nodes and
 * close the AudioContext so no context or audio routing leaks. No-op when there
 * is no graph. Best-effort — swallows errors so a partial graph still closes.
 *
 * @param graph - The graph to tear down, or null
 */
export function teardownVoiceAudioGraph(graph: VoiceAudioGraph | null): void {
  if (graph == null) return;

  try {
    graph.source.disconnect();
  } catch {
    // best-effort
  }

  try {
    graph.gain.disconnect();
  } catch {
    // best-effort
  }

  void graph.context.close().catch(() => {});
}

/**
 * Resolve the AudioContext constructor, tolerating the webkit-prefixed name and
 * environments (headless/older) that lack Web Audio entirely.
 *
 * @returns The AudioContext constructor, or null when unavailable
 */
function resolveAudioContext(): typeof AudioContext | null {
  // Typed as optional so headless/older environments (no Web Audio) and the
  // webkit-prefixed fallback are both reachable — the lib DOM types declare
  // AudioContext as always-present, which it isn't at runtime.
  const w = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };

  return w.AudioContext ?? w.webkitAudioContext ?? null;
}
