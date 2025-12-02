import { describe, it, expect } from "vitest";
import { buildGeminiConfig, buildOpenAIConfig } from "./config-builders";

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

  describe("buildOpenAIConfig", () => {
    it("should build basic config", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "Off", undefined, {});

      expect(config.model).toBe("gpt-4");
      expect(config.temperature).toBe(1.0);
      expect(config.reasoningEffort).toBeUndefined();
    });

    it("should include reasoning effort for OpenAI API", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "Medium", undefined, {});

      expect(config.reasoningEffort).toBe("medium");
    });

    it("should map Low thinking to low reasoning effort", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "Low", undefined, {});

      expect(config.reasoningEffort).toBe("low");
    });

    it("should map High thinking to high reasoning effort", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "High", undefined, {});

      expect(config.reasoningEffort).toBe("high");
    });

    it("should map Ultra thinking to high reasoning effort", () => {
      const config = buildOpenAIConfig("gpt-4", 1.0, "Ultra", undefined, {});

      expect(config.reasoningEffort).toBe("high");
    });

    it("should not include reasoning effort for custom API", () => {
      const config = buildOpenAIConfig(
        "gpt-4",
        1.0,
        "Medium",
        "https://custom.api/v1",
        {},
      );

      expect(config.reasoningEffort).toBeUndefined();
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
