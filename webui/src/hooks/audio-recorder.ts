/**
 * Audio recording for voice chat using AudioWorklet.
 * Based on Google's live-api-web-console AudioRecorder implementation.
 */

import {
  audioRecorderWorkletSrc,
  createWorkletFromSrc,
} from "./audio-worklet-sources";

const DEBUG = localStorage.getItem("voice-debug") === "true";

function log(...args: unknown[]): void {
  if (DEBUG)
    console.log("[AudioRecorder]", performance.now().toFixed(1), ...args);
}

/**
 * Converts an ArrayBuffer to base64 string.
 * @param buffer - The ArrayBuffer to convert
 * @returns {string} Base64-encoded string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

export interface AudioRecorderCallbacks {
  onData?: (base64Audio: string) => void;
  onVolume?: (volume: number) => void;
}

/**
 * Records audio from the microphone and converts to PCM16 at 16kHz.
 * Uses AudioWorklet for efficient processing in a separate thread.
 * Resampling happens in the worklet to handle any device sample rate.
 */
export class AudioRecorder {
  private stream: MediaStream | undefined;
  private audioContext: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private recordingWorklet: AudioWorkletNode | undefined;
  private starting: Promise<void> | null = null;
  private callbacks: AudioRecorderCallbacks = {};

  constructor() {}

  /**
   * Sets callbacks for audio data and volume events.
   * @param callbacks - Callbacks for data and volume events
   */
  setCallbacks(callbacks: AudioRecorderCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Starts recording from the microphone.
   * @returns {Promise<void>} Promise that resolves when recording starts
   */
  async start(): Promise<void> {
    // Runtime check for browser compatibility - TypeScript assumes always available
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime browser check
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }

    this.starting = new Promise<void>((resolve, reject) => {
      void (async () => {
        try {
          log("Requesting microphone access");

          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          // Create AudioContext at default sample rate - worklet handles resampling to 16kHz
          this.audioContext = new AudioContext();
          log("Created AudioContext at", this.audioContext.sampleRate, "Hz");

          if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
          }

          this.source = this.audioContext.createMediaStreamSource(this.stream);

          // Create and register the recording worklet
          const workletName = "audio-recorder-worklet";
          const workletUrl = createWorkletFromSrc(
            workletName,
            audioRecorderWorkletSrc,
          );

          log("Loading audio worklet");
          await this.audioContext.audioWorklet.addModule(workletUrl);

          this.recordingWorklet = new AudioWorkletNode(
            this.audioContext,
            workletName,
          );

          this.recordingWorklet.port.onmessage = (ev: MessageEvent) => {
            const arrayBuffer = ev.data?.data?.int16arrayBuffer as
              | ArrayBuffer
              | undefined;
            if (arrayBuffer && this.callbacks.onData) {
              const base64 = arrayBufferToBase64(arrayBuffer);
              log("Audio chunk", { size: arrayBuffer.byteLength });
              this.callbacks.onData(base64);
            }
          };

          this.source.connect(this.recordingWorklet);

          log("Recording started");
          resolve();
          this.starting = null;
        } catch (err) {
          log("Start error:", err);
          reject(err);
          this.starting = null;
        }
      })();
    });

    return this.starting;
  }

  /**
   * Stops recording and releases resources.
   */
  stop(): void {
    const handleStop = (): void => {
      log("Stopping recording");

      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());

      if (this.audioContext) {
        void this.audioContext.close();
      }

      this.stream = undefined;
      this.audioContext = undefined;
      this.source = undefined;
      this.recordingWorklet = undefined;
    };

    // Handle case where stop is called before start completes
    if (this.starting) {
      void this.starting.then(handleStop);
      return;
    }

    handleStop();
  }

  /**
   * Returns whether the recorder is currently active.
   * @returns {boolean} True if currently recording
   */
  get isRecording(): boolean {
    return this.recordingWorklet !== undefined;
  }
}
