// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  extractGptVersion,
  mapThinkingToReasoningEffort,
  mapThinkingToOpenRouterEffort,
  mapThinkingToOllamaThink,
} from "./config-builders";

describe("config-builders", () => {
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

  describe("mapThinkingToReasoningEffort", () => {
    it("should return undefined for unsupported models", () => {
      expect(mapThinkingToReasoningEffort("Max", "gpt-4")).toBeUndefined();
    });

    it("should return undefined for gpt-5 without decimal", () => {
      expect(
        mapThinkingToReasoningEffort("Max", "gpt-5-2025-08-07"),
      ).toBeUndefined();
    });

    describe("o1/o3 models", () => {
      it("should map Max to high", () => {
        expect(mapThinkingToReasoningEffort("Max", "o1")).toBe("high");
      });

      it("should map Default to medium", () => {
        expect(mapThinkingToReasoningEffort("Default", "o1")).toBe("medium");
      });

      it("should return undefined for Off", () => {
        expect(mapThinkingToReasoningEffort("Off", "o1")).toBeUndefined();
      });
    });

    describe("gpt-5.1 models", () => {
      it("should map Max to high (capped for 5.1)", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-5.1-2025-01-01")).toBe(
          "high",
        );
      });

      it("should allow xhigh for gpt-5.1-codex-max", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-5.1-codex-max")).toBe(
          "xhigh",
        );
      });

      it("should map Default to medium", () => {
        expect(
          mapThinkingToReasoningEffort("Default", "gpt-5.1-2025-01-01"),
        ).toBe("medium");
      });

      it("should map Off to undefined", () => {
        expect(
          mapThinkingToReasoningEffort("Off", "gpt-5.1-2025-01-01"),
        ).toBeUndefined();
      });
    });

    describe("gpt-5.2+ models", () => {
      it("should map Max to xhigh", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-5.2-2025-12-11")).toBe(
          "xhigh",
        );
      });

      it("should map Default to medium", () => {
        expect(
          mapThinkingToReasoningEffort("Default", "gpt-5.2-2025-12-11"),
        ).toBe("medium");
      });
    });
  });

  describe("mapThinkingToOpenRouterEffort", () => {
    it("should map Max to xhigh", () => {
      expect(mapThinkingToOpenRouterEffort("Max")).toBe("xhigh");
    });

    it("should map Default to medium", () => {
      expect(mapThinkingToOpenRouterEffort("Default")).toBe("medium");
    });

    it("should return undefined for Off", () => {
      expect(mapThinkingToOpenRouterEffort("Off")).toBeUndefined();
    });
  });

  describe("mapThinkingToOllamaThink", () => {
    it("should return undefined for Default", () => {
      expect(mapThinkingToOllamaThink("Default", "qwen3.5")).toBeUndefined();
    });

    it("should return false for Off", () => {
      expect(mapThinkingToOllamaThink("Off", "qwen3.5")).toBe(false);
      expect(mapThinkingToOllamaThink("Off", "gpt-oss")).toBe(false);
    });

    it("should return true for Max on non-GPT-OSS", () => {
      expect(mapThinkingToOllamaThink("Max", "qwen3.5")).toBe(true);
    });

    it("should return high string for Max on GPT-OSS", () => {
      expect(mapThinkingToOllamaThink("Max", "gpt-oss")).toBe("high");
    });

    it("should return undefined for unknown thinking level", () => {
      expect(
        mapThinkingToOllamaThink("UnknownLevel", "qwen3.5"),
      ).toBeUndefined();
    });
  });
});
