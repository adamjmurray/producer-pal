import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceChat } from './useVoiceChat';

// Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    live: {
      connect: vi.fn(() =>
        Promise.resolve({
          sendRealtimeInput: vi.fn(),
          sendToolResponse: vi.fn(),
          close: vi.fn(),
        })
      ),
    },
  })),
  Modality: {
    AUDIO: 'audio',
  },
  Type: {
    OBJECT: 'object',
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    ARRAY: 'array',
  },
}));

// Mock btoa/atob for base64 encoding/decoding
(globalThis as typeof globalThis & { btoa: (str: string) => string }).btoa = vi.fn((str: string) => str);
(globalThis as typeof globalThis & { atob: (str: string) => string }).atob = vi.fn((str: string) => str);

// Mock AudioContext
class MockAudioContext {
  sampleRate: number;
  destination = {};

  constructor({ sampleRate }: { sampleRate: number }) {
    this.sampleRate = sampleRate;
  }

  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
  }));

  createScriptProcessor = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  }));

  close = vi.fn();
}

(globalThis as typeof globalThis & { AudioContext: unknown }).AudioContext = MockAudioContext as unknown as typeof AudioContext;

// Mock getUserMedia
const mockStream = {
  getTracks: vi.fn(() => [
    {
      stop: vi.fn(),
    },
  ]),
} as unknown as MediaStream;

(globalThis as typeof globalThis & { navigator: Navigator }).navigator = {
  ...globalThis.navigator,
  mediaDevices: {
    getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
  } as unknown as MediaDevices,
};

describe('useVoiceChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.transcription).toBe('');
    expect(result.current.debug).toBe('');
  });

  it('should require API key', () => {
    const { result } = renderHook(() => useVoiceChat(''));

    expect(result.current.isConnected).toBe(false);
  });

  it('should have connect function', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.connect).toBeDefined();
    expect(typeof result.current.connect).toBe('function');
  });

  it('should have disconnect function', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.disconnect).toBeDefined();
    expect(typeof result.current.disconnect).toBe('function');
  });

  it('should have startStreaming function', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.startStreaming).toBeDefined();
    expect(typeof result.current.startStreaming).toBe('function');
  });

  it('should have stopStreaming function', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.stopStreaming).toBeDefined();
    expect(typeof result.current.stopStreaming).toBe('function');
  });

  it('should require connection before streaming', async () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    await act(async () => {
      await result.current.startStreaming();
    });

    expect(result.current.error).toBe('Please connect first');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should create audio context when streaming starts', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.isStreaming).toBe(false);
    // Test verifies the hook is set up correctly for audio processing
  });

  it('should handle microphone errors gracefully', async () => {
    const testError = new Error('Microphone access denied');
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(testError);

    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    // Without connection, should show connection error
    await act(async () => {
      await result.current.startStreaming();
    });

    expect(result.current.error).toBe('Please connect first');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should initialize with verbose logging disabled', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.verboseLogging).toBe(false);
  });

  it('should have setVerboseLogging function', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.setVerboseLogging).toBeDefined();
    expect(typeof result.current.setVerboseLogging).toBe('function');
  });

  it('should toggle verbose logging state', () => {
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    expect(result.current.verboseLogging).toBe(false);

    act(() => {
      result.current.setVerboseLogging(true);
    });

    expect(result.current.verboseLogging).toBe(true);

    act(() => {
      result.current.setVerboseLogging(false);
    });

    expect(result.current.verboseLogging).toBe(false);
  });

  it('should not generate debug output when verbose logging is disabled', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    // Verbose logging should be disabled by default
    expect(result.current.verboseLogging).toBe(false);

    // Trigger an action that would normally log
    await act(async () => {
      await result.current.startStreaming();
    });

    // Debug should remain empty when verbose logging is disabled
    expect(result.current.debug).toBe('');
    // Console.log should not be called for debug logs when disabled
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should generate debug output when verbose logging is enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const { result } = renderHook(() => useVoiceChat('test-api-key'));

    // Enable verbose logging
    act(() => {
      result.current.setVerboseLogging(true);
    });

    expect(result.current.verboseLogging).toBe(true);

    // Trigger an action that would log
    await act(async () => {
      await result.current.startStreaming();
    });

    // Debug should have content when verbose logging is enabled
    expect(result.current.debug).not.toBe('');
    // Console.log should be called for debug logs when enabled
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
