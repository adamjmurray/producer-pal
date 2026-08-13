// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => {
  const constructed: { options: unknown }[] = [];
  const agents: { options: unknown }[] = [];

  class SessionDouble {
    options: unknown;
    on = vi.fn();
    close = vi.fn();
    constructor(_agent: unknown, options: unknown) {
      this.options = options;
      constructed.push(this);
    }

    connect(): Promise<void> {
      return Promise.resolve();
    }
  }

  class AgentDouble {
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      agents.push(this);
    }
  }

  return {
    constructed,
    agents,
    module: {
      RealtimeAgent: AgentDouble as never,
      RealtimeSession: SessionDouble as never,
      OpenAIRealtimeWebRTC: class {
        on = vi.fn();
      } as never,
    },
    mcpTools: vi.fn(),
    fetchSpy: vi.fn(),
  };
});

vi.mock(import("@openai/agents/realtime"), () => realtime.module);
vi.mock(import("#webui/hooks/voice/realtime-mcp-tools"), () => ({
  createRealtimeMcpTools: realtime.mcpTools,
}));

import { mapThinkingToRealtimeEffort } from "#webui/hooks/settings/config-builders";
import { VOICE_SPEED_DEFAULT } from "#webui/hooks/settings/settings-helpers";
import {
  DEFAULT_TURN_DETECTION,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";

const ORIGINAL_FETCH = globalThis.fetch;

const PARAMS = {
  mcpUrl: "http://localhost:3350/mcp",
  voiceTokenUrl: "http://localhost:3350/voice-token",
  openAiKey: "sk-test",
};

beforeEach(() => {
  realtime.constructed.length = 0;
  realtime.agents.length = 0;
  realtime.mcpTools.mockResolvedValue({
    tools: [],
    mcpClient: { close: vi.fn(async () => {}) },
  });
  realtime.fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ value: "ek_token" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  globalThis.fetch = realtime.fetchSpy as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

/**
 * Connect the hook with the given params and return the audio config that was
 * passed to the realtime session constructor.
 * @param params - useVoiceSession params
 * @returns The constructed session's audio config
 */
async function connectAndReadAudio(
  params: Parameters<typeof useVoiceSession>[0],
): Promise<{
  input?: { turnDetection?: unknown; transcription?: unknown };
}> {
  const { result } = renderHook(() => useVoiceSession(params));

  await act(async () => {
    await result.current.connect();
  });

  const options = realtime.constructed[0]!.options as {
    config: {
      audio: { input?: { turnDetection?: unknown; transcription?: unknown } };
    };
  };

  return options.config.audio;
}

describe("useVoiceSession turn-detection config", () => {
  it("maps server_vad turnDetection into audio.input", async () => {
    const turnDetection: TurnDetectionSettings = {
      ...DEFAULT_TURN_DETECTION,
      mode: "server_vad",
      threshold: 0.7,
      silenceDurationMs: 350,
      eagerness: "auto",
      interruptResponse: true,
    };

    const audio = await connectAndReadAudio({ ...PARAMS, turnDetection });

    expect(audio.input?.turnDetection).toStrictEqual({
      type: "server_vad",
      threshold: 0.7,
      silence_duration_ms: 350,
      interrupt_response: true,
    });
  });

  it("omits turnDetection but keeps the transcription side-channel when no turnDetection is provided", async () => {
    const audio = await connectAndReadAudio(PARAMS);

    expect(audio.input?.turnDetection).toBeUndefined();
    expect(audio.input?.transcription).toStrictEqual({
      model: "gpt-transcribe",
      language: "en",
    });
  });

  it("pins the ASR transcription language alongside turnDetection", async () => {
    const turnDetection: TurnDetectionSettings = {
      ...DEFAULT_TURN_DETECTION,
      mode: "server_vad",
    };

    const audio = await connectAndReadAudio({ ...PARAMS, turnDetection });

    expect(audio.input?.transcription).toStrictEqual({
      model: "gpt-transcribe",
      language: "en",
    });
    expect(audio.input?.turnDetection).toBeDefined();
  });

  it("threads a selected language into transcription and agent instructions", async () => {
    const audio = await connectAndReadAudio({ ...PARAMS, language: "es" });

    expect(audio.input?.transcription).toStrictEqual({
      model: "gpt-transcribe",
      language: "es",
    });
    const agentOptions = realtime.agents[0]!.options as {
      instructions?: string;
    };

    expect(agentOptions.instructions).toContain("Respond only in Spanish.");
  });
});

describe("useVoiceSession session config wiring", () => {
  it("passes the output speed into the session config", async () => {
    await connectAndReadAudio({ ...PARAMS, speed: 1.25 });
    const { config } = realtime.constructed[0]!.options as {
      config: { audio: { output?: { speed?: number } } };
    };

    expect(config.audio.output?.speed).toBe(1.25);
  });

  it("defaults the output speed when none is provided", async () => {
    await connectAndReadAudio(PARAMS);
    const { config } = realtime.constructed[0]!.options as {
      config: { audio: { output?: { speed?: number } } };
    };

    expect(config.audio.output?.speed).toBe(VOICE_SPEED_DEFAULT);
  });

  it("maps thinking into reasoning.effort", async () => {
    await connectAndReadAudio({ ...PARAMS, thinking: "Max" });
    const { config } = realtime.constructed[0]!.options as {
      config: { reasoning?: { effort?: string } };
    };

    expect(config.reasoning?.effort).toBe(mapThinkingToRealtimeEffort("Max"));
  });

  it("omits reasoning when thinking maps to no effort", async () => {
    await connectAndReadAudio({ ...PARAMS, thinking: "Default" });
    const { config } = realtime.constructed[0]!.options as {
      config: { reasoning?: unknown };
    };

    expect(config.reasoning).toBeUndefined();
  });

  it("bakes the voice into the RealtimeAgent", async () => {
    await connectAndReadAudio({ ...PARAMS, voice: "cedar" });
    const agentOptions = realtime.agents[0]!.options as { voice?: string };

    expect(agentOptions.voice).toBe("cedar");
  });

  it("threads the selected model into the session config", async () => {
    await connectAndReadAudio({ ...PARAMS, model: "gpt-4o-realtime-preview" });
    const { model } = realtime.constructed[0]!.options as { model?: string };

    expect(model).toBe("gpt-4o-realtime-preview");
  });

  it("defaults the session model when none is provided", async () => {
    await connectAndReadAudio(PARAMS);
    const { model } = realtime.constructed[0]!.options as { model?: string };

    expect(model).toBe(OPENAI_REALTIME_MODEL);
  });

  it("threads the selected model into the /voice-token request body", async () => {
    await connectAndReadAudio({ ...PARAMS, model: "gpt-4o-realtime-preview" });
    const tokenBody = JSON.parse(
      (realtime.fetchSpy.mock.calls[0]![1] as { body: string }).body,
    ) as { model: string };

    expect(tokenBody.model).toBe("gpt-4o-realtime-preview");
  });
});
