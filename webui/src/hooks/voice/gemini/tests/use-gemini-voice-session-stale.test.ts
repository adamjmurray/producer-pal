// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const sessions: { close: ReturnType<typeof vi.fn> }[] = [];
  const players: { close: ReturnType<typeof vi.fn> }[] = [];

  class FakeGoogleGenAI {
    live = {
      connect: vi.fn(async () => {
        const session = {
          sendRealtimeInput: vi.fn(),
          sendToolResponse: vi.fn(),
          sendClientContent: vi.fn(),
          close: vi.fn(),
        };

        sessions.push(session);

        return session;
      }),
    };
  }

  class FakeMic {
    setMuted = vi.fn();
    stop = vi.fn(async () => {});
    start = vi.fn(async () => ({ sampleRate: 16000 }));
  }

  class FakePlayer {
    setVolume = vi.fn();
    resume = vi.fn(async () => {});
    flush = vi.fn();
    close = vi.fn(async () => {});
    constructor() {
      players.push(this);
    }
  }

  return {
    sessions,
    players,
    FakeGoogleGenAI,
    FakeMic,
    FakePlayer,
    createGeminiMcpTools: vi.fn(),
    fetchGeminiToken: vi.fn(),
  };
});

vi.mock(import("@google/genai"), () => ({
  GoogleGenAI: h.FakeGoogleGenAI as never,
  Modality: { AUDIO: "AUDIO" } as never,
  ActivityHandling: {} as never,
  StartSensitivity: {} as never,
  EndSensitivity: {} as never,
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
import {
  deferred,
  disconnectThenTalkAgain,
  expectStaleMcpClosedOnlyItsOwn,
  resumeStaleConnect,
  startTalk,
} from "#webui/hooks/voice/tests/session/voice-stale-test-helpers";

const PARAMS = {
  mcpUrl: "http://localhost:3350/mcp",
  voiceTokenUrl: "http://localhost:3350/gemini-voice-token",
  geminiKey: "gem-key",
  model: "gemini-3.8-live",
};

const TOKEN = { value: "gem-key", ephemeral: false };

/**
 * Make the next createGeminiMcpTools() call resolve with a client of its own.
 * @returns The new client's close spy
 */
function nextMcpClient(): ReturnType<typeof vi.fn> {
  const close = vi.fn(async () => {});

  h.createGeminiMcpTools.mockResolvedValueOnce({
    functionDeclarations: [],
    executeTool: vi.fn(),
    mcpClient: { close },
  });

  return close;
}

/**
 * Press Talk and check it parked on its token fetch.
 * @param result - The renderHook result handle
 * @param callCount - How many token fetches should have started by now
 * @returns The in-flight connect (boxed so awaiting this doesn't wait on it)
 */
async function talkParkedOnToken(
  result: { current: ReturnType<typeof useGeminiVoiceSession> },
  callCount: number,
): Promise<{ connecting: Promise<void> }> {
  const talk = await startTalk(result.current);

  expect(h.fetchGeminiToken).toHaveBeenCalledTimes(callCount);

  return talk;
}

afterEach(() => {
  vi.clearAllMocks();
  h.createGeminiMcpTools.mockReset();
  h.fetchGeminiToken.mockReset();
  h.sessions.length = 0;
  h.players.length = 0;
});

describe("useGeminiVoiceSession stale connect", () => {
  it("a stale connect leaves the next Talk's resources alone and it still connects", async () => {
    const mcp1Close = nextMcpClient();
    const mcp2Close = nextMcpClient();
    const token1 = deferred<typeof TOKEN>();
    const token2 = deferred<typeof TOKEN>();

    h.fetchGeminiToken
      .mockReturnValueOnce(token1.promise)
      .mockReturnValueOnce(token2.promise);

    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));
    const { connecting: first } = await talkParkedOnToken(result, 1);

    // New chat / select / delete drops the first Talk, then the user talks again.
    await act(() => result.current.disconnect());
    expect(result.current.status).toBe("idle");
    expect(mcp1Close).toHaveBeenCalledTimes(1);

    const { connecting: second } = await talkParkedOnToken(result, 2);

    expect(result.current.status).toBe("connecting");

    // The first connect finally resumes: it must not touch the second.
    await resumeStaleConnect(first, () => {
      token1.resolve(TOKEN);
    });

    expect(result.current.status).toBe("connecting");
    expect(mcp2Close).not.toHaveBeenCalled();
    expect(h.sessions).toHaveLength(0);

    await resumeStaleConnect(second, () => {
      token2.resolve(TOKEN);
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(mcp2Close).not.toHaveBeenCalled();
  });

  it("a stale connect closes its own MCP client without overwriting the newer one's", async () => {
    const mcp1 = deferred<{
      functionDeclarations: never[];
      executeTool: () => void;
      mcpClient: { close: ReturnType<typeof vi.fn> };
    }>();

    h.createGeminiMcpTools.mockReturnValueOnce(mcp1.promise);
    const secondClose = nextMcpClient();

    h.fetchGeminiToken.mockResolvedValue(TOKEN);
    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));

    await expectStaleMcpClosedOnlyItsOwn({
      result,
      secondClose,
      resolveFirstMcp: (close) =>
        mcp1.resolve({
          functionDeclarations: [],
          executeTool: () => {},
          mcpClient: { close },
        }),
    });
  });

  it("a stale connect that throws leaves the user's state alone", async () => {
    nextMcpClient();
    nextMcpClient();
    const token1 = deferred<typeof TOKEN>();

    h.fetchGeminiToken
      .mockReturnValueOnce(token1.promise)
      .mockResolvedValueOnce(TOKEN);

    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));
    const { connecting: first } = await talkParkedOnToken(result, 1);

    await disconnectThenTalkAgain(result.current);
    expect(result.current.status).toBe("connected");

    await resumeStaleConnect(first, () => {
      token1.reject(new Error("aborted by teardown"));
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(h.sessions[0]!.close).not.toHaveBeenCalled();
    expect(h.players[0]!.close).not.toHaveBeenCalled();
  });
});
