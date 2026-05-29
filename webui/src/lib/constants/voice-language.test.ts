// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  GEMINI_VOICE_INSTRUCTIONS,
  OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_VOICE_INSTRUCTIONS,
  VOICE_LANGUAGE_BCP47,
  VOICE_LANGUAGE_ISO,
  VOICE_LANGUAGE_NAME,
} from "#webui/lib/constants/voice-language";

describe("voice-language", () => {
  it("exposes English language codes", () => {
    expect(VOICE_LANGUAGE_NAME).toBe("English");
    expect(VOICE_LANGUAGE_ISO).toBe("en");
    expect(VOICE_LANGUAGE_BCP47).toBe("en-US");
    expect(OPENAI_TRANSCRIPTION_MODEL).toBe("gpt-realtime-whisper");
  });

  it("locks both backends to English with anti-drift rules", () => {
    for (const instructions of [
      OPENAI_VOICE_INSTRUCTIONS,
      GEMINI_VOICE_INSTRUCTIONS,
    ]) {
      expect(instructions).toContain("Respond only in English.");
      expect(instructions).toContain(
        "Do not infer language from accent alone.",
      );
      expect(instructions).toContain("isolated foreign words");
      // The Producer Pal identity + connect bootstrap survive the rewrite.
      expect(instructions).toContain("Producer Pal");
      expect(instructions).toContain("ppal-connect");
    }
  });

  it("adds Google's emphatic phrasing for the Gemini native-audio soft lock", () => {
    expect(GEMINI_VOICE_INSTRUCTIONS).toContain(
      "YOU MUST RESPOND UNMISTAKABLY IN ENGLISH.",
    );
    // OpenAI relies on the anti-drift rules only — no emphatic shout block.
    expect(OPENAI_VOICE_INSTRUCTIONS).not.toContain("UNMISTAKABLY");
  });
});
