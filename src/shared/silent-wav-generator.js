import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SILENCE_WAV = path.join(os.tmpdir(), "ppal-silence.wav");

// Module-level cache - survives across multiple calls in same process
let silenceWavGenerated = false;

/**
 * Returns path to silent WAV, generating it if needed
 * Uses two-level caching:
 * 1. In-memory flag (fastest, survives in same process)
 * 2. Filesystem check (handles hot reload where file already exists)
 * @returns {string} Absolute path to silent WAV file
 */
export function ensureSilenceWav() {
  // In-memory check first (zero I/O)
  if (silenceWavGenerated) {
    return SILENCE_WAV;
  }

  // Filesystem check (handles hot reload case)
  if (!fs.existsSync(SILENCE_WAV)) {
    createSilentWav(SILENCE_WAV);
  }

  // Cache for subsequent calls in this process
  silenceWavGenerated = true;

  return SILENCE_WAV;
}

export { SILENCE_WAV };

/**
 * Creates a silent WAV file (0.1 second, 44.1kHz, 16-bit mono)
 * File size: ~8.8KB
 *
 * @param {string} filePath - Path where the WAV file will be created
 */
function createSilentWav(filePath) {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  const durationSeconds = 0.1;
  const numSamples = Math.floor(sampleRate * durationSeconds); // 4,410 samples
  const dataSize = numSamples * numChannels * (bitsPerSample / 8); // 8,820 bytes

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Sub-chunk size
  buffer.writeUInt16LE(1, 20); // Audio format (PCM)
  buffer.writeUInt16LE(numChannels, 22); // Channels
  buffer.writeUInt32LE(sampleRate, 24); // Sample rate
  buffer.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28); // Byte rate
  buffer.writeUInt16LE((numChannels * bitsPerSample) / 8, 32); // Block align
  buffer.writeUInt16LE(bitsPerSample, 34); // Bits per sample

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Remaining bytes already zero-filled (silent audio)

  fs.writeFileSync(filePath, buffer);
}
