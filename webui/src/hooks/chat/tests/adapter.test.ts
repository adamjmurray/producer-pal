// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { SYSTEM_INSTRUCTION } from "#webui/lib/config";

// Mock provider-factories to avoid real OpenAI client creation
const mockModel = { modelId: "test-model" } as unknown as LanguageModel;

vi.mock(import("#webui/chat/sdk/provider-factories"), () => ({
  createProviderModel: vi.fn(() => mockModel),
}));

import { createProviderModel } from "#webui/chat/sdk/provider-factories";
import { chatAdapter } from "#webui/hooks/chat/adapter";

describe("chatAdapter", () => {
  describe("createClient", () => {
    it("creates a ChatSdkClient instance", () => {
      const config = {
        model: {
          modelId: "test",
          provider: "openai",
          specificationVersion: "v3",
        } as never,
      };
      const client = chatAdapter.createClient("test-key", config);

      expect(client).toBeDefined();
      expect(client.chatHistory).toStrictEqual([]);
    });

    it("passes chat history from config", () => {
      const chatHistory: ChatMessage[] = [{ role: "user", content: "Hello" }];
      const config = {
        model: {
          modelId: "test",
          provider: "openai",
          specificationVersion: "v3",
        } as never,
        chatHistory,
      };
      const client = chatAdapter.createClient("test-key", config);

      expect(client.chatHistory).toStrictEqual(chatHistory);
    });
  });

  describe("buildConfig", () => {
    /**
     * Build a config for one provider's thinking mapping — the axis these
     * cases vary. Model and thinking default to the Anthropic pair most of
     * them use.
     * @param provider - Provider id passed through extraParams
     * @param thinking - Thinking level to map
     * @param model - Model id
     * @returns The built config
     */
    const buildForProvider = (
      provider: string,
      thinking = "Default",
      model = "claude-sonnet-4-6-20250514",
    ) =>
      chatAdapter.buildConfig(model, thinking, {}, undefined, {
        ...extraParams,
        provider,
      });
    const extraParams = {
      provider: "openai",
      apiKey: "test-key",
      baseUrl: undefined,
    };

    it("carries smallModelMode from extraParams onto the config", () => {
      const on = chatAdapter.buildConfig("gpt-4o", "default", {}, undefined, {
        ...extraParams,
        smallModelMode: true,
      });

      expect(on.smallModelMode).toBe(true);

      // Absent in extraParams coerces to false so the header is always explicit.
      const off = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        extraParams,
      );

      expect(off.smallModelMode).toBe(false);
    });

    it("carries the current notation onto the config for a new conversation", () => {
      // Without this the chat sent no notation header at all and every request
      // fell through to the device global, so flipping the dropdown re-taught an
      // open conversation mid-turn.
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        {
          ...extraParams,
          notation: "stark",
        },
      );

      expect(config.notation).toBe("stark");
    });

    it("uses a locked notation over the current setting", () => {
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        {
          ...extraParams,
          lockedNotation: "stark",
          notation: "barbeat",
        },
      );

      expect(config.notation).toBe("stark");
    });

    it("omits the notation key entirely when the caller has none", () => {
      // Present-but-undefined would read as an opinion; the key has to be absent
      // so the request carries no header and the device global still wins.
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        extraParams,
      );

      expect(config).not.toHaveProperty("notation");
    });

    it("passes enabled tools to config", () => {
      const enabledTools = { "ppal-connect": true, "ppal-read": false };
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        enabledTools,
        undefined,
        extraParams,
      );

      expect(config.enabledTools).toStrictEqual(enabledTools);
    });

    it("passes chat history to config", () => {
      const history: ChatMessage[] = [{ role: "user", content: "Hello" }];
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        history,
        extraParams,
      );

      expect(config.chatHistory).toStrictEqual(history);
    });

    it("uses the built-in system instruction when no override is provided", () => {
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        extraParams,
      );

      expect(config.systemInstruction).toBe(SYSTEM_INSTRUCTION);
    });

    it("fully replaces the system instruction with a non-blank override", () => {
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        {
          ...extraParams,
          systemInstructionOverride: "You are a terse studio engineer.",
        },
      );

      expect(config.systemInstruction).toBe("You are a terse studio engineer.");
    });

    it("falls back to the built-in instruction when the override is blank", () => {
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        { ...extraParams, systemInstructionOverride: "   \n  " },
      );

      expect(config.systemInstruction).toBe(SYSTEM_INSTRUCTION);
    });

    it("uses a locked system instruction over the current override", () => {
      // A restored conversation carries its locked snapshot; it wins over the
      // current global override so continuing the chat sends what it started
      // with.
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        {
          ...extraParams,
          lockedSystemInstruction: "Locked prompt from when the chat started.",
          systemInstructionOverride: "A newer global override.",
        },
      );

      expect(config.systemInstruction).toBe(
        "Locked prompt from when the chat started.",
      );
    });

    it("sets reasoning effort and summary for openai reasoning model with Max thinking", () => {
      const config = buildForProvider("openai", "Max", "o3-mini");

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "high", reasoningSummary: "auto" },
      });
    });

    it("includes reasoningSummary for an openai reasoning model", () => {
      const config = buildForProvider("openai", "Max", "gpt-5.2");

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "xhigh", reasoningSummary: "auto" },
      });
    });

    it("sets reasoningEffort and reasoningSummary for openai reasoning model with Default thinking", () => {
      const config = buildForProvider("openai", "Default", "gpt-5.2");

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "medium", reasoningSummary: "auto" },
      });
    });

    it("returns undefined providerOptions for an openai reasoning model with Off thinking", () => {
      const config = buildForProvider("openai", "Off", "o3-mini");

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets reasoning for openrouter provider with Max thinking", () => {
      const config = buildForProvider("openrouter", "Max", "some-model");

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "xhigh",
          },
        },
      });
    });

    it("sets Gemini thinkingConfig for Max thinking", () => {
      const config = buildForProvider("gemini", "Max", "gemini-2.5-flash");

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 16384,
            includeThoughts: true,
          },
        },
      });
    });

    it("sets Gemini thinkingConfig with -1 budget for Default thinking", () => {
      const config = buildForProvider("gemini", "Default", "gemini-2.0-flash");

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: -1,
            includeThoughts: true,
          },
        },
      });
    });

    it("returns undefined providerOptions for Gemini with Off thinking", () => {
      const config = buildForProvider("gemini", "Off", "gemini-2.0-flash");

      expect(config.providerOptions).toBeUndefined();
    });

    it("returns undefined providerOptions for default thinking", () => {
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        "default",
        {},
        undefined,
        extraParams,
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets ollama think option for supported model", () => {
      const config = buildForProvider("ollama", "Max", "qwq");

      expect(config.providerOptions).toStrictEqual({
        openai: { think: true },
      });
    });

    it("sets ollama think:false for Off thinking", () => {
      const config = buildForProvider("ollama", "Off", "qwq");

      expect(config.providerOptions).toStrictEqual({
        openai: { think: false },
      });
    });

    it("returns undefined providerOptions for ollama with Default thinking", () => {
      const config = buildForProvider("ollama", "Default", "llama3");

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets medium reasoning effort for openrouter with Default thinking", () => {
      const config = buildForProvider("openrouter", "Default", "some-model");

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "medium",
          },
        },
      });
    });

    it("returns undefined providerOptions for openrouter with Off thinking", () => {
      const config = buildForProvider("openrouter", "Off", "some-model");

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets anthropic adaptive thinking with max effort for Max thinking", () => {
      const config = buildForProvider("anthropic", "Max");

      expect(config.providerOptions).toStrictEqual({
        anthropic: {
          thinking: { type: "adaptive" },
          effort: "max",
        },
      });
    });

    it("sets anthropic adaptive thinking with high effort for Default thinking", () => {
      const config = buildForProvider("anthropic");

      expect(config.providerOptions).toStrictEqual({
        anthropic: {
          thinking: { type: "adaptive" },
          effort: "high",
        },
      });
    });

    it("returns undefined provider options for anthropic with Off thinking", () => {
      const config = buildForProvider("anthropic", "Off");

      expect(config.providerOptions).toBeUndefined();
    });

    it("uses legacy enabled thinking for haiku model", () => {
      const config = buildForProvider("anthropic", "Max", "claude-haiku-4-5");

      expect(config.providerOptions).toStrictEqual({
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 16384 },
        },
      });
    });

    it("omits thinking for a pre-3.7 anthropic model even when thinking is active", () => {
      // Pre-3.7 ids (only reachable via the "Other..." input) reject any
      // `thinking` field with a 400, so no adaptive payload must be sent.
      const config = buildForProvider(
        "anthropic",
        "Max",
        "claude-3-5-sonnet-20241022",
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("returns undefined provider options for mistral provider", () => {
      const config = buildForProvider("mistral", "Max", "mistral-large");

      expect(config.providerOptions).toBeUndefined();
    });

    it("buildProviderOptions callback rebuilds options with overridden thinking", () => {
      const config = buildForProvider("anthropic", "Max");

      // Original config has Max thinking (adaptive with max effort)
      expect(config.providerOptions).toStrictEqual({
        anthropic: { thinking: { type: "adaptive" }, effort: "max" },
      });

      // Callback rebuilds with overridden thinking level
      const overridden = config.buildProviderOptions!("Off");

      expect(overridden).toBeUndefined();
    });

    describe("subagentConfig from a subagent preset", () => {
      const subagentPreset = {
        provider: "openai" as const,
        apiKey: "worker-key",
        baseUrl: undefined,
        model: "gpt-5.2",
        thinking: "Max",
        smallModelMode: true,
      };

      it("builds the worker override from the resolved preset", () => {
        const config = chatAdapter.buildConfig("gpt-4o", "Off", {}, undefined, {
          ...extraParams,
          subagentPreset,
        });

        expect(config.subagentConfig?.model).toBe(mockModel);
        expect(config.subagentConfig?.smallModelMode).toBe(true);
        // The worker override uses the PRESET's model+thinking (gpt-5.2 / Max),
        // independent of the orchestrator's (gpt-4o / Off → no options).
        expect(config.providerOptions).toBeUndefined();
        expect(config.subagentConfig?.providerOptions).toStrictEqual({
          openai: { reasoningEffort: "xhigh", reasoningSummary: "auto" },
        });
        // The worker's buildProviderOptions rebuilds against the preset's model
        // (gpt-5.2 reasoning model) — Off yields no options.
        expect(
          config.subagentConfig?.buildProviderOptions?.("Off"),
        ).toBeUndefined();
      });

      it("carries the preset's toolset onto the override", () => {
        const config = chatAdapter.buildConfig("gpt-4o", "Off", {}, undefined, {
          ...extraParams,
          subagentPreset: {
            ...subagentPreset,
            enabledTools: { "ppal-create-clip": true },
          },
        });

        expect(config.subagentConfig?.enabledTools).toStrictEqual({
          "ppal-create-clip": true,
        });
      });

      it("leaves the override toolset undefined when the preset saved none", () => {
        const config = chatAdapter.buildConfig("gpt-4o", "Off", {}, undefined, {
          ...extraParams,
          subagentPreset, // no enabledTools
        });

        expect(config.subagentConfig?.enabledTools).toBeUndefined();
      });

      it("carries the preset's notation onto the override", () => {
        const config = chatAdapter.buildConfig("gpt-4o", "Off", {}, undefined, {
          ...extraParams,
          subagentPreset: { ...subagentPreset, notation: "stark" as const },
        });

        expect(config.subagentConfig?.notation).toBe("stark");
      });

      it("omits the notation key entirely when the preset saved none", () => {
        const config = chatAdapter.buildConfig("gpt-4o", "Off", {}, undefined, {
          ...extraParams,
          subagentPreset, // no notation
        });

        // Absent, not undefined: buildWorkerConfig spreads the override, so a
        // present key would erase an inherited notation instead of leaving it.
        expect(config.subagentConfig).not.toHaveProperty("notation");
      });

      it("leaves subagentConfig undefined when no preset is chosen", () => {
        const config = chatAdapter.buildConfig(
          "gpt-4o",
          "Default",
          {},
          undefined,
          extraParams,
        );

        expect(config.subagentConfig).toBeUndefined();
      });

      it("falls back to inherit and warns when the worker model can't be built", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Only the worker model fails to build (e.g. custom provider with no
        // URL); the orchestrator's own model must still succeed.
        vi.mocked(createProviderModel).mockImplementation((_p, modelId) => {
          if (modelId === "broken-worker") throw new Error("needs a URL");

          return mockModel;
        });

        const config = chatAdapter.buildConfig(
          "gpt-4o",
          "Default",
          {},
          undefined,
          {
            ...extraParams,
            subagentPreset: { ...subagentPreset, model: "broken-worker" },
          },
        );

        expect(config.model).toBe(mockModel); // orchestrator unaffected
        expect(config.subagentConfig).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledOnce();

        vi.mocked(createProviderModel).mockImplementation(() => mockModel);
        warnSpy.mockRestore();
      });
    });
  });

  describe("createErrorMessage", () => {
    it("creates formatted error message from chat history", () => {
      const history: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = chatAdapter.createErrorMessage(
        new Error("API error"),
        history,
      );

      expect(result).toHaveLength(3);
      expect(result[2]!.role).toBe("model");
    });
  });

  describe("extractUserMessage", () => {
    it("returns trimmed content for user messages", () => {
      const msg: ChatMessage = { role: "user", content: "  Hello  " };

      expect(chatAdapter.extractUserMessage(msg)).toBe("Hello");
    });

    it("returns undefined for assistant messages", () => {
      const msg: ChatMessage = { role: "assistant", content: "Hi" };

      expect(chatAdapter.extractUserMessage(msg)).toBeUndefined();
    });
  });

  describe("createUserMessage", () => {
    it("creates a user message with the given text", () => {
      const msg = chatAdapter.createUserMessage("Hello");

      expect(msg).toStrictEqual({ role: "user", content: "Hello" });
    });
  });

  describe("formatMessages", () => {
    it("delegates to formatChatMessages", () => {
      const history: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = chatAdapter.formatMessages(history);

      expect(result).toHaveLength(2);
      expect(result[0]!.role).toBe("user");
      expect(result[1]!.role).toBe("model");
    });
  });

  describe("createCompactionSummary", () => {
    it("creates a flagged synthetic user message", () => {
      const msg = chatAdapter.createCompactionSummary("a summary");

      expect(msg).toStrictEqual({
        role: "user",
        content: "a summary",
        isCompactionSummary: true,
      });
    });
  });
});
