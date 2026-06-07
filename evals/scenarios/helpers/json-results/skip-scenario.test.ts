// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for skip-scenario.ts
 */

import { describe, it, expect } from "vitest";
import {
  type ConfigProfile,
  type EvalScenario,
  type ScenarioRequirements,
} from "../../types.ts";
import { buildSkippedResult, shouldSkipScenario } from "./skip-scenario.ts";

function makeScenario(requires?: ScenarioRequirements): EvalScenario {
  return {
    id: "test-scenario",
    description: "A test scenario",
    kind: "capability",
    liveSet: "basic-midi-4-track",
    messages: ["Connect to Ableton"],
    assertions: [],
    ...(requires && { requires }),
  };
}

const defaultProfile: ConfigProfile = {
  id: "default",
  description: "full tools",
  config: {
    smallModelMode: false,
    tools: ["ppal-connect", "ppal-create-clip"],
  },
};

const smallModelProfile: ConfigProfile = {
  id: "small-model",
  description: "small model mode",
  config: { smallModelMode: true },
};

describe("shouldSkipScenario", () => {
  it("returns null when the scenario has no requirements", () => {
    expect(shouldSkipScenario(makeScenario(), smallModelProfile)).toBeNull();
  });

  describe("transforms requirement", () => {
    it("skips under small-model mode", () => {
      const reason = shouldSkipScenario(
        makeScenario({ transforms: true }),
        smallModelProfile,
      );

      expect(reason).toMatch(/transforms DSL/);
    });

    it("does not skip under the default profile", () => {
      expect(
        shouldSkipScenario(makeScenario({ transforms: true }), defaultProfile),
      ).toBeNull();
    });
  });

  describe("brackets requirement", () => {
    it("skips under small-model mode", () => {
      const reason = shouldSkipScenario(
        makeScenario({ brackets: true }),
        smallModelProfile,
      );

      expect(reason).toMatch(/stream notation/);
    });

    it("does not skip under the default profile", () => {
      expect(
        shouldSkipScenario(makeScenario({ brackets: true }), defaultProfile),
      ).toBeNull();
    });
  });

  describe("largeModel requirement", () => {
    it("skips under small-model mode", () => {
      const reason = shouldSkipScenario(
        makeScenario({ largeModel: true }),
        smallModelProfile,
      );

      expect(reason).toMatch(/large\/frontier model/);
    });

    it("does not skip under the default profile", () => {
      expect(
        shouldSkipScenario(makeScenario({ largeModel: true }), defaultProfile),
      ).toBeNull();
    });
  });

  describe("params requirement", () => {
    // "actions" is in update-device's small-model excludeParams, so it is part
    // of the real SMALL_MODEL_EXCLUDED_PARAMS union this branch consults.
    it("skips under small-model mode when a required param is excluded there", () => {
      const reason = shouldSkipScenario(
        makeScenario({ params: ["actions"] }),
        smallModelProfile,
      );

      expect(reason).toMatch(
        /param\(s\) excluded in small-model mode: actions/,
      );
    });

    it("does not skip under small-model mode when the param is not excluded", () => {
      // `name` is a descriptionOverride, never an excludeParam, so it stays
      // available even in small-model mode.
      expect(
        shouldSkipScenario(
          makeScenario({ params: ["name"] }),
          smallModelProfile,
        ),
      ).toBeNull();
    });

    it("does not skip under the default profile", () => {
      expect(
        shouldSkipScenario(
          makeScenario({ params: ["actions"] }),
          defaultProfile,
        ),
      ).toBeNull();
    });
  });

  describe("tools requirement", () => {
    it("skips when the profile's tool allow-list excludes a required tool", () => {
      const reason = shouldSkipScenario(
        makeScenario({ tools: ["ppal-update-device"] }),
        defaultProfile,
      );

      expect(reason).toMatch(/excludes required tool\(s\): ppal-update-device/);
    });

    it("does not skip when all required tools are in the allow-list", () => {
      expect(
        shouldSkipScenario(
          makeScenario({ tools: ["ppal-connect"] }),
          defaultProfile,
        ),
      ).toBeNull();
    });

    it("does not skip on tools when the profile has no explicit allow-list", () => {
      // small-model profile sets no `tools`; deriving its excluded surface from
      // smallModelModeConfig is a follow-up, so requires.tools is inert here.
      expect(
        shouldSkipScenario(
          makeScenario({ tools: ["ppal-connect"] }),
          smallModelProfile,
        ),
      ).toBeNull();
    });
  });
});

describe("buildSkippedResult", () => {
  it("builds a skipped result carrying the reason and empty checks", () => {
    const result = buildSkippedResult(
      makeScenario({ transforms: true }),
      "run-123",
      "google/gemini-3.5-flash",
      "small-model",
      "requires the transforms DSL",
    );

    expect(result.result).toBe("skipped");
    expect(result.skipReason).toBe("requires the transforms DSL");
    expect(result.scenarioId).toBe("test-scenario");
    expect(result.model).toBe("google/gemini-3.5-flash");
    expect(result.configProfileId).toBe("small-model");
    expect(result.kind).toBe("capability");
    expect(result.turns).toStrictEqual([]);
    expect(result.checks).toStrictEqual({ pass: false, results: [] });
    expect(result.totalDurationMs).toBe(0);
  });
});
