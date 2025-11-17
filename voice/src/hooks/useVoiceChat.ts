import { useState, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import type { Session, LiveServerToolCall } from '@google/genai';
import { tools, executeTool } from '../services/tools';

export interface VoiceChatState {
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
  transcription: string;
  debug: string;
  verboseLogging: boolean;
  setVerboseLogging: (enabled: boolean) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
}

export function useVoiceChat(apiKey: string, voiceName?: string): VoiceChatState {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [debug, setDebug] = useState('');
  const [verboseLogging, setVerboseLogging] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isConnectedRef = useRef(false);
  const nextPlayTimeRef = useRef(0); // Track when next audio chunk should play
  const verboseLoggingRef = useRef(verboseLogging);

  // Keep ref in sync with state
  verboseLoggingRef.current = verboseLogging;

  // Debug logging helper
  const log = useCallback((message: string) => {
    // Bail early if verbose logging is disabled to avoid any performance impact
    if (!verboseLoggingRef.current) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setDebug((prev) => {
      const lines = (prev + '\n' + logMessage).split('\n').slice(-15); // Keep last 15 lines
      return lines.join('\n');
    });
  }, []);

  // Detect iOS
  const isIOS = useCallback(() => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  }, []);

  // Handle tool calls
  const handleToolCall = useCallback(async (toolCall: LiveServerToolCall) => {
    log(`Handling tool call: ${JSON.stringify(toolCall)}`);

    if (!toolCall.functionCalls) {
      log('No function calls in tool call message');
      return;
    }

    const toolResponses = [];

    for (const functionCall of toolCall.functionCalls) {
      if (!functionCall.name || !functionCall.id) {
        log('Invalid function call: missing name or id');
        continue;
      }

      try {
        log(`Executing tool: ${functionCall.name} with args: ${JSON.stringify(functionCall.args)}`);
        const result = await executeTool(functionCall.name, functionCall.args || {});
        log(`Tool result: ${result.output}`);

        toolResponses.push({
          functionResponses: [
            {
              name: functionCall.name,
              response: {
                output: result.output,
              },
              id: functionCall.id,
            },
          ],
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`Tool execution error: ${errMsg}`);

        toolResponses.push({
          functionResponses: [
            {
              name: functionCall.name,
              response: {
                error: errMsg,
              },
              id: functionCall.id,
            },
          ],
        });
      }
    }

    // Send tool responses back to the session
    for (const response of toolResponses) {
      try {
        sessionRef.current?.sendToolResponse(response);
        log(`Sent tool response: ${JSON.stringify(response)}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`Error sending tool response: ${errMsg}`);
      }
    }
  }, [log]);

  const connect = useCallback(async () => {
    if (!apiKey) {
      setError('API key is required');
      return;
    }

    try {
      const platform = isIOS() ? 'iOS Safari' : navigator.userAgent;
      log(`Connecting to Live API... (${platform})`);
      const ai = new GoogleGenAI({ apiKey });
      const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

      const config: {
        responseModalities: Modality[];
        systemInstruction: string;
        tools: Array<{ functionDeclarations: typeof tools }>;
        speechConfig?: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: string;
            };
          };
        };
      } = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: 'You are a helpful voice assistant. Keep responses concise and natural.',
        tools: [
          {
            functionDeclarations: tools,
          },
        ],
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
            log('WebSocket opened');
            setIsConnected(true);
            isConnectedRef.current = true;
            setError(null);
          },
          onmessage: (message) => {
            try {
              log('Received message from server');

              // Handle interruptions
              if (message.serverContent?.interrupted) {
                log('AI interrupted - clearing audio queue');
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
                log(`User transcription: ${inputText}`);
                setTranscription((prev) => {
                  const userText = `You: ${inputText}\n`;
                  return prev + userText;
                });
              }

              if (message.serverContent?.outputTranscription) {
                const outputText = message.serverContent.outputTranscription;
                log(`AI transcription: ${outputText}`);
                setTranscription((prev) => {
                  const aiText = `AI: ${outputText}\n`;
                  return prev + aiText;
                });
              }

              // Handle tool calls
              const toolCall = message.toolCall;
              if (toolCall) {
                log(`Tool call received: ${JSON.stringify(toolCall)}`);
                handleToolCall(toolCall);
                return;
              }

              // Handle incoming messages
              const modelTurn = message.serverContent?.modelTurn;
              if (modelTurn?.parts) {
                log(`Received ${modelTurn.parts.length} parts`);
                for (const part of modelTurn.parts) {
                  if ('inlineData' in part && part.inlineData?.data) {
                    // Handle audio output
                    playAudioChunk(part.inlineData.data);
                  }
                }
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              log(`Error in onmessage: ${errMsg}`);
              console.error('Message handler error:', err);
            }
          },
          onerror: (e) => {
            log(`WebSocket error: ${e.message || 'unknown error'}`);
            setError(e.message || 'An error occurred');
            setIsConnected(false);
            isConnectedRef.current = false;
          },
          onclose: (event) => {
            const reason = event?.reason || 'No reason provided';
            const code = event?.code || 'No code';
            const wasClean = event?.wasClean ? 'clean' : 'not clean';
            log(`WebSocket closed (${wasClean}, code: ${code}, reason: ${reason})`);
            setIsConnected(false);
            isConnectedRef.current = false;
          },
        },
      });

      log('Connected successfully, storing session reference');
      sessionRef.current = session;

      if (!sessionRef.current) {
        log('ERROR: Session ref is null after assignment!');
      } else {
        log('Session reference stored successfully');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      log(`Connection failed: ${errorMessage}`);
      setError(errorMessage);
      // Log full error for debugging
      console.error('Full connection error:', err);
    }
  }, [apiKey, voiceName, log, isIOS]);

  const stopStreaming = useCallback(() => {
    log('Stopping audio streaming...');

    // CRITICAL: Disconnect audio processor FIRST to stop callbacks
    if (processorRef.current) {
      log('Disconnecting audio processor');
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      log('Closing audio context');
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      log('Stopping media stream');
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
    log('Reset audio playback queue');

    // Close playback audio context
    if (playbackAudioContextRef.current) {
      log('Closing playback AudioContext');
      playbackAudioContextRef.current.close();
      playbackAudioContextRef.current = null;
    }

    // NOW signal end of audio stream to Live API (using optional chaining)
    try {
      sessionRef.current?.sendRealtimeInput({
        audioStreamEnd: true,
      });
      log('Sent audioStreamEnd signal');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`Error sending audioStreamEnd: ${errMsg}`);
    }

    setIsStreaming(false);
    log('Audio streaming stopped');

    // Auto-disconnect: close the session
    isConnectedRef.current = false;
    try {
      sessionRef.current?.close();
      log('Session closed');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`Error closing session: ${errMsg}`);
    }
    sessionRef.current = null;
    setIsConnected(false);
    log('Disconnected');
  }, [log]);

  const disconnect = useCallback(() => {
    // Since stopStreaming now auto-disconnects, just call it
    if (isStreaming) {
      stopStreaming();
    } else {
      // If not streaming, just disconnect the session
      log('Disconnecting...');
      isConnectedRef.current = false;
      try {
        sessionRef.current?.close();
        log('Session closed');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`Error closing session: ${errMsg}`);
      }
      sessionRef.current = null;
      setIsConnected(false);
      log('Disconnected');
    }
  }, [isStreaming, stopStreaming, log]);

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      // Ensure playback audio context exists and is running
      if (!playbackAudioContextRef.current) {
        log('Warning: Playback AudioContext not initialized, creating now');
        playbackAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const ctx = playbackAudioContextRef.current;

      // Resume if suspended (iOS requirement)
      if (ctx.state === 'suspended') {
        log(`Resuming suspended AudioContext (state: ${ctx.state})`);
        await ctx.resume();
        log(`AudioContext resumed (new state: ${ctx.state})`);
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
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 32768 : 32767);
      }

      // Create audio buffer manually for raw PCM
      const audioBuffer = ctx.createBuffer(
        1, // mono
        float32Array.length,
        24000 // 24kHz sample rate
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

      const delay = startTime - ctx.currentTime;
      log(`Scheduled audio chunk (${float32Array.length} samples, duration: ${chunkDuration.toFixed(3)}s, delay: ${delay.toFixed(3)}s, ctx state: ${ctx.state})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`Error playing audio: ${errMsg}`);
    }
  }, [log]);

  const startStreaming = useCallback(async () => {
    try {
      if (!sessionRef.current) {
        setError('Please connect first');
        log('Cannot start streaming: not connected');
        return;
      }

      const platform = isIOS() ? 'iOS' : 'Other';
      log(`Starting audio streaming... (Platform: ${platform})`);

      // Reset audio playback queue for new conversation
      nextPlayTimeRef.current = 0;
      log('Initialized audio playback queue');

      // Create playback AudioContext with user gesture (iOS requirement)
      if (!playbackAudioContextRef.current) {
        log('Creating playback AudioContext with user gesture');
        playbackAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
        log(`Playback AudioContext created (state: ${playbackAudioContextRef.current.state})`);

        // iOS requires explicit resume after user gesture
        if (playbackAudioContextRef.current.state === 'suspended') {
          log('Resuming playback AudioContext');
          await playbackAudioContextRef.current.resume();
          log(`Playback AudioContext resumed (state: ${playbackAudioContextRef.current.state})`);
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

      log('Microphone access granted');
      mediaStreamRef.current = stream;

      // Create audio context for processing
      // Use default sample rate to avoid browser compatibility issues
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      log(`Input AudioContext created (state: ${audioContext.state}, sampleRate: ${audioContext.sampleRate})`);

      // Resume if suspended (iOS requirement)
      if (audioContext.state === 'suspended') {
        log('Resuming input AudioContext');
        await audioContext.resume();
        log(`Input AudioContext resumed (state: ${audioContext.state})`);
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
            const sample1 = inputData[index] || 0;
            const sample2 = inputData[Math.min(index + 1, inputData.length - 1)] || 0;
            resampledData[i] = sample1 + (sample2 - sample1) * frac;
          }
        } else {
          resampledData = inputData;
        }

        // Convert float32 samples to int16 PCM
        const pcmData = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
          // Clamp to [-1, 1] and convert to int16
          const s = Math.max(-1, Math.min(1, resampledData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert to base64
        const uint8Array = new Uint8Array(pcmData.buffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64Data = btoa(binaryString);

        // Send audio using optional chaining
        try {
          sessionRef.current?.sendRealtimeInput({
            audio: {
              data: base64Data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log(`Error sending audio: ${errMsg}`);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsStreaming(true);
      setError(null);
      log('Audio streaming started');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start streaming';
      log(`Failed to start streaming: ${errorMessage}`);
      setError(errorMessage);
      setIsStreaming(false);
    }
  }, [log, isIOS]);

  return {
    isConnected,
    isStreaming,
    error,
    transcription,
    debug,
    verboseLogging,
    setVerboseLogging,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
  };
}
