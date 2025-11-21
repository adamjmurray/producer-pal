/**
 * Audio processing helpers for voice chat
 */

import type { RefObject } from "preact";

/**
 * Plays an audio chunk from base64-encoded PCM data
 * @param base64Audio - Base64-encoded 16-bit PCM audio data
 * @param playbackAudioContextRef - Ref to the playback AudioContext
 * @param currentAudioSourceRef - Ref to the current audio source node
 * @param nextPlayTimeRef - Ref tracking when next audio should play
 * @returns {Promise<void>} Promise that resolves when audio is scheduled
 */
export async function playAudioChunk(
  base64Audio: string,
  playbackAudioContextRef: RefObject<AudioContext | null>,
  currentAudioSourceRef: RefObject<AudioBufferSourceNode | null>,
  nextPlayTimeRef: RefObject<number>,
): Promise<void> {
  try {
    // Ensure playback audio context exists and is running
    playbackAudioContextRef.current ??= new AudioContext({ sampleRate: 24000 });

    const ctx = playbackAudioContextRef.current;

    // Resume if suspended (iOS requirement)
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Decode base64 to get raw PCM bytes (16-bit little-endian)
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert Int16 PCM to Float32 samples
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      // Convert from int16 range (-32768 to 32767) to float32 range (-1.0 to 1.0)
      const sample = int16Array[i] ?? 0;
      float32Array[i] = sample / (sample < 0 ? 32768 : 32767);
    }

    // Create audio buffer manually for raw PCM
    const audioBuffer = ctx.createBuffer(
      1, // mono
      float32Array.length,
      24000, // 24kHz sample rate
    );

    // Copy samples to the audio buffer
    audioBuffer.getChannelData(0).set(float32Array);

    // Calculate chunk duration in seconds
    const chunkDuration = float32Array.length / 24000;

    // Schedule audio to play sequentially
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Determine when to start this chunk
    // If we're behind schedule (nextPlayTime < currentTime), catch up immediately
    const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current ?? 0);
    const endTime = startTime + chunkDuration;

    // Update next play time for the next chunk
    nextPlayTimeRef.current = endTime;

    // Clean up reference when done
    source.onended = () => {
      if (currentAudioSourceRef.current === source) {
        currentAudioSourceRef.current = null;
      }
    };

    currentAudioSourceRef.current = source;

    // Schedule the audio to start at the calculated time
    source.start(startTime);
  } catch (err) {
    console.error("Error playing audio:", err);
  }
}

/**
 * Processes audio input and converts to base64-encoded PCM
 * @param inputData - Float32 audio samples from microphone
 * @param sourceSampleRate - Sample rate of the input audio
 * @returns {string} Base64-encoded 16-bit PCM audio at 16kHz
 */
export function processAudioInput(
  inputData: Float32Array,
  sourceSampleRate: number,
): string {
  const targetSampleRate = 16000;

  // Resample to 16kHz if needed
  let resampledData: Float32Array;
  if (sourceSampleRate !== targetSampleRate) {
    const ratio = sourceSampleRate / targetSampleRate;
    const resampledLength = Math.floor(inputData.length / ratio);
    resampledData = new Float32Array(resampledLength);

    for (let i = 0; i < resampledLength; i++) {
      const sourceIndex = i * ratio;
      const index = Math.floor(sourceIndex);
      const frac = sourceIndex - index;

      // Linear interpolation
      const sample1 = inputData[index] ?? 0;
      const sample2 = inputData[Math.min(index + 1, inputData.length - 1)] ?? 0;
      resampledData[i] = sample1 + (sample2 - sample1) * frac;
    }
  } else {
    resampledData = inputData;
  }

  // Convert float32 samples to int16 PCM
  const pcmData = new Int16Array(resampledData.length);
  for (let i = 0; i < resampledData.length; i++) {
    // Clamp to [-1, 1] and convert to int16
    const s = Math.max(-1, Math.min(1, resampledData[i] ?? 0));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Convert to base64
  const uint8Array = new Uint8Array(pcmData.buffer);
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i] ?? 0);
  }
  return btoa(binaryString);
}
