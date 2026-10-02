// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/helpers/voice-settings-storage";
import {
  setGraphGain,
  type VoiceAudioGraph,
} from "#webui/hooks/voice/voice-audio-graph";

// The <audio> element's .volume is hard-capped at unity by the HTML spec — it
// can attenuate but not boost. Boost above unity goes through the Web Audio
// GainNode (see voice-audio-graph.ts), so this element-only clamp stays at 1.0
// even though the slider/GainNode range extends to VOICE_VOLUME_MAX (1.25).
const ELEMENT_VOLUME_MAX = 1;

/**
 * Create the `<audio>` element the WebRTC transport plays remote audio through.
 * Supplying our own (instead of letting the SDK create one) lets us reach the
 * remote stream for the Web Audio GainNode. The SDK sets autoplay + srcObject on
 * it when the remote track arrives. Once the gain graph is built the element is
 * muted; the initial .volume set here is the fallback used when Web Audio is
 * unavailable (capped at unity).
 *
 * @param volume - Initial output volume (0.0–1.25; element clamps to 1.0)
 * @returns A configured, detached audio element
 */
export function createPlaybackAudioElement(
  volume: number | undefined,
): HTMLAudioElement {
  const audioElement = document.createElement("audio");

  audioElement.autoplay = true;
  audioElement.volume = clampVolume(volume);

  return audioElement;
}

/**
 * Apply a live volume change to the playback element (the no-Web-Audio fallback
 * path; capped at unity). No-op when there is no element (idle session). The
 * GainNode is the primary live-volume path — see setGraphGain.
 *
 * @param audioElement - The active playback element, or null
 * @param volume - Desired volume (0.0–1.25; element clamps to 1.0)
 */
export function setAudioVolume(
  audioElement: HTMLAudioElement | null,
  volume: number | undefined,
): void {
  if (audioElement != null) {
    audioElement.volume = clampVolume(volume);
  }
}

/**
 * Apply a live volume change to both paths: the GainNode (the active path, can
 * boost above unity) and the element .volume (the no-Web-Audio fallback, capped
 * at unity). Either may be null when idle or when the graph wasn't built.
 *
 * @param graph - The active Web Audio graph, or null
 * @param audioElement - The active playback element, or null
 * @param volume - Desired volume (0.0–1.25)
 */
export function applyLiveVolume(
  graph: VoiceAudioGraph | null,
  audioElement: HTMLAudioElement | null,
  volume: number | undefined,
): void {
  setGraphGain(graph, volume);
  setAudioVolume(audioElement, volume);
}

/**
 * Stop and detach the playback element on teardown so a closed session leaves no
 * element holding the (now-ended) remote stream.
 *
 * @param audioElement - The playback element to tear down, or null
 */
export function teardownAudioElement(
  audioElement: HTMLAudioElement | null,
): void {
  if (audioElement == null) {
    return;
  }

  audioElement.pause();
  audioElement.srcObject = null;
}

/**
 * Clamp a volume to the element-playback range, defaulting an undefined/invalid
 * value to unity. Capped at unity (ELEMENT_VOLUME_MAX) because element .volume
 * can't boost; values above unity are realized by the GainNode, not here.
 *
 * @param volume - Desired volume (0.0–1.25), or undefined
 * @returns A finite volume in [VOICE_VOLUME_MIN, ELEMENT_VOLUME_MAX]
 */
function clampVolume(volume: number | undefined): number {
  if (volume == null || !Number.isFinite(volume)) {
    return VOICE_VOLUME_DEFAULT;
  }

  return Math.min(ELEMENT_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, volume));
}
