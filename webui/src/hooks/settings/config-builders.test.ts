import { describe, it, expect } from "vitest";
import {
  buildGeminiConfig,
  buildOpenAIConfig,
  extractGptVersion,
} from "./config-builders";

describe("config-builders", () => {
  describe("buildGeminiConfig", () => {
    it("should build basic config", () => {
      const config = buildGeminiConfig(
        "gemini-2.5-flash",
        1.0,
        "Off",
        true,
        {},
      );

      expect(config.model).toBe("gemini-2.5-flash");
      expect(config.temperature).toBe(1.0);
      expect(config.thinkingConfig).toBeUndefined();
    });

    it("should include thinking config when enabled", () => {
      const config = buildGeminiConfig(
        "gemini-2.5-flash",
        1.0,
        "Auto",
        true,
        {},
      );

      expect(config.thinkingConfig).toBeDefined();
      expect(config.thinkingConfig?.includeThoughts).toBe(true);
    });

    it("should include chat history when provided", () => {
      const history = [{ role: "user" as const, parts: [{ text: "hi" }] }];
      const config = buildGeminiConfig(
        "gemini-2.5-flash",
        1.0,
        "Off",
        true,
        {},
        history,
      );

      expect(config.chatHistory).toEqual(history);
    });
  });

  describe("extractGptVersion", () => {
    it("should extract version from gpt-5.2 models", () => {
      expect(extractGptVersion("gpt-5.2-2025-12-11")).toBe(5.2);
      expect(extractGptVersion("gpt-5.2-turbo")).toBe(5.2);
    });

    it("should extract version from gpt-5.1 models", () => {
      expect(extractGptVersion("gpt-5.1-2025-01-01")).toBe(5.1);
      expect(extractGptVersion("gpt-5.1-codex-max")).toBe(5.1);
    });

    it("should return null for gpt-5 without decimal", () => {
      expect(extractGptVersion("gpt-5-2025-08-07")).toBeNull();
      expect(extractGptVersion("gpt-5-mini-2025-08-07")).toBeNull();
    });

    it("should return null for non-gpt models", () => {
      expect(extractGptVersion("o1-preview")).toBeNull();
      expect(extractGptVersion("claude-3")).toBeNull();
    });
  });

  describe("buildOpenAIConfig", () => {
    it("should build basic config", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "Off", undefined, {});

      expect(config.model).toBe("gpt-4");
      expect(config.temperature).toBe(1.0);
      expect(config.reasoningEffort).toBeUndefined();
    });

    it("should not include reasoning effort for unsupported models", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "Medium", undefined, {});

      expect(config.reasoningEffort).toBeUndefined();
    });

    it("should not include reasoning effort for gpt-5 without decimal", () => {
      const config = buildOpenAIConfig(
        "gpt-5-2025-08-07",
        1.0,
        "Medium",
        undefined,
        {},
      );

      expect(config.reasoningEffort).toBeUndefined();
    });

    describe("o1/o3 models", () => {
      it("should map Low to low", () => {
        const config = buildOpenAIConfig(
          "o1-preview",
          1.0,
          "Low",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("low");
      });

      it("should map Minimal to low", () => {
        const config = buildOpenAIConfig(
          "o3-mini",
          1.0,
          "Minimal",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("low");
      });

      it("should map Medium to medium", () => {
        const config = buildOpenAIConfig("o1", 1.0, "Medium", undefined, {});

        expect(config.reasoningEffort).toBe("medium");
      });

      it("should map High to high", () => {
        const config = buildOpenAIConfig("o1", 1.0, "High", undefined, {});

        expect(config.reasoningEffort).toBe("high");
      });

      it("should map XHigh to high (capped)", () => {
        const config = buildOpenAIConfig("o3", 1.0, "XHigh", undefined, {});

        expect(config.reasoningEffort).toBe("high");
      });

      it("should map Off to low (minimum for o1/o3)", () => {
        const config = buildOpenAIConfig("o1", 1.0, "Off", undefined, {});

        expect(config.reasoningEffort).toBe("low");
      });

      it("should return undefined for Default", () => {
        const config = buildOpenAIConfig("o1", 1.0, "Default", undefined, {});

        expect(config.reasoningEffort).toBeUndefined();
      });
    });

    describe("gpt-5.1 models", () => {
      it("should map Off to none", () => {
        const config = buildOpenAIConfig(
          "gpt-5.1-2025-01-01",
          1.0,
          "Off",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("none");
      });

      it("should map Minimal to minimal", () => {
        const config = buildOpenAIConfig(
          "gpt-5.1-2025-01-01",
          1.0,
          "Minimal",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("minimal");
      });

      it("should map Low to low", () => {
        const config = buildOpenAIConfig(
          "gpt-5.1-2025-01-01",
          1.0,
          "Low",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("low");
      });

      it("should map High to high", () => {
        const config = buildOpenAIConfig(
          "gpt-5.1-2025-01-01",
          1.0,
          "High",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("high");
      });

      it("should map XHigh to high (capped for 5.1)", () => {
        const config = buildOpenAIConfig(
          "gpt-5.1-2025-01-01",
          1.0,
          "XHigh",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("high");
      });

      it("should allow xhigh for gpt-5.1-codex-max", () => {
        const config = buildOpenAIConfig(
          "gpt-5.1-codex-max",
          1.0,
          "XHigh",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("xhigh");
      });
    });

    describe("gpt-5.2+ models", () => {
      it("should map Off to none", () => {
        const config = buildOpenAIConfig(
          "gpt-5.2-2025-12-11",
          1.0,
          "Off",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("none");
      });

      it("should map Minimal to minimal", () => {
        const config = buildOpenAIConfig(
          "gpt-5.2-2025-12-11",
          1.0,
          "Minimal",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("minimal");
      });

      it("should map XHigh to xhigh", () => {
        const config = buildOpenAIConfig(
          "gpt-5.2-2025-12-11",
          1.0,
          "XHigh",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBe("xhigh");
      });

      it("should return undefined for Default", () => {
        const config = buildOpenAIConfig(
          "gpt-5.2-2025-12-11",
          1.0,
          "Default",
          undefined,
          {},
        );

        expect(config.reasoningEffort).toBeUndefined();
      });
    });

    it("should not include reasoning effort for custom API", () => {
      const config = buildOpenAIConfig(
        "gpt-5.2-2025-12-11",
        1.0,
        "Medium",
        "https://custom.api/v1",
        {},
      );

      expect(config.reasoningEffort).toBeUndefined();
    });

    describe("OpenRouter", () => {
      const openRouterUrl = "https://openrouter.ai/api/v1";

      it("should map thinking settings directly for OpenRouter", () => {
        const config = buildOpenAIConfig(
          "anthropic/claude-sonnet",
          1.0,
          "High",
          openRouterUrl,
          {},
        );

        expect(config.reasoningEffort).toBe("high");
      });

      it("should map XHigh to xhigh for OpenRouter", () => {
        const config = buildOpenAIConfig(
          "anthropic/claude-sonnet",
          1.0,
          "XHigh",
          openRouterUrl,
          {},
        );

        expect(config.reasoningEffort).toBe("xhigh");
      });

      it("should map Off to none for OpenRouter", () => {
        const config = buildOpenAIConfig(
          "anthropic/claude-sonnet",
          1.0,
          "Off",
          openRouterUrl,
          {},
        );

        expect(config.reasoningEffort).toBe("none");
      });

      it("should return undefined for Default", () => {
        const config = buildOpenAIConfig(
          "anthropic/claude-sonnet",
          1.0,
          "Default",
          openRouterUrl,
          {},
        );

        expect(config.reasoningEffort).toBeUndefined();
      });
    });

    it("should include chat history when provided", () => {
      const history = [{ role: "user" as const, content: "hi" }];
      const config = buildOpenAIConfig(
        "gpt-4",
        1.0,
        "Off",
        undefined,
        {},
        history,
      );

      expect(config.chatHistory).toEqual(history);
    });
  });
});
