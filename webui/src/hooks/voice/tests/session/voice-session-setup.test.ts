// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it } from "vitest";
import {
  buildSessionOptions,
  toSeedableHistory,
} from "#webui/hooks/voice/helpers/voice-session-setup";
import { DEFAULT_VOICE_LANGUAGE } from "#webui/lib/constants/voice-language";

describe("buildSessionOptions", () => {
  it("defaults the transcription language to English when none is given", () => {
    const options = buildSessionOptions({} as never, {}) as {
      config: { audio: { input: { transcription: { language: string } } } };
    };

    expect(options.config.audio.input.transcription.language).toBe(
      DEFAULT_VOICE_LANGUAGE,
    );
  });
});

describe("toSeedableHistory", () => {
  it("rewrites an assistant audio message to text and drops one with no transcript", () => {
    const history = [
      {
        itemId: "1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "Hello" }],
      },
      {
        itemId: "2",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: null }],
      },
    ] as unknown as RealtimeItem[];

    const out = toSeedableHistory(history);

    expect(out).toHaveLength(1);
    expect(out[0]?.content).toStrictEqual([
      { type: "output_text", text: "Hello" },
    ]);
  });
});
