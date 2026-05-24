// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, renderHook } from "@testing-library/preact";
import { type Mock, vi } from "vitest";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";

/** Shape of the FakeSession instance the test doubles construct. */
export interface FakeRealtimeSession {
  transport: { sendEvent: Mock };
  connectArgs: unknown;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  emit: (event: string, payload: unknown) => void;
  connect: (args: unknown) => Promise<void>;
  mute: Mock;
  interrupt: Mock;
  updateHistory: Mock;
  close: Mock;
}

/** Constructor + static registry of the FakeSession double. */
export interface FakeRealtimeSessionClass {
  new (agent: unknown, options: unknown): FakeRealtimeSession;
  instances: FakeRealtimeSession[];
}

/** Shape of the FakeTransport double (records its `.on` subscriptions). */
export interface FakeRealtimeTransport {
  on: Mock;
}

/** Constructor + static registry of the FakeTransport double. */
export interface FakeRealtimeTransportClass {
  new (): FakeRealtimeTransport;
  instances: FakeRealtimeTransport[];
}

/**
 * The mock doubles each test file builds via `vi.hoisted`. They must live in
 * the test file (vi.mock is hoisted per-file and can only reference same-file
 * `vi.hoisted` values), so the kit below receives them as a parameter rather
 * than owning them.
 */
export interface VoiceSessionMocks {
  FakeSession: FakeRealtimeSessionClass;
  FakeAgent: new (opts: unknown) => unknown;
  FakeTransport: FakeRealtimeTransportClass;
  createRealtimeMcpTools: Mock;
  fetchMock: Mock;
}

export interface BasicParams {
  mcpUrl?: string;
  voiceTokenUrl?: string;
  openAiKey?: string | null;
}

export type HookResult = ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceSession>, unknown>
>["result"];

export interface VoiceSessionTestKit {
  defaultParams: (overrides?: BasicParams) => {
    mcpUrl: string;
    voiceTokenUrl: string;
    openAiKey: string | null;
  };
  stubFetchOk: (body: unknown) => void;
  renderAndConnect: () => Promise<{ result: HookResult }>;
  connectAndGetSession: () => Promise<{
    result: HookResult;
    session: FakeRealtimeSession;
  }>;
  connectWithSeed: (seed: unknown[]) => Promise<HookResult>;
  emitResponseFailure: (
    session: FakeRealtimeSession,
    code: string,
    message: string,
  ) => Promise<void>;
  fireTransportDisconnect: () => void;
  teardownDuring: (step: "mcp" | "token") => Promise<{
    mcpClose: Mock;
    sessions: FakeRealtimeSession[];
  }>;
}

/**
 * A representative initialHistory covering every seeding branch: audio→text
 * rewrite, mixed (untranscribed audio dropped, typed text kept), an
 * only-untranscribed-audio item (dropped), a function_call (dropped), assistant
 * audio→text, pass-through assistant text, and a system message. Shared so the
 * seeding test reads as assertions rather than fixture setup.
 */
export const SEEDABLE_HISTORY_FIXTURE: unknown[] = [
  // user audio with transcript → input_text
  {
    itemId: "u-audio",
    type: "message",
    role: "user",
    status: "completed",
    content: [{ type: "input_audio", transcript: "earlier" }],
  },
  // user mixed: untranscribed audio is dropped, typed text survives
  {
    itemId: "u-mixed",
    type: "message",
    role: "user",
    status: "completed",
    content: [
      { type: "input_audio", transcript: null },
      { type: "input_text", text: "typed too" },
    ],
  },
  // user with only untranscribed audio → whole item dropped
  {
    itemId: "u-pending",
    type: "message",
    role: "user",
    status: "in_progress",
    content: [{ type: "input_audio", transcript: null }],
  },
  // function_call: dropped (SDK refuses to re-add)
  {
    itemId: "fc1",
    type: "function_call",
    status: "completed",
    name: "ppal-read-track",
    arguments: "{}",
    output: '{"ok":true}',
  },
  // assistant audio with transcript → output_text
  {
    itemId: "a-audio",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_audio", transcript: "ok" }],
  },
  // assistant pre-existing text → passes through
  {
    itemId: "a-text",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "reply" }],
  },
  // system message → passes through
  {
    itemId: "sys",
    type: "message",
    role: "system",
    content: [{ type: "input_text", text: "system note" }],
  },
];

/**
 * Build the shared render/connect helpers around a set of test doubles. The
 * doubles are created per test file via `vi.hoisted` (required for vi.mock
 * hoisting) and handed in here so the helper bodies live in one place.
 *
 * @param mocks - The FakeSession/FakeAgent/etc. doubles from the test file
 * @returns Render + connect + event-emit helpers bound to those doubles
 */
export function createVoiceSessionTestKit(
  mocks: VoiceSessionMocks,
): VoiceSessionTestKit {
  function defaultParams(overrides: BasicParams = {}) {
    return {
      mcpUrl: "http://localhost:3350/mcp",
      voiceTokenUrl: "http://localhost:3350/voice-token",
      openAiKey: "sk-test" as string | null,
      ...overrides,
    };
  }

  function stubFetchOk(body: unknown): void {
    mocks.fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  async function renderAndConnect(): Promise<{ result: HookResult }> {
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(async () => {
      await result.current.connect();
    });

    return { result };
  }

  async function connectAndGetSession(): Promise<{
    result: HookResult;
    session: FakeRealtimeSession;
  }> {
    stubFetchOk({ value: "ek_x" });
    const { result } = await renderAndConnect();

    // renderAndConnect just constructed exactly one session.
    const session = mocks.FakeSession.instances[0] as FakeRealtimeSession;

    return { result, session };
  }

  async function connectWithSeed(seed: unknown[]): Promise<HookResult> {
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(async () => {
      await result.current.connect(
        seed as Parameters<typeof result.current.connect>[0],
      );
    });

    return result;
  }

  async function emitResponseFailure(
    session: FakeRealtimeSession,
    code: string,
    message: string,
  ): Promise<void> {
    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: {
          status: "failed",
          status_details: { error: { code, message } },
        },
      });
    });
  }

  /**
   * Start connect(), then unmount mid-flight while a chosen await is still
   * pending, then let it resolve — reproducing the connect/unmount race. Used
   * to assert the generation guard closes resources and never opens a session.
   *
   * @param step - Which await to suspend on: "mcp" (tool setup) or "token"
   * @returns The MCP client's close spy and the constructed FakeSession list
   */
  async function teardownDuring(step: "mcp" | "token"): Promise<{
    mcpClose: Mock;
    sessions: FakeRealtimeSession[];
  }> {
    const mcpClose = vi.fn(async () => {});
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const tokenOk = () =>
      new Response(JSON.stringify({ value: "ek_x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    if (step === "mcp") {
      mocks.createRealtimeMcpTools.mockReturnValueOnce(
        gate.then(() => ({ tools: [], mcpClient: { close: mcpClose } })),
      );
      stubFetchOk({ value: "ek_x" });
    } else {
      mocks.createRealtimeMcpTools.mockResolvedValueOnce({
        tools: [],
        mcpClient: { close: mcpClose },
      });
      mocks.fetchMock.mockReturnValueOnce(gate.then(tokenOk));
    }

    const { result, unmount } = renderHook(() =>
      useVoiceSession(defaultParams()),
    );
    let connectPromise!: Promise<void>;

    await act(async () => {
      connectPromise = result.current.connect();
      // Pump past MCP setup (so "token" builds a session) and stop at the gate.
      await new Promise((r) => setTimeout(r, 0));
    });

    unmount();
    await act(async () => {
      release();
      await connectPromise;
    });

    return { mcpClose, sessions: mocks.FakeSession.instances };
  }

  /**
   * Invoke the handler the hook registered for the transport's "disconnected"
   * event on the first transport instance, simulating a connection drop.
   */
  function fireTransportDisconnect(): void {
    const transport = mocks.FakeTransport.instances[0];
    const call = transport?.on.mock.calls.find(
      ([event]) => event === "disconnected",
    );

    (call?.[1] as (() => void) | undefined)?.();
  }

  return {
    defaultParams,
    stubFetchOk,
    renderAndConnect,
    connectAndGetSession,
    connectWithSeed,
    emitResponseFailure,
    fireTransportDisconnect,
    teardownDuring,
  };
}
