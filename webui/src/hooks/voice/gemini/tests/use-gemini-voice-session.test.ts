// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- hoisted doubles (vi.mock factories can only see vi.hoisted values) ---
const h = vi.hoisted(() => {
  const fakeSession = {
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
    sendClientContent: vi.fn(),
    close: vi.fn(),
  };

  const state: {
    callbacks: Record<string, (arg?: unknown) => void>;
    connectParams: { model?: string; config?: unknown } | null;
    genaiOptions: unknown;
    onChunk: ((data: string) => void) | null;
  } = { callbacks: {}, connectParams: null, genaiOptions: null, onChunk: null };

  const liveConnect = vi.fn(
    async (params: {
      model: string;
      callbacks: Record<string, (arg?: unknown) => void>;
      config: unknown;
    }) => {
      state.callbacks = params.callbacks;
      state.connectParams = params;
      params.callbacks.onopen?.();

      return fakeSession;
    },
  );

  class FakeGoogleGenAI {
    live = { connect: liveConnect };
    constructor(options: unknown) {
      state.genaiOptions = options;
    }
  }

  class FakeMic {
    static last: FakeMic | null = null;
    setMuted = vi.fn();
    stop = vi.fn(async () => {});
    start = vi.fn(async (opts: { onChunk: (data: string) => void }) => {
      state.onChunk = opts.onChunk;

      return { sampleRate: 16000 };
    });

    constructor() {
      FakeMic.last = this;
    }
  }

  class FakePlayer {
    static last: FakePlayer | null = null;
    setVolume = vi.fn();
    resume = vi.fn(async () => {});
    flush = vi.fn();
    enqueueBase64 = vi.fn();
    close = vi.fn(async () => {});
    constructor() {
      FakePlayer.last = this;
    }
  }

  const mcpClose = vi.fn(async () => {});
  const executeTool = vi.fn(async () => "tool-out");
  const createGeminiMcpTools = vi.fn(async () => ({
    functionDeclarations: [{ name: "ppal-x" }],
    executeTool,
    mcpClient: { close: mcpClose },
  }));

  const fetchGeminiToken = vi.fn(async () => ({
    value: "gem-key",
    ephemeral: false,
  }));

  return {
    fakeSession,
    state,
    liveConnect,
    FakeGoogleGenAI,
    FakeMic,
    FakePlayer,
    mcpClose,
    executeTool,
    createGeminiMcpTools,
    fetchGeminiToken,
  };
});

// `as never` lets the structural fakes stand in for the real module exports
// (classes with private fields can't be matched structurally) — same pattern as
// use-voice-session.test.ts.
vi.mock(import("@google/genai"), () => ({
  GoogleGenAI: h.FakeGoogleGenAI as never,
  Modality: { AUDIO: "AUDIO" } as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-mic-capture"), () => ({
  GeminiMicCapture: h.FakeMic as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-pcm-player"), () => ({
  GeminiPcmPlayer: h.FakePlayer as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-mcp-tools"), () => ({
  createGeminiMcpTools: h.createGeminiMcpTools as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-voice-token"), () => ({
  fetchGeminiToken: h.fetchGeminiToken as never,
}));

import { useGeminiVoiceSession } from "#webui/hooks/voice/gemini/use-gemini-voice-session";

const PARAMS = {
  mcpUrl: "http://localhost:3350/mcp",
  voiceTokenUrl: "http://localhost:3350/gemini-voice-token",
  geminiKey: "gem-key" as string | null,
  model: "gemini-3.1-flash-live-preview",
  voice: "Puck",
  volume: 1,
};

/**
 * Render the hook and run a successful connect().
 * @param overrides - Param overrides
 * @returns The renderHook result
 */
async function renderConnected(overrides: Partial<typeof PARAMS> = {}) {
  const view = renderHook((p: typeof PARAMS) => useGeminiVoiceSession(p), {
    initialProps: { ...PARAMS, ...overrides },
  });

  await act(async () => {
    await view.result.current.connect();
  });

  return view;
}

beforeEach(() => {
  h.fetchGeminiToken.mockResolvedValue({ value: "gem-key", ephemeral: false });
});

afterEach(() => {
  vi.clearAllMocks();
  h.FakeMic.last = null;
  h.FakePlayer.last = null;
  h.state.callbacks = {};
  h.state.onChunk = null;
});

describe("useGeminiVoiceSession", () => {
  it("errors without a key and never opens a session", async () => {
    const { result } = renderHook(() =>
      useGeminiVoiceSession({ ...PARAMS, geminiKey: null }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/Gemini API key/);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });

  it("connects: opens session with config, starts mic, sets status", async () => {
    const { result } = await renderConnected();

    expect(result.current.status).toBe("connected");
    expect(result.current.activeVoice).toBe("Puck");
    expect(h.FakePlayer.last!.resume).toHaveBeenCalled();
    expect(h.FakeMic.last!.start).toHaveBeenCalled();
    const params = h.state.connectParams!;

    expect(params.model).toBe("gemini-3.1-flash-live-preview");
    expect(h.state.genaiOptions).toStrictEqual({ apiKey: "gem-key" });
  });

  it("uses v1alpha httpOptions for an ephemeral credential", async () => {
    h.fetchGeminiToken.mockResolvedValueOnce({
      value: "auth_tokens/x",
      ephemeral: true,
    });

    await renderConnected();

    expect(h.state.genaiOptions).toStrictEqual({
      apiKey: "auth_tokens/x",
      httpOptions: { apiVersion: "v1alpha" },
    });
  });

  it("leaves activeVoice null when no voice is provided", async () => {
    const { result } = await renderConnected({ voice: undefined });

    expect(result.current.status).toBe("connected");
    expect(result.current.activeVoice).toBeNull();
  });

  it("ignores a second connect() while already connected", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      await result.current.connect();
    });

    expect(h.liveConnect).toHaveBeenCalledTimes(1);
  });

  it("renders incoming transcripts into history", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onmessage?.({
        serverContent: { inputTranscription: { text: "hello there" } },
      });
    });

    expect(result.current.history[0]).toMatchObject({
      role: "user",
      content: [{ transcript: "hello there" }],
    });
  });

  it("forwards mic chunks to sendRealtimeInput", async () => {
    await renderConnected();

    h.state.onChunk?.("BASE64PCM");

    expect(h.fakeSession.sendRealtimeInput).toHaveBeenCalledWith({
      audio: { data: "BASE64PCM", mimeType: "audio/pcm;rate=16000" },
    });
  });

  it("runs a tool call through the session (covers getSession)", async () => {
    await renderConnected();

    await act(async () => {
      h.state.callbacks.onmessage?.({
        toolCall: { functionCalls: [{ id: "c1", name: "ppal-x", args: {} }] },
      });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(h.executeTool).toHaveBeenCalledWith("ppal-x", {});
    expect(h.fakeSession.sendToolResponse).toHaveBeenCalled();
  });

  it("toggleMute drives the mic and flips isMuted", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(true);
    expect(h.FakeMic.last!.setMuted).toHaveBeenCalledWith(true);

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
  });

  it("toggleMute is a no-op when idle", async () => {
    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
  });

  it("interrupt flushes playback and clears speaking", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      result.current.interrupt();
    });

    expect(h.FakePlayer.last!.flush).toHaveBeenCalled();
    expect(result.current.assistantSpeaking).toBe(false);
  });

  it("interrupt is safe before connect (no player)", () => {
    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));

    expect(() => act(() => result.current.interrupt())).not.toThrow();
  });

  it("retryResponse clears the error banner", async () => {
    const { result } = renderHook(() =>
      useGeminiVoiceSession({ ...PARAMS, geminiKey: null }),
    );

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      result.current.retryResponse();
    });
    expect(result.current.error).toBeNull();
  });

  it("resetHistory clears the transcript", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onmessage?.({
        serverContent: { inputTranscription: { text: "hi" } },
      });
    });
    expect(result.current.history).toHaveLength(1);

    await act(async () => {
      result.current.resetHistory();
    });
    expect(result.current.history).toHaveLength(0);
  });

  it("disconnect tears everything down and goes idle", async () => {
    const { result } = await renderConnected();
    const mic = h.FakeMic.last!;
    const player = h.FakePlayer.last!;

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.status).toBe("idle");
    expect(mic.stop).toHaveBeenCalled();
    expect(player.close).toHaveBeenCalled();
    expect(h.fakeSession.close).toHaveBeenCalled();
    expect(h.mcpClose).toHaveBeenCalled();
  });

  it("surfaces an unexpected close as a lost connection", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onclose?.();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/Connection lost/);
  });

  it("surfaces a transport error", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onerror?.(new Error("ws boom"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("ws boom");
  });

  it("catches a connect failure and cleans up", async () => {
    h.fetchGeminiToken.mockRejectedValueOnce(new Error("token denied"));

    const { result } = await renderConnected();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("token denied");
    expect(h.mcpClose).toHaveBeenCalled();
  });

  it("defaults volume to unity when none is provided", async () => {
    await renderConnected({ volume: undefined });

    expect(h.FakePlayer.last!.setVolume).toHaveBeenCalledWith(1);
  });

  it("pushes live volume changes to the player", async () => {
    const view = await renderConnected();
    const player = h.FakePlayer.last!;

    player.setVolume.mockClear();
    view.rerender({ ...PARAMS, volume: 0.5 });

    expect(player.setVolume).toHaveBeenCalledWith(0.5);
  });

  it("bails and closes the session if torn down during connect", async () => {
    // Suspend the token fetch, unmount mid-connect, then let it resolve.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    h.fetchGeminiToken.mockReturnValueOnce(
      gate.then(() => ({ value: "gem-key", ephemeral: false })),
    );

    const { result, unmount } = renderHook(() => useGeminiVoiceSession(PARAMS));
    let connectPromise!: Promise<void>;

    await act(async () => {
      connectPromise = result.current.connect();
      await Promise.resolve();
    });

    unmount();
    await act(async () => {
      release();
      await connectPromise;
    });

    // Torn down before the session opened: no live session leaked.
    expect(h.liveConnect).not.toHaveBeenCalled();
    expect(h.mcpClose).toHaveBeenCalled();
  });
});
