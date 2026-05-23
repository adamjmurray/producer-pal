// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, renderHook } from "@testing-library/preact";
import { type Mock } from "vitest";
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

/**
 * The mock doubles each test file builds via `vi.hoisted`. They must live in
 * the test file (vi.mock is hoisted per-file and can only reference same-file
 * `vi.hoisted` values), so the kit below receives them as a parameter rather
 * than owning them.
 */
export interface VoiceSessionMocks {
  FakeSession: FakeRealtimeSessionClass;
  FakeAgent: new (opts: unknown) => unknown;
  FakeTransport: new () => unknown;
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
}

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

  return {
    defaultParams,
    stubFetchOk,
    renderAndConnect,
    connectAndGetSession,
    connectWithSeed,
    emitResponseFailure,
  };
}
