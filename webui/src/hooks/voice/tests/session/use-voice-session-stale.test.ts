// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeSession {
    static instances: FakeSession[] = [];
    connectArgs: unknown = null;
    on = vi.fn();
    mute = vi.fn();
    interrupt = vi.fn();
    updateHistory = vi.fn();
    close = vi.fn();
    constructor() {
      FakeSession.instances.push(this);
    }

    connect(args: unknown) {
      this.connectArgs = args;

      return Promise.resolve();
    }
  }

  class FakeAgent {}

  class FakeTransport {
    static instances: FakeTransport[] = [];
    on = vi.fn();
    constructor() {
      FakeTransport.instances.push(this);
    }
  }

  return {
    FakeSession,
    FakeAgent,
    FakeTransport,
    createRealtimeMcpTools: vi.fn(),
    fetchMock: vi.fn(),
  };
});

vi.mock(import("@openai/agents/realtime"), () => ({
  RealtimeAgent: mocks.FakeAgent as never,
  RealtimeSession: mocks.FakeSession as never,
  OpenAIRealtimeWebRTC: mocks.FakeTransport as never,
}));
vi.mock(import("#webui/hooks/voice/realtime-mcp-tools"), () => ({
  createRealtimeMcpTools: mocks.createRealtimeMcpTools,
}));

import {
  deferred,
  disconnectThenTalkAgain,
  expectStaleMcpClosedOnlyItsOwn,
  resumeStaleConnect,
  startTalk,
} from "#webui/hooks/voice/tests/session/voice-stale-test-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";

const PARAMS = {
  mcpUrl: "http://localhost:3350/mcp",
  voiceTokenUrl: "http://localhost:3350/voice-token",
  openAiKey: "sk-test",
};

const REAL_FETCH = globalThis.fetch;

/** @returns A fresh successful /voice-token response */
function tokenResponse(): Response {
  return new Response(JSON.stringify({ value: "ek_x" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Make the next createRealtimeMcpTools() call resolve with a client of its own.
 * @returns The new client's close spy
 */
function nextMcpClient(): ReturnType<typeof vi.fn> {
  const close = vi.fn(async () => {});

  mocks.createRealtimeMcpTools.mockResolvedValueOnce({
    tools: [],
    mcpClient: { close },
  });

  return close;
}

beforeEach(() => {
  mocks.FakeSession.instances = [];
  mocks.FakeTransport.instances = [];
  mocks.createRealtimeMcpTools.mockReset();
  mocks.fetchMock.mockReset();
  mocks.fetchMock.mockImplementation(async () => tokenResponse());
  globalThis.fetch = mocks.fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

/**
 * Talk (parked on its WebRTC handshake), drop it, then Talk again to completion.
 * @returns The hook, the first (stale) connect, and its handshake gate
 */
async function parkedHandshakeThenTalkAgain() {
  nextMcpClient();
  nextMcpClient();
  const handshake1 = deferred<void>();

  vi.spyOn(mocks.FakeSession.prototype, "connect").mockReturnValueOnce(
    handshake1.promise,
  );

  const { result } = renderHook(() => useVoiceSession(PARAMS));
  const { connecting: first } = await startTalk(result.current);

  await disconnectThenTalkAgain(result.current);
  expect(result.current.status).toBe("connected");

  return { result, first, handshake1 };
}

describe("useVoiceSession stale connect", () => {
  it("a stale connect leaves the next Talk's resources alone and it still connects", async () => {
    const mcp1Close = nextMcpClient();
    const mcp2Close = nextMcpClient();
    const token1 = deferred<Response>();
    const token2 = deferred<Response>();

    mocks.fetchMock
      .mockReturnValueOnce(token1.promise)
      .mockReturnValueOnce(token2.promise);

    const { result } = renderHook(() => useVoiceSession(PARAMS));
    const { connecting: first } = await startTalk(result.current);

    // New chat / select / delete drops the first Talk, then the user talks again.
    await act(() => result.current.disconnect());
    expect(result.current.status).toBe("idle");

    const { connecting: second } = await startTalk(result.current);
    const [session1, session2] = mocks.FakeSession.instances;

    expect(result.current.status).toBe("connecting");

    // The first connect finally resumes: it must not touch the second.
    await resumeStaleConnect(first, () => {
      token1.resolve(tokenResponse());
    });

    expect(result.current.status).toBe("connecting");
    expect(session1!.connectArgs).toBeNull();
    expect(mcp1Close).toHaveBeenCalledTimes(1);
    expect(mcp2Close).not.toHaveBeenCalled();
    expect(session2!.close).not.toHaveBeenCalled();

    await resumeStaleConnect(second, () => {
      token2.resolve(tokenResponse());
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(session2!.connectArgs).not.toBeNull();
    expect(session2!.close).not.toHaveBeenCalled();
  });

  it("a stale connect closes its own MCP client without overwriting the newer one's", async () => {
    const mcp1 = deferred<{
      tools: never[];
      mcpClient: { close: ReturnType<typeof vi.fn> };
    }>();

    mocks.createRealtimeMcpTools.mockReturnValueOnce(mcp1.promise);
    const secondClose = nextMcpClient();
    const { result } = renderHook(() => useVoiceSession(PARAMS));

    await expectStaleMcpClosedOnlyItsOwn({
      result,
      secondClose,
      resolveFirstMcp: (close) =>
        mcp1.resolve({ tools: [], mcpClient: { close } }),
    });
  });

  it("a stale connect that throws leaves the user's state alone", async () => {
    const { result, first, handshake1 } = await parkedHandshakeThenTalkAgain();

    await resumeStaleConnect(first, () => {
      handshake1.reject(new Error("closed during handshake"));
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(mocks.FakeSession.instances[1]!.close).not.toHaveBeenCalled();
  });

  it("a stale session's late transport 'disconnected' doesn't drop the current one", async () => {
    const { result, first, handshake1 } = await parkedHandshakeThenTalkAgain();

    await resumeStaleConnect(first, () => {
      handshake1.resolve();
    });

    // Closing the stale session makes its transport report a disconnect, which
    // lands after the new Talk cleared the intentional-close flag.
    const onDisconnected = mocks.FakeTransport.instances[0]!.on.mock.calls.find(
      ([event]) => event === "disconnected",
    )?.[1] as () => void;

    await act(async () => {
      onDisconnected();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(mocks.FakeSession.instances[0]!.close).toHaveBeenCalled();
    expect(mocks.FakeSession.instances[1]!.close).not.toHaveBeenCalled();
  });
});
