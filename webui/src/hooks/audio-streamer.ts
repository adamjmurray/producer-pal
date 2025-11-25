/**
 * Audio streaming playback for voice chat.
 * Based on Google's live-api-web-console AudioStreamer implementation.
 */

const DEBUG = localStorage.getItem("voice-debug") === "true";

function log(...args: unknown[]): void {
  if (DEBUG)
    console.log("[AudioStreamer]", performance.now().toFixed(1), ...args);
}

/**
 * Manages streaming audio playback with buffer queueing and schedule-ahead logic.
 * Handles smooth fade-out on stop and proper cleanup of audio resources.
 */
export class AudioStreamer {
  private sampleRate = 24000;
  private bufferSize = 2400; // 100ms chunks for smooth playback
  private minBuffersBeforeStart = 5; // Wait for 500ms of audio before starting
  private audioQueue: Float32Array[] = [];
  private pendingSamples: Float32Array | null = null; // Accumulate between calls
  private isPlaying = false;
  private isStreamComplete = false;
  private checkInterval: number | null = null;
  private scheduledTime = 0;
  private initialBufferTime = 0.05; // 50ms initial delay once we start
  private gainNode: GainNode;
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;

  onComplete = (): void => {};

  constructor(public context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
    this.addPCM16 = this.addPCM16.bind(this);
  }

  /**
   * Converts a Uint8Array of PCM16 audio data into a Float32Array.
   * @param chunk - PCM16 audio data as Uint8Array
   * @returns {Float32Array} Float32Array of normalized audio samples
   */
  private processPCM16Chunk(chunk: Uint8Array): Float32Array {
    const float32Array = new Float32Array(chunk.length / 2);
    const dataView = new DataView(chunk.buffer);

    for (let i = 0; i < chunk.length / 2; i++) {
      try {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768;
      } catch (e) {
        console.error("Error processing PCM16 chunk:", e);
      }
    }
    return float32Array;
  }

  /**
   * Converts base64-encoded PCM16 audio to Uint8Array.
   * @param base64 - Base64-encoded audio data
   * @returns {Uint8Array} Uint8Array of raw bytes
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Adds base64-encoded PCM16 audio data for playback.
   * Chunks are buffered and scheduled with lookahead to prevent gaps.
   * @param base64Audio - Base64-encoded PCM16 audio data
   */
  addPCM16(base64Audio: string): void {
    const chunk = this.base64ToUint8Array(base64Audio);

    // Reset the stream complete flag when a new chunk is added
    this.isStreamComplete = false;

    // Process the chunk into a Float32Array
    const newSamples = this.processPCM16Chunk(chunk);

    // Combine with any pending samples from previous calls
    let processingBuffer: Float32Array;
    if (this.pendingSamples) {
      processingBuffer = new Float32Array(
        this.pendingSamples.length + newSamples.length,
      );
      processingBuffer.set(this.pendingSamples);
      processingBuffer.set(newSamples, this.pendingSamples.length);
      this.pendingSamples = null;
    } else {
      processingBuffer = newSamples;
    }

    log("Chunk received", {
      size: chunk.length,
      samples: newSamples.length,
      totalSamples: processingBuffer.length,
      queueDepth: this.audioQueue.length,
    });

    // Split into buffer-sized chunks, only queue full buffers
    while (processingBuffer.length >= this.bufferSize) {
      const buffer = processingBuffer.slice(0, this.bufferSize);
      this.audioQueue.push(buffer);
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }

    // Store remainder for next call (don't queue small buffers)
    if (processingBuffer.length > 0) {
      this.pendingSamples = processingBuffer;
    }

    // Start playing once we have enough buffered audio
    if (
      !this.isPlaying &&
      this.audioQueue.length >= this.minBuffersBeforeStart
    ) {
      this.isPlaying = true;
      // Initialize scheduledTime with initial buffer delay
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      log("Starting playback", {
        scheduledTime: this.scheduledTime,
        bufferedMs: this.audioQueue.length * 100,
      });
      this.scheduleNextBuffer();
    }
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(
      1,
      audioData.length,
      this.sampleRate,
    );
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  private scheduleNextBuffer(): void {
    const SCHEDULE_AHEAD_TIME = 1.0; // 1 second lookahead for smooth playback

    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = this.audioQueue.shift();
      if (!audioData) break;

      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();

      // Track the last source in queue for completion detection
      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) {
          this.endOfQueueAudioSource.onended = null;
        }
        this.endOfQueueAudioSource = source;
        source.onended = () => {
          if (
            !this.audioQueue.length &&
            this.endOfQueueAudioSource === source
          ) {
            this.endOfQueueAudioSource = null;
            log("Queue completed");
            this.onComplete();
          }
        };
      }

      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      // Ensure we never schedule in the past
      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;

      log("Buffer scheduled", {
        startTime,
        duration: audioBuffer.duration,
        queueRemaining: this.audioQueue.length,
      });
    }

    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false;
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      } else {
        // Poll for more data when queue empties (frequent checks to minimize gaps)
        this.checkInterval ??= window.setInterval(() => {
          if (this.audioQueue.length > 0) {
            this.scheduleNextBuffer();
          }
        }, 25);
      }
    } else {
      // Schedule next check before current buffer ends
      const nextCheckTime =
        (this.scheduledTime - this.context.currentTime) * 1000;
      setTimeout(
        () => this.scheduleNextBuffer(),
        Math.max(0, nextCheckTime - 50),
      );
    }
  }

  /**
   * Stops playback immediately by disconnecting and replacing the gain node.
   * This ensures any scheduled audio sources are orphaned and won't be heard.
   */
  stop(): void {
    log("Stopping playback");

    this.isPlaying = false;
    this.isStreamComplete = true;
    this.audioQueue = [];
    this.pendingSamples = null;
    this.scheduledTime = this.context.currentTime;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Immediately disconnect old gain node to orphan any scheduled sources
    // This prevents old audio from playing even if resume() is called quickly
    this.gainNode.disconnect();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  /**
   * Resumes playback after being stopped.
   */
  async resume(): Promise<void> {
    log("Resuming playback");

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.isStreamComplete = false;
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  /**
   * Marks the stream as complete and flushes any pending samples.
   */
  complete(): void {
    log("Stream marked complete", {
      pendingSamples: this.pendingSamples?.length ?? 0,
      queueDepth: this.audioQueue.length,
      isPlaying: this.isPlaying,
    });

    // Flush any remaining pending samples
    if (this.pendingSamples && this.pendingSamples.length > 0) {
      this.audioQueue.push(this.pendingSamples);
      this.pendingSamples = null;
    }

    this.isStreamComplete = true;

    // If we haven't started playing yet (short response), start now
    if (!this.isPlaying && this.audioQueue.length > 0) {
      this.isPlaying = true;
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      log("Starting playback (on complete)", {
        scheduledTime: this.scheduledTime,
        bufferedMs: this.audioQueue.length * 100,
      });
      this.scheduleNextBuffer();
    } else if (this.isPlaying) {
      // Schedule any remaining buffers
      this.scheduleNextBuffer();
    }
  }
}
