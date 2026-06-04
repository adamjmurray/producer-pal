// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createVoiceSessionTestKit } from "./use-voice-session-test-helpers";

/* jscpd:ignore-start -- vitest mock harness must be defined inline per file
   (vi.hoisted runs before imports, so the doubles can't be shared); the
   FakeTransport here additionally simulates the SDK attaching the remote stream
   to our supplied element so the Web Audio graph can build. */
const mocks = vi.hoisted(() => {
  class FakeSession {
    static instances: FakeSession[] = [];
    transport = { sendEvent: vi.fn() };
    listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    connectArgs: unknown = null;
    constructor(
      public agent: unknown,
      public options: unknown,
    ) {
      FakeSession.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const arr = this.listeners.get(event) ?? [];

      arr.push(handler);
      this.listeners.set(event, arr);
    }

    emit(event: string, payload: unknown) {
      for (const h of this.listeners.get(event) ?? []) h(payload);
    }

    connect(args: unknown) {
      this.connectArgs = args;

      return Promise.resolve();
    }

    mute = vi.fn();
    interrupt = vi.fn();
    updateHistory = vi.fn();
    close = vi.fn();
  }

  class FakeAgent {
    constructor(opts: unknown) {
      Object.assign(this, opts as object);
    }
  }

  class FakeTransport {
    static instances: FakeTransport[] = [];
    on = vi.fn();
    constructor(public options?: unknown) {
      FakeTransport.instances.push(this);
      // Simulate the SDK's peerConnection.ontrack: attach a remote MediaStream
      // to the element we supplied, so createVoiceAudioGraph has a stream.
      const el = (options as { audioElement?: HTMLAudioElement } | undefined)
        ?.audioElement;

      if (el) el.srcObject = new MediaStream();
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

import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import {
  clampGain,
  createVoiceAudioGraph,
  setGraphGain,
  teardownVoiceAudioGraph,
  type VoiceAudioGraph,
} from "#webui/hooks/voice/voice-audio-graph";

const { defaultParams, stubFetchOk } = createVoiceSessionTestKit(mocks);

const REAL_FETCH = globalThis.fetch;
const REAL_AUDIO_CONTEXT = (globalThis as { AudioContext?: unknown })
  .AudioContext;
const REAL_WEBKIT = (globalThis as { webkitAudioContext?: unknown })
  .webkitAudioContext;

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeGain extends FakeNode {
  gain: { value: number };
}

interface FakeContext {
  destination: object;
  close: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
}

let gainNodes: FakeGain[] = [];
let sourceNodes: FakeNode[] = [];
let contexts: FakeContext[] = [];

/**
 * Install a fake AudioContext recording its source/gain nodes and lifecycle
 * calls on globalThis.
 *
 * @param options - Optional rejection switches for the lifecycle stubs
 * @param options.resumeRejects - Make resume() reject (best-effort coverage)
 * @param options.closeRejects - Make close() reject (best-effort coverage)
 */
function installFakeAudioContext(options?: {
  resumeRejects?: boolean;
  closeRejects?: boolean;
}): void {
  class FakeAudioContextImpl {
    destination = { kind: "destination" };
    createMediaStreamSource = vi.fn((): FakeNode => {
      const node: FakeNode = { connect: vi.fn(), disconnect: vi.fn() };

      sourceNodes.push(node);

      return node;
    });

    createGain = vi.fn((): FakeGain => {
      const node: FakeGain = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 0 },
      };

      gainNodes.push(node);

      return node;
    });

    resume = vi.fn(() =>
      options?.resumeRejects
        ? Promise.reject(new Error("resume failed"))
        : Promise.resolve(),
    );

    close = vi.fn(() =>
      options?.closeRejects
        ? Promise.reject(new Error("close failed"))
        : Promise.resolve(),
    );

    constructor() {
      contexts.push(this);
    }
  }

  (globalThis as { AudioContext?: unknown }).AudioContext =
    FakeAudioContextImpl as unknown as typeof AudioContext;
}

/**
 * A playback element whose srcObject is a real MediaStream (built by happy-dom).
 *
 * @returns An audio element with a MediaStream attached
 */
function elementWithStream(): HTMLAudioElement {
  const el = document.createElement("audio");

  el.srcObject = new MediaStream();

  return el;
}

beforeEach(() => {
  mocks.FakeSession.instances = [];
  mocks.FakeTransport.instances = [];
  mocks.createRealtimeMcpTools.mockResolvedValue({
    tools: [],
    mcpClient: { close: vi.fn(async () => {}) },
  });
  mocks.fetchMock.mockReset();
  globalThis.fetch = mocks.fetchMock as unknown as typeof globalThis.fetch;
  gainNodes = [];
  sourceNodes = [];
  contexts = [];
  installFakeAudioContext();
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  (globalThis as { AudioContext?: unknown }).AudioContext = REAL_AUDIO_CONTEXT;
  (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext =
    REAL_WEBKIT;
});

afterAll(() => {
  globalThis.fetch = REAL_FETCH;
  (globalThis as { AudioContext?: unknown }).AudioContext = REAL_AUDIO_CONTEXT;
});
/* jscpd:ignore-end */

describe("clampGain", () => {
  it("defaults undefined/NaN/Infinity to unity", () => {
    expect(clampGain(undefined)).toBe(1.0);
    expect(clampGain(Number.NaN)).toBe(1.0);
    expect(clampGain(Number.POSITIVE_INFINITY)).toBe(1.0);
  });

  it("passes through an in-range value, including boost above unity", () => {
    expect(clampGain(0.5)).toBe(0.5);
    expect(clampGain(1.2)).toBe(1.2);
  });

  it("clamps above the max (1.25) down and below the min (0) up", () => {
    expect(clampGain(5)).toBe(1.25);
    expect(clampGain(-3)).toBe(0);
  });
});

describe("createVoiceAudioGraph", () => {
  it("builds source → gain → destination, sets gain, mutes element, resumes", () => {
    const el = elementWithStream();
    const graph = createVoiceAudioGraph(el, 1.2);

    expect(graph).not.toBeNull();
    expect(contexts).toHaveLength(1);
    expect(gainNodes[0]!.gain.value).toBe(1.2);
    // source connects to gain; gain connects to the context destination.
    expect(sourceNodes[0]!.connect).toHaveBeenCalledWith(gainNodes[0]);
    expect(gainNodes[0]!.connect).toHaveBeenCalledWith(
      contexts[0]!.destination,
    );
    expect(el.muted).toBe(true);
    expect(contexts[0]!.resume).toHaveBeenCalled();
  });

  it("clamps the initial gain into [0, 1.25]", () => {
    createVoiceAudioGraph(elementWithStream(), 9);
    expect(gainNodes[0]!.gain.value).toBe(1.25);
  });

  it("returns null when the element is null", () => {
    expect(createVoiceAudioGraph(null, 1)).toBeNull();
    expect(contexts).toHaveLength(0);
  });

  it("returns null when the element has no MediaStream srcObject", () => {
    const el = document.createElement("audio");

    expect(createVoiceAudioGraph(el, 1)).toBeNull();
    expect(contexts).toHaveLength(0);
  });

  it("falls back to webkitAudioContext when AudioContext is absent", () => {
    const ctor = (globalThis as { AudioContext?: unknown }).AudioContext;

    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = ctor;

    const graph = createVoiceAudioGraph(elementWithStream(), 1);

    expect(graph).not.toBeNull();
    expect(contexts).toHaveLength(1);
  });

  it("returns null when no AudioContext implementation is available", () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext =
      undefined;

    expect(createVoiceAudioGraph(elementWithStream(), 1)).toBeNull();
  });

  it("swallows a rejected resume() (best-effort)", async () => {
    installFakeAudioContext({ resumeRejects: true });

    expect(createVoiceAudioGraph(elementWithStream(), 1)).not.toBeNull();
    // Let the rejected resume() microtask settle without an unhandled rejection.
    await Promise.resolve();
  });
});

describe("setGraphGain", () => {
  it("updates the GainNode with a clamped value", () => {
    const graph = createVoiceAudioGraph(elementWithStream(), 1)!;

    setGraphGain(graph, 1.25);
    expect(graph.gain.gain.value).toBe(1.25);

    setGraphGain(graph, 9);
    expect(graph.gain.gain.value).toBe(1.25);

    setGraphGain(graph, 0.3);
    expect(graph.gain.gain.value).toBe(0.3);
  });

  it("is a no-op when there is no graph", () => {
    expect(() => setGraphGain(null, 1)).not.toThrow();
  });
});

describe("teardownVoiceAudioGraph", () => {
  it("disconnects both nodes and closes the context", () => {
    const graph = createVoiceAudioGraph(elementWithStream(), 1)!;

    teardownVoiceAudioGraph(graph);

    expect(graph.source.disconnect).toHaveBeenCalled();
    expect(graph.gain.disconnect).toHaveBeenCalled();
    expect(contexts[0]!.close).toHaveBeenCalled();
  });

  it("is a no-op when there is no graph", () => {
    expect(() => teardownVoiceAudioGraph(null)).not.toThrow();
  });

  it("swallows disconnect/close errors (best-effort)", async () => {
    installFakeAudioContext({ closeRejects: true });
    const graph = createVoiceAudioGraph(elementWithStream(), 1)!;

    (graph.source.disconnect as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("source boom");
      },
    );
    (graph.gain.disconnect as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("gain boom");
      },
    );

    expect(() => teardownVoiceAudioGraph(graph)).not.toThrow();
    await Promise.resolve();
  });

  it("tears down a graph object built from mocked parts", () => {
    const fakeGraph = {
      context: { close: vi.fn(() => Promise.resolve()) },
      source: { disconnect: vi.fn() },
      gain: { disconnect: vi.fn() },
    } as unknown as VoiceAudioGraph;

    teardownVoiceAudioGraph(fakeGraph);
    expect(fakeGraph.source.disconnect).toHaveBeenCalled();
  });
});

describe("useVoiceSession output volume (Web Audio gain)", () => {
  it("builds the gain graph on connect with the initial volume above unity", async () => {
    stubFetchOk({ value: "ek_x" });

    const { result } = renderHook(() =>
      useVoiceSession({ ...defaultParams(), volume: 1.2 }),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
    expect(contexts).toHaveLength(1);
    // The element supplied to the transport is muted; gain carries the loudness.
    const el = (
      mocks.FakeTransport.instances[0]!.options as {
        audioElement: HTMLAudioElement;
      }
    ).audioElement;

    expect(el.muted).toBe(true);
    expect(gainNodes).toHaveLength(1);
    expect(gainNodes[0]!.gain.value).toBe(1.2);
  });

  it("drives the GainNode (above unity) when volume changes mid-session", async () => {
    stubFetchOk({ value: "ek_x" });

    const { result, rerender } = renderHook(
      (props: { volume: number }) =>
        useVoiceSession({ ...defaultParams(), volume: props.volume }),
      { initialProps: { volume: 1.0 } },
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(gainNodes[0]!.gain.value).toBe(1.0);

    await act(() => {
      rerender({ volume: 1.25 });
    });

    expect(gainNodes[0]!.gain.value).toBe(1.25);
  });

  it("tears down the gain graph (disconnect + close) on disconnect", async () => {
    stubFetchOk({ value: "ek_x" });

    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(async () => {
      await result.current.connect();
    });

    const gain = gainNodes[0]!;

    await act(async () => {
      await result.current.disconnect();
    });

    expect(gain.disconnect).toHaveBeenCalled();
    expect(contexts[0]!.close).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
});
