/**
 * Audio worklet source code as embedded strings.
 * These get bundled with the app and create Blob URLs at runtime,
 * allowing worklets to work with single-file HTML builds.
 */

/**
 * Audio recording worklet that resamples to 16kHz and converts Float32 to Int16 PCM.
 * Handles resampling from any source sample rate (44.1kHz, 48kHz, etc).
 */
export const audioRecorderWorkletSrc = `
class AudioProcessingWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.buffer = new Int16Array(2048);
    this.bufferWriteIndex = 0;
    this.resampleRemainder = 0;
  }

  process(inputs) {
    if (inputs[0].length) {
      this.processChunk(inputs[0][0]);
    }
    return true;
  }

  processChunk(float32Array) {
    // sampleRate is a global in AudioWorkletGlobalScope
    const ratio = sampleRate / this.targetSampleRate;

    for (let i = 0; i < float32Array.length; i++) {
      this.resampleRemainder += 1;

      // Only take samples at the target rate
      if (this.resampleRemainder >= ratio) {
        this.resampleRemainder -= ratio;

        // Clamp and convert float32 (-1 to 1) to int16 (-32768 to 32767)
        const sample = Math.max(-1, Math.min(1, float32Array[i]));
        this.buffer[this.bufferWriteIndex++] = sample * 32767;

        if (this.bufferWriteIndex >= this.buffer.length) {
          this.sendAndClearBuffer();
        }
      }
    }
  }

  sendAndClearBuffer() {
    this.port.postMessage({
      event: "chunk",
      data: {
        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer
      }
    });
    this.bufferWriteIndex = 0;
  }
}
`;

/**
 * Creates a Blob URL from worklet source code.
 * This allows worklets to be bundled as strings and loaded at runtime.
 * @param workletName - Name to register the worklet processor
 * @param src - JavaScript source code for the worklet class
 * @returns {string} Blob URL that can be passed to audioWorklet.addModule()
 */
export function createWorkletFromSrc(workletName: string, src: string): string {
  const blob = new Blob([`registerProcessor("${workletName}", ${src})`], {
    type: "application/javascript",
  });
  return URL.createObjectURL(blob);
}
