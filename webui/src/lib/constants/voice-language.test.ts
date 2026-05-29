// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  buildGeminiVoiceInstructions,
  buildOpenAIVoiceInstructions,
  DEFAULT_VOICE_LANGUAGE,
  getVoiceLanguage,
  isValidVoiceLanguage,
  OPENAI_TRANSCRIPTION_MODEL,
  VOICE_LANGUAGES,
} from "#webui/lib/constants/voice-language";

describe("voice-language", () => {
  it("offers English first as the default", () => {
    expect(VOICE_LANGUAGES[0]?.code).toBe("en");
    expect(DEFAULT_VOICE_LANGUAGE).toBe("en");
    expect(OPENAI_TRANSCRIPTION_MODEL).toBe("gpt-realtime-whisper");
  });

  it("pairs each language with an ISO code, BCP-47 code, name, and label", () => {
    for (const lang of VOICE_LANGUAGES) {
      expect(lang.code).toMatch(/^[a-z]{2}$/);
      expect(lang.bcp47.length).toBeGreaterThan(0);
      expect(lang.name.length).toBeGreaterThan(0);
      expect(lang.label.length).toBeGreaterThan(0);
    }
  });

  describe("isValidVoiceLanguage", () => {
    it("accepts a known code and rejects an unknown one", () => {
      expect(isValidVoiceLanguage("es")).toBe(true);
      expect(isValidVoiceLanguage("xx")).toBe(false);
    });
  });

  describe("getVoiceLanguage", () => {
    it("resolves a known code to its record", () => {
      expect(getVoiceLanguage("es")).toMatchObject({
        code: "es",
        bcp47: "es-ES",
        name: "Spanish",
      });
    });

    it("falls back to English for unknown, null, or undefined", () => {
      expect(getVoiceLanguage("xx").code).toBe("en");
      expect(getVoiceLanguage(null).code).toBe("en");
      expect(getVoiceLanguage(undefined).code).toBe("en");
    });
  });

  describe("instruction builders", () => {
    const english = getVoiceLanguage("en");
    const spanish = getVoiceLanguage("es");

    it("locks both backends to the chosen language with anti-drift rules", () => {
      for (const instructions of [
        buildOpenAIVoiceInstructions(spanish),
        buildGeminiVoiceInstructions(spanish),
      ]) {
        expect(instructions).toContain("Respond only in Spanish.");
        expect(instructions).toContain(
          "Do not infer language from accent alone.",
        );
        expect(instructions).toContain("isolated foreign words");
        // The Producer Pal identity + connect bootstrap survive the rewrite.
        expect(instructions).toContain("Producer Pal");
        expect(instructions).toContain("ppal-connect");
      }
    });

    it("adds Google's emphatic phrasing only on the Gemini native-audio lock", () => {
      expect(buildGeminiVoiceInstructions(english)).toContain(
        "YOU MUST RESPOND UNMISTAKABLY IN ENGLISH.",
      );
      expect(buildGeminiVoiceInstructions(spanish)).toContain(
        "YOU MUST RESPOND UNMISTAKABLY IN SPANISH.",
      );
      // OpenAI relies on the anti-drift rules only — no emphatic shout block.
      expect(buildOpenAIVoiceInstructions(english)).not.toContain(
        "UNMISTAKABLY",
      );
    });
  });
});
