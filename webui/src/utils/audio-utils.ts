/**
 * Audio utilities for voice input
 * Handles microphone access and audio format conversion for Gemini Live API
 */

/**
 * Convert audio buffer to 16-bit PCM format required by Gemini Live API
 * Input: Float32Array from Web Audio API (-1.0 to 1.0)
 * Output: Int16Array (16-bit PCM)
 */
export function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp value to [-1, 1] and convert to 16-bit range
    const value = float32Array[i] ?? 0;
    const clamped = Math.max(-1, Math.min(1, value));
    int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16Array;
}

/**
 * Convert Int16Array to base64 string for WebSocket transmission
 */
export function int16ArrayToBase64(int16Array: Int16Array): string {
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = "";
  for (let i = 0; i < uint8Array.length; i++) {
    const value = uint8Array[i] ?? 0;
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

/**
 * Audio recorder class for capturing microphone input
 * Automatically resamples to 16kHz mono as required by Gemini Live API
 */
export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioData: ((data: Int16Array) => void) | null = null;

  /**
   * Start recording from the microphone
   * @param onAudioData Callback for each audio chunk (16-bit PCM, 16kHz, mono)
   */
  async start(onAudioData: (data: Int16Array) => void): Promise<void> {
    this.onAudioData = onAudioData;

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1, // mono
        sampleRate: 16000, // 16kHz
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Create audio context with 16kHz sample rate
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Create processor for audio chunks
    // Buffer size of 4096 samples (~256ms at 16kHz)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const float32Data = event.inputBuffer.getChannelData(0);
      const int16Data = floatTo16BitPCM(float32Data);
      this.onAudioData?.(int16Data);
    };

    // Connect the audio pipeline
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  /**
   * Stop recording and clean up resources
   */
  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.onAudioData = null;
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.audioContext !== null && this.audioContext.state === "running";
  }
}
