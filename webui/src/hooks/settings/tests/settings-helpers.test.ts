// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_TOOL_STEPS,
  MAX_TOOL_STEPS_LIMIT,
  MIN_TOOL_STEPS,
} from "#webui/chat/sdk/step-budget";
import { DEFAULT_REALTIME_VOICE } from "#webui/lib/constants/models";
import { encryptApiKey, isEncrypted } from "#webui/lib/api-key-crypto";
import {
  checkHasApiKey,
  loadAllProviderSettingsAsync,
  loadCurrentProvider,
  loadMaxToolSteps,
  loadSubagentPresetId,
  loadEnabledTools,
  loadProviderSettings,
  loadProviderSettingsAsync,
  loadRealtimeVoice,
  loadVoiceLanguage,
  loadVoiceSpeed,
  loadVoiceVolume,
  saveMaxToolSteps,
  saveSubagentPresetId,
  saveProviderSettings,
  saveRealtimeVoice,
  saveVoiceLanguage,
  saveVoiceSpeed,
  saveVoiceVolume,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/settings-helpers";

describe("settings-helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("apiKey encryption at rest", () => {
    it("save writes an encrypted (not cleartext) apiKey to localStorage", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
      });

      const raw = JSON.parse(
        localStorage.getItem("producer_pal_provider_anthropic") ?? "{}",
      );

      expect(raw.apiKey).not.toBe("sk-ant-secret");
      expect(isEncrypted(raw.apiKey)).toBe(true);
    });

    it("load decrypts a saved apiKey back to cleartext", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
      });

      const loaded = await loadProviderSettingsAsync("anthropic");

      expect(loaded.apiKey).toBe("sk-ant-secret");
    });

    it("synchronous load blanks the apiKey (placeholder)", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
      });

      // The synchronous loader must not surface ciphertext; it returns "".
      expect(loadProviderSettings("anthropic").apiKey).toBe("");
    });

    it("loads a legacy cleartext apiKey unchanged (migration passthrough)", async () => {
      localStorage.setItem(
        "producer_pal_provider_openai",
        JSON.stringify({ apiKey: "sk-legacy-cleartext", model: "gpt-5.5" }),
      );

      const loaded = await loadProviderSettingsAsync("openai");

      expect(loaded.apiKey).toBe("sk-legacy-cleartext");
    });

    it("removes the legacy plaintext gemini_api_key after a Gemini save", async () => {
      localStorage.setItem("gemini_api_key", "AIza-old-cleartext");

      await saveProviderSettings("gemini", {
        apiKey: "AIza-new",
        model: "gemini-2.5-flash",
        thinking: "Default",
      });

      expect(localStorage.getItem("gemini_api_key")).toBeNull();
      const raw = JSON.parse(
        localStorage.getItem("producer_pal_provider_gemini") ?? "{}",
      );

      expect(isEncrypted(raw.apiKey)).toBe(true);
    });

    it("leaves the legacy gemini_api_key alone when saving a non-Gemini provider", async () => {
      localStorage.setItem("gemini_api_key", "AIza-old-cleartext");

      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
      });

      expect(localStorage.getItem("gemini_api_key")).toBe("AIza-old-cleartext");
    });

    it("save with empty apiKey stores empty (nothing to encrypt)", async () => {
      await saveProviderSettings("openai", {
        apiKey: "",
        model: "gpt-5.5",
        thinking: "Default",
      });

      const raw = JSON.parse(
        localStorage.getItem("producer_pal_provider_openai") ?? "{}",
      );

      expect(raw.apiKey).toBe("");
    });
  });

  describe("loadAllProviderSettingsAsync resilience", () => {
    it("blanks only the undecryptable provider, keeping the rest intact", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await saveProviderSettings("anthropic", {
        apiKey: "sk-anthropic-good",
        model: "claude-sonnet-4-6",
        thinking: "Default",
      });

      // Forge an undecryptable envelope for openai: a real IV paired with a
      // ciphertext from a different encryption, so AES-GCM authentication fails.
      // Without per-key fail-safe decryption this rejection would propagate
      // through Promise.all and blank EVERY provider's key (finding #3).
      const [ivA] = envelopeParts(await encryptApiKey("seed-a"));
      const [, ctB] = envelopeParts(await encryptApiKey("seed-b"));

      localStorage.setItem(
        "producer_pal_provider_openai",
        JSON.stringify({ apiKey: `enc:v1:${ivA}:${ctB}`, model: "gpt-5.5" }),
      );

      const all = await loadAllProviderSettingsAsync();

      expect(all.anthropic.apiKey).toBe("sk-anthropic-good");
      expect(all.openai.apiKey).toBe("");
      warnSpy.mockRestore();
    });
  });

  describe("checkHasApiKey presence detection", () => {
    it("detects presence for an encrypted apiKey (without decrypting)", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
      });

      expect(checkHasApiKey("anthropic")).toBe(true);
    });

    it("detects presence for a legacy cleartext apiKey", () => {
      localStorage.setItem(
        "producer_pal_provider_openai",
        JSON.stringify({ apiKey: "sk-legacy-cleartext" }),
      );

      expect(checkHasApiKey("openai")).toBe(true);
    });

    it("returns false when no apiKey is stored", () => {
      expect(checkHasApiKey("anthropic")).toBe(false);
    });

    it("detects the legacy standalone gemini_api_key", () => {
      localStorage.setItem("gemini_api_key", "AIza-old-cleartext");

      expect(checkHasApiKey("gemini")).toBe(true);
    });
  });

  describe("loadProviderSettings", () => {
    it("migrates port to baseUrl when baseUrl is missing", () => {
      localStorage.setItem(
        "producer_pal_provider_lmstudio",
        JSON.stringify({ port: 5678 }),
      );

      const settings = loadProviderSettings("lmstudio");

      expect(settings.baseUrl).toBe("http://localhost:5678/v1");
    });

    it("does not overwrite existing baseUrl during port migration", () => {
      localStorage.setItem(
        "producer_pal_provider_lmstudio",
        JSON.stringify({ port: 5678, baseUrl: "http://custom:9999" }),
      );

      const settings = loadProviderSettings("lmstudio");

      expect(settings.baseUrl).toBe("http://custom:9999");
    });

    it("falls through to defaults on invalid JSON", () => {
      localStorage.setItem(
        "producer_pal_provider_anthropic",
        "not-valid-json{{{",
      );

      const settings = loadProviderSettings("anthropic");

      expect(settings.apiKey).toBe("");
      expect(settings.model).toBe("claude-sonnet-5");
    });
  });

  describe("checkHasApiKey", () => {
    it("returns false for invalid JSON in saved data", () => {
      localStorage.setItem("producer_pal_provider_anthropic", "bad-json{");

      expect(checkHasApiKey("anthropic")).toBe(false);
    });
  });

  describe("loadCurrentProvider", () => {
    it("returns gemini when nothing is stored", () => {
      expect(loadCurrentProvider()).toBe("gemini");
    });

    it("returns a valid stored provider", () => {
      localStorage.setItem("producer_pal_current_provider", "anthropic");

      expect(loadCurrentProvider()).toBe("anthropic");
    });

    it("falls back to the legacy 'provider' key", () => {
      localStorage.setItem("provider", "openai");

      expect(loadCurrentProvider()).toBe("openai");
    });

    it("falls back to gemini for an unrecognized stored provider", () => {
      localStorage.setItem("producer_pal_current_provider", "deepmind-9000");

      expect(loadCurrentProvider()).toBe("gemini");
    });

    it("falls back to gemini for an unrecognized legacy provider", () => {
      localStorage.setItem("provider", "");

      expect(loadCurrentProvider()).toBe("gemini");
    });
  });

  describe("loadEnabledTools", () => {
    it("returns empty object for invalid JSON in saved data", () => {
      localStorage.setItem("producer_pal_enabled_tools", "not-json");

      expect(loadEnabledTools()).toStrictEqual({});
    });
  });

  describe("subagent preset persistence", () => {
    it("returns null when nothing is stored (inherit)", () => {
      expect(loadSubagentPresetId()).toBeNull();
    });

    it("round-trips a preset id through localStorage", () => {
      saveSubagentPresetId("preset-abc");
      expect(loadSubagentPresetId()).toBe("preset-abc");
    });

    it("clears the stored id when saving null (back to inherit)", () => {
      saveSubagentPresetId("preset-abc");
      saveSubagentPresetId(null);

      expect(loadSubagentPresetId()).toBeNull();
      expect(localStorage.getItem("producer_pal_subagent_preset")).toBeNull();
    });
  });

  describe("tool-step budget persistence", () => {
    it("returns the shipped default when nothing is stored", () => {
      expect(loadMaxToolSteps()).toBe(DEFAULT_MAX_TOOL_STEPS);
    });

    it("round-trips a budget through localStorage", () => {
      saveMaxToolSteps(40);
      expect(loadMaxToolSteps()).toBe(40);
    });

    it.each([
      ["below the floor", MIN_TOOL_STEPS - 1],
      ["above the ceiling", MAX_TOOL_STEPS_LIMIT + 1],
      ["fractional", 12.5],
    ])("clears the key rather than storing a %s value", (_label, steps) => {
      saveMaxToolSteps(40);
      saveMaxToolSteps(steps);

      expect(loadMaxToolSteps()).toBe(DEFAULT_MAX_TOOL_STEPS);
      expect(localStorage.getItem("producer_pal_max_tool_steps")).toBeNull();
    });

    it.each([
      ["garbage", "not-a-number"],
      ["out of range", "5000"],
      ["empty", ""],
    ])("falls back to the default on a %s stored value", (_label, raw) => {
      // A hand-edited localStorage must not strand a turn at one step or let it
      // run away — the load path re-validates rather than trusting the save.
      localStorage.setItem("producer_pal_max_tool_steps", raw);

      expect(loadMaxToolSteps()).toBe(DEFAULT_MAX_TOOL_STEPS);
    });
  });

  describe("voice speed persistence", () => {
    it("returns the default speed when no value is stored", () => {
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_DEFAULT);
    });

    it("round-trips through localStorage", () => {
      saveVoiceSpeed(1.25);
      expect(loadVoiceSpeed()).toBe(1.25);
    });

    it("clamps stored values above the max down to the max", () => {
      saveVoiceSpeed(99);
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_MAX);
    });

    it("clamps stored values below the min up to the min", () => {
      saveVoiceSpeed(0.1);
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_MIN);
    });

    it("falls back to default on unparseable values", () => {
      localStorage.setItem("producer_pal_voice_speed", "not-a-number");
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_DEFAULT);
    });
  });

  describe("voice volume persistence", () => {
    it("returns unity when no value is stored (existing users default)", () => {
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_DEFAULT);
    });

    it("round-trips through localStorage", () => {
      saveVoiceVolume(0.5);
      expect(loadVoiceVolume()).toBe(0.5);
    });

    it("clamps stored values above the max down to the max", () => {
      saveVoiceVolume(5);
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_MAX);
    });

    it("clamps stored values below the min up to the min", () => {
      saveVoiceVolume(-1);
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_MIN);
    });

    it("falls back to default on unparseable values", () => {
      localStorage.setItem("producer_pal_voice_volume", "not-a-number");
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_DEFAULT);
    });
  });

  // The two providers share one stored field, so a Gemini voice has to survive
  // a reload even though it is not an OpenAI voice id.
  describe("realtime voice persistence", () => {
    it("returns the default when nothing is stored", () => {
      expect(loadRealtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
    });

    it("round-trips an OpenAI voice", () => {
      saveRealtimeVoice("marin");
      expect(loadRealtimeVoice()).toBe("marin");
    });

    it("round-trips a Gemini voice", () => {
      saveRealtimeVoice("Puck");
      expect(loadRealtimeVoice()).toBe("Puck");
    });

    it("falls back to the default for an unknown stored voice", () => {
      saveRealtimeVoice("not-a-voice");
      expect(loadRealtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
    });
  });

  describe("voice language persistence", () => {
    it("returns English when no value is stored", () => {
      expect(loadVoiceLanguage()).toBe("en");
    });

    it("round-trips a valid language through localStorage", () => {
      saveVoiceLanguage("es");
      expect(loadVoiceLanguage()).toBe("es");
    });

    it("falls back to English for an unknown stored code", () => {
      localStorage.setItem("producer_pal_voice_language", "xx");
      expect(loadVoiceLanguage()).toBe("en");
    });
  });
});

/**
 * Split an `enc:v1:<iv>:<ciphertext>` envelope into its base64 IV and ciphertext
 * parts. encryptApiKey always emits exactly those two segments.
 * @param {string} envelope - An enc:v1: envelope from encryptApiKey
 * @returns {[string, string]} The base64 IV and ciphertext
 */
function envelopeParts(envelope: string): [string, string] {
  const [iv, ciphertext] = envelope.slice("enc:v1:".length).split(":");

  return [iv as string, ciphertext as string];
}
