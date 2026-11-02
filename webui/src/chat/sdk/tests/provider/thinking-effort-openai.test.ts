// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  extractGptVersion,
  isOpenAIReasoningModel,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/chat/sdk/provider/thinking-effort";

describe("extractGptVersion", () => {
  it("should extract version from gpt-5.2 models", () => {
    expect(extractGptVersion("gpt-5.2-2025-12-11")).toBe(5.2);
    expect(extractGptVersion("gpt-5.2-turbo")).toBe(5.2);
  });

  it("should extract version from gpt-5.1 models", () => {
    expect(extractGptVersion("gpt-5.1-2025-01-01")).toBe(5.1);
    expect(extractGptVersion("gpt-5.1-codex-max")).toBe(5.1);
  });

  it("should extract whole-number versions", () => {
    expect(extractGptVersion("gpt-5-2025-08-07")).toBe(5);
    expect(extractGptVersion("gpt-5-mini-2025-08-07")).toBe(5);
    expect(extractGptVersion("gpt-6.1-sol")).toBe(6.1);
  });

  it("should return null for non-gpt models", () => {
    expect(extractGptVersion("o1-preview")).toBeNull();
    expect(extractGptVersion("claude-3")).toBeNull();
  });
});

describe("mapThinkingToReasoningEffort", () => {
  it("should return undefined for unsupported models", () => {
    expect(mapThinkingToReasoningEffort("max", "gpt-4")).toBeUndefined();
  });

  it("should return undefined for gpt-5 without decimal", () => {
    expect(
      mapThinkingToReasoningEffort("max", "gpt-5-2025-08-07"),
    ).toBeUndefined();
  });

  describe("o1/o3 models", () => {
    it("should map max to high", () => {
      expect(mapThinkingToReasoningEffort("max", "o1")).toBe("high");
    });

    it("should send no effort for auto", () => {
      expect(mapThinkingToReasoningEffort("auto", "o1")).toBeUndefined();
    });

    it("should return undefined for off", () => {
      expect(mapThinkingToReasoningEffort("off", "o1")).toBeUndefined();
    });
  });

  describe("gpt-5.1 models", () => {
    it("should map max to high (capped for 5.1)", () => {
      expect(mapThinkingToReasoningEffort("max", "gpt-5.1-2025-01-01")).toBe(
        "high",
      );
    });

    it("should allow xhigh for gpt-5.1-codex-max", () => {
      expect(mapThinkingToReasoningEffort("max", "gpt-5.1-codex-max")).toBe(
        "xhigh",
      );
    });

    it("should send no effort for auto", () => {
      expect(
        mapThinkingToReasoningEffort("auto", "gpt-5.1-2025-01-01"),
      ).toBeUndefined();
    });

    it("should map off to undefined", () => {
      expect(
        mapThinkingToReasoningEffort("off", "gpt-5.1-2025-01-01"),
      ).toBeUndefined();
    });
  });

  describe("gpt-6 models", () => {
    it("should map max to max", () => {
      expect(mapThinkingToReasoningEffort("max", "gpt-6.1-sol")).toBe("max");
    });

    it("should map off to none", () => {
      expect(mapThinkingToReasoningEffort("off", "gpt-6-luna")).toBe("none");
    });

    it("should map off to low for GPT-6 models that reject none", () => {
      expect(mapThinkingToReasoningEffort("off", "gpt-6-astra")).toBe("low");
      expect(mapThinkingToReasoningEffort("off", "gpt-6.1-sol")).toBe("low");
    });

    it("should keep none for dated ids of the models that accept it", () => {
      expect(mapThinkingToReasoningEffort("off", "gpt-6-luna-2026-09-01")).toBe(
        "none",
      );
      expect(mapThinkingToReasoningEffort("off", "gpt-6-sol")).toBe("none");
    });

    it("should send no effort for auto", () => {
      expect(
        mapThinkingToReasoningEffort("auto", "gpt-6-luna"),
      ).toBeUndefined();
    });
  });

  describe("gpt-5.2+ models", () => {
    it("should map max to xhigh", () => {
      expect(mapThinkingToReasoningEffort("max", "gpt-5.2-2025-12-11")).toBe(
        "xhigh",
      );
    });

    it("should send no effort for auto", () => {
      expect(
        mapThinkingToReasoningEffort("auto", "gpt-5.2-2025-12-11"),
      ).toBeUndefined();
    });
  });
});

describe("isOpenAIReasoningModel", () => {
  it("should detect GPT-5+ and o-series models", () => {
    expect(isOpenAIReasoningModel("gpt-5-mini")).toBe(true);
    expect(isOpenAIReasoningModel("gpt-5.2-2025-12-11")).toBe(true);
    expect(isOpenAIReasoningModel("gpt-6-astra")).toBe(true);
    expect(isOpenAIReasoningModel("o3-mini")).toBe(true);
  });

  it("should reject older and unversioned models", () => {
    expect(isOpenAIReasoningModel("gpt-4.1")).toBe(false);
    expect(isOpenAIReasoningModel("gpt-realtime")).toBe(false);
  });
});

describe("mapThinkingToOpenRouterEffort", () => {
  it("should map max to xhigh", () => {
    expect(mapThinkingToOpenRouterEffort("max")).toBe("xhigh");
  });

  it("should send no effort for auto", () => {
    expect(mapThinkingToOpenRouterEffort("auto")).toBeUndefined();
  });

  it("should map off to none", () => {
    expect(mapThinkingToOpenRouterEffort("off")).toBe("none");
  });
});

describe("named levels", () => {
  it("passes low, medium and high through where effort is supported", () => {
    expect(mapThinkingToReasoningEffort("low", "o3")).toBe("low");
    expect(mapThinkingToReasoningEffort("high", "gpt-5.4")).toBe("high");
    expect(mapThinkingToReasoningEffort("low", "gpt-6-luna")).toBe("low");
    expect(mapThinkingToOpenRouterEffort("high")).toBe("high");
  });

  it("sends nothing for models without reasoning effort", () => {
    expect(mapThinkingToReasoningEffort("high", "gpt-4o")).toBeUndefined();
  });
});
