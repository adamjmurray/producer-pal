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
      expect(mapThinkingToReasoningEffort("Medium", "gpt-4")).toBeUndefined();
    });

    it("should return undefined for gpt-5 without decimal", () => {
      expect(
        mapThinkingToReasoningEffort("Medium", "gpt-5-2025-08-07"),
      ).toBeUndefined();
    });

    describe("o1/o3 models", () => {
      it("should map Low to low", () => {
        expect(mapThinkingToReasoningEffort("Low", "o1-preview")).toBe("low");
      });

      it("should map Minimal to low", () => {
        expect(mapThinkingToReasoningEffort("Minimal", "o3-mini")).toBe("low");
      });

      it("should map Medium to medium", () => {
        expect(mapThinkingToReasoningEffort("Medium", "o1")).toBe("medium");
      });

      it("should map High to high", () => {
        expect(mapThinkingToReasoningEffort("High", "o1")).toBe("high");
      });

      it("should map Ultra to high (capped)", () => {
        expect(mapThinkingToReasoningEffort("Ultra", "o3")).toBe("high");
      });

      it("should map Off to low (minimum for o1/o3)", () => {
        expect(mapThinkingToReasoningEffort("Off", "o1")).toBe("low");
      });

      it("should return undefined for Default", () => {
        expect(mapThinkingToReasoningEffort("Default", "o1")).toBeUndefined();
      });
    });

    describe("gpt-5.1 models", () => {
      it("should map Off to none", () => {
        expect(mapThinkingToReasoningEffort("Off", "gpt-5.1-2025-01-01")).toBe(
          "none",
        );
      });

      it("should map Minimal to minimal", () => {
        expect(
          mapThinkingToReasoningEffort("Minimal", "gpt-5.1-2025-01-01"),
        ).toBe("minimal");
      });

      it("should map Low to low", () => {
        expect(mapThinkingToReasoningEffort("Low", "gpt-5.1-2025-01-01")).toBe(
          "low",
        );
      });

      it("should map Medium to medium", () => {
        expect(
          mapThinkingToReasoningEffort("Medium", "gpt-5.1-2025-01-01"),
        ).toBe("medium");
      });

      it("should map High to high", () => {
        expect(mapThinkingToReasoningEffort("High", "gpt-5.1-2025-01-01")).toBe(
          "high",
        );
      });

      it("should map Ultra to high (capped for 5.1)", () => {
        expect(
          mapThinkingToReasoningEffort("Ultra", "gpt-5.1-2025-01-01"),
        ).toBe("high");
      });

      it("should allow xhigh for gpt-5.1-codex-max", () => {
        expect(mapThinkingToReasoningEffort("Ultra", "gpt-5.1-codex-max")).toBe(
          "xhigh",
        );
      });

      it("should return undefined for Default", () => {
        expect(
          mapThinkingToReasoningEffort("Default", "gpt-5.1-2025-01-01"),
        ).toBeUndefined();
      });
    });

    describe("gpt-5.2+ models", () => {
      it("should map Off to none", () => {
        expect(mapThinkingToReasoningEffort("Off", "gpt-5.2-2025-12-11")).toBe(
          "none",
        );
      });

      it("should map Ultra to xhigh", () => {
        expect(
          mapThinkingToReasoningEffort("Ultra", "gpt-5.2-2025-12-11"),
        ).toBe("xhigh");
      });

      it("should return undefined for Default", () => {
        expect(
          mapThinkingToReasoningEffort("Default", "gpt-5.2-2025-12-11"),
        ).toBeUndefined();
      });
    });
  });

  describe("mapThinkingToOpenRouterEffort", () => {
    it("should map Off to none", () => {
      expect(mapThinkingToOpenRouterEffort("Off")).toBe("none");
    });

    it("should map Minimal to minimal", () => {
      expect(mapThinkingToOpenRouterEffort("Minimal")).toBe("minimal");
    });

    it("should map Low to low", () => {
      expect(mapThinkingToOpenRouterEffort("Low")).toBe("low");
    });

    it("should map Medium to medium", () => {
      expect(mapThinkingToOpenRouterEffort("Medium")).toBe("medium");
    });

    it("should map High to high", () => {
      expect(mapThinkingToOpenRouterEffort("High")).toBe("high");
    });

    it("should map Ultra to xhigh", () => {
      expect(mapThinkingToOpenRouterEffort("Ultra")).toBe("xhigh");
    });

    it("should return undefined for Default", () => {
      expect(mapThinkingToOpenRouterEffort("Default")).toBeUndefined();
    });
  });

  describe("mapThinkingToOllamaThink", () => {
    it("should return false for Off", () => {
      expect(mapThinkingToOllamaThink("Off", "qwen3")).toBe(false);
    });

    it("should return undefined for Default", () => {
      expect(mapThinkingToOllamaThink("Default", "qwen3")).toBeUndefined();
    });

    it("should return true for non-GPT-OSS levels", () => {
      expect(mapThinkingToOllamaThink("Low", "qwen3")).toBe(true);
      expect(mapThinkingToOllamaThink("Medium", "qwen3")).toBe(true);
      expect(mapThinkingToOllamaThink("High", "qwen3")).toBe(true);
    });

    it("should return level strings for GPT-OSS", () => {
      expect(mapThinkingToOllamaThink("Low", "gpt-oss")).toBe("low");
      expect(mapThinkingToOllamaThink("Medium", "gpt-oss")).toBe("medium");
      expect(mapThinkingToOllamaThink("High", "gpt-oss")).toBe("high");
    });
  });
});
