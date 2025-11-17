import { useState, useCallback, useRef } from "preact/hooks";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";

export interface VoiceChatState {
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  transcription: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
}

export function useVoiceChat(
  apiKey: string,
  voiceName?: string,
): VoiceChatState {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState("");

  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isConnectedRef = useRef(false);
  const nextPlayTimeRef = useRef(0); // Track when next audio chunk should play

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      // Ensure playback audio context exists and is running
      playbackAudioContextRef.current ??= new AudioContext({
        sampleRate: 24000,
      });

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
      const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
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
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey) {
      setError("API key is required");
      return;
    }

    try {
      console.log("Connecting to Live API...");
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-2.5-flash-native-audio-preview-09-2025";

      const config: {
        responseModalities: Modality[];
        systemInstruction: string;
        speechConfig?: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: string;
            };
          };
        };
      } = {
        responseModalities: [Modality.AUDIO],
        systemInstruction:
          "You are a helpful voice assistant for music production. Keep responses concise and natural.",
      };

      // Add voice configuration if specified
      if (voiceName) {
        config.speechConfig = {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        };
      }

      const session = await ai.live.connect({
        model,
        config,
        callbacks: {
          onopen: () => {
            console.log("WebSocket opened");
            setIsConnected(true);
            isConnectedRef.current = true;
            setError(null);
          },
          onmessage: (message) => {
            try {
              // Handle interruptions
              if (message.serverContent?.interrupted) {
                console.log("AI interrupted - clearing audio queue");
                // Stop current audio playback
                if (currentAudioSourceRef.current) {
                  currentAudioSourceRef.current.stop();
                  currentAudioSourceRef.current = null;
                }
                // Reset audio queue when interrupted
                nextPlayTimeRef.current = 0;
                return;
              }

              // Handle transcriptions
              if (message.serverContent?.inputTranscription) {
                const inputText = message.serverContent.inputTranscription;
                console.log(`User transcription: ${inputText}`);
                setTranscription((prev) => {
                  const userText = `You: ${inputText}\n`;
                  return prev + userText;
                });
              }

              if (message.serverContent?.outputTranscription) {
                const outputText = message.serverContent.outputTranscription;
                console.log(`AI transcription: ${outputText}`);
                setTranscription((prev) => {
                  const aiText = `AI: ${outputText}\n`;
                  return prev + aiText;
                });
              }

              // Handle incoming audio
              const modelTurn = message.serverContent?.modelTurn;
              if (modelTurn?.parts) {
                for (const part of modelTurn.parts) {
                  if ("inlineData" in part && part.inlineData?.data) {
                    // Handle audio output
                    void playAudioChunk(part.inlineData.data);
                  }
                }
              }
            } catch (err) {
              console.error("Message handler error:", err);
            }
          },
          onerror: (e) => {
            console.error("WebSocket error:", e);
            setError(e.message || "An error occurred");
            setIsConnected(false);
            isConnectedRef.current = false;
          },
          onclose: (event) => {
            console.log(`WebSocket closed (code: ${event.code})`);
            setIsConnected(false);
            isConnectedRef.current = false;
          },
        },
      });

      console.log("Connected successfully");
      sessionRef.current = session;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Connection failed";
      console.error("Connection failed:", err);
      setError(errorMessage);
    }
  }, [apiKey, voiceName, playAudioChunk]);

  const startStreaming = useCallback(async () => {
    try {
      if (!sessionRef.current) {
        setError("Please connect first");
        return;
      }

      console.log("Starting audio streaming...");

      // Reset audio playback queue for new conversation
      nextPlayTimeRef.current = 0;

      // Create playback AudioContext with user gesture (iOS requirement)
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new AudioContext({
          sampleRate: 24000,
        });

        // iOS requires explicit resume after user gesture
        if (playbackAudioContextRef.current.state === "suspended") {
          await playbackAudioContextRef.current.resume();
        }
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log("Microphone access granted");
      mediaStreamRef.current = stream;

      // Create audio context for processing
      // Use default sample rate to avoid browser compatibility issues
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Resume if suspended (iOS requirement)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);

      // Create a script processor to capture raw audio
      // Note: ScriptProcessor is deprecated but AudioWorklet requires HTTPS
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        // Check connection state to prevent sending to closing/closed WebSocket
        if (!isConnectedRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const sourceSampleRate = audioContext.sampleRate;
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
            const sample2 =
              inputData[Math.min(index + 1, inputData.length - 1)] ?? 0;
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
        const base64Data = btoa(binaryString);

        // Send audio using optional chaining
        try {
          sessionRef.current?.sendRealtimeInput({
            audio: {
              data: base64Data,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch (err) {
          console.error("Error sending audio:", err);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsStreaming(true);
      setError(null);
      console.log("Audio streaming started");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start streaming";
      console.error("Failed to start streaming:", err);
      setError(errorMessage);
      setIsStreaming(false);
    }
  }, []);

  const stopStreaming = useCallback(() => {
    console.log("Stopping audio streaming...");

    // CRITICAL: Disconnect audio processor FIRST to stop callbacks
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Stop any playing audio
    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    }

    // Reset audio playback queue
    nextPlayTimeRef.current = 0;

    // Close playback audio context
    if (playbackAudioContextRef.current) {
      void playbackAudioContextRef.current.close();
      playbackAudioContextRef.current = null;
    }

    // Signal end of audio stream to Live API
    try {
      sessionRef.current?.sendRealtimeInput({
        audioStreamEnd: true,
      });
    } catch (err) {
      console.error("Error sending audioStreamEnd:", err);
    }

    setIsStreaming(false);

    // Auto-disconnect: close the session
    isConnectedRef.current = false;
    try {
      sessionRef.current?.close();
    } catch (err) {
      console.error("Error closing session:", err);
    }
    sessionRef.current = null;
    setIsConnected(false);
  }, []);

  const disconnect = useCallback(() => {
    // Since stopStreaming now auto-disconnects, just call it
    if (isStreaming) {
      stopStreaming();
    } else {
      // If not streaming, just disconnect the session
      isConnectedRef.current = false;
      try {
        sessionRef.current?.close();
      } catch (err) {
        console.error("Error closing session:", err);
      }
      sessionRef.current = null;
      setIsConnected(false);
    }
  }, [isStreaming, stopStreaming]);

  return {
    isConnected,
    isStreaming,
    error,
    transcription,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
  };
}
