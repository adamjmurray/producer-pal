// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Tests for skip-scenario.ts
 */

import { describe, it, expect } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import {
  type EvalScenario,
  type ScenarioRequirements,
} from "../../../types.ts";
import { buildSkippedResult, shouldSkipScenario } from "../skip-scenario.ts";

function makeScenario(requires?: ScenarioRequirements): EvalScenario {
  return {
    id: "test-scenario",
    description: "A test scenario",
    kind: "capability",
    tags: ["workflow"],
    liveSet: "basic-midi-4-track",
    messages: ["Connect to Ableton"],
    assertions: [],
    ...(requires && { requires }),
  };
}

/** Default run env: not small-model, full tool set. */
const fullEnv = {
  smallModelMode: false,
  tools: [...TOOL_NAMES],
  liveMajorVersion: 13,
};

/** Small-model run env with the full tool set. */
const smallModelEnv = {
  smallModelMode: true,
  tools: [...TOOL_NAMES],
  liveMajorVersion: 13,
};

describe("shouldSkipScenario", () => {
  it("returns null when the scenario has no requirements", () => {
    expect(shouldSkipScenario(makeScenario(), smallModelEnv)).toBeNull();
  });

  describe("transforms requirement", () => {
    it("skips under small-model mode", () => {
      const reason = shouldSkipScenario(
        makeScenario({ transforms: true }),
        smallModelEnv,
      );

      expect(reason).toMatch(/transforms DSL/);
    });

    it("does not skip when not in small-model mode", () => {
      expect(
        shouldSkipScenario(makeScenario({ transforms: true }), fullEnv),
      ).toBeNull();
    });
  });

  describe("brackets requirement", () => {
    it("skips under small-model mode", () => {
      const reason = shouldSkipScenario(
        makeScenario({ brackets: true }),
        smallModelEnv,
      );

      expect(reason).toMatch(/stream notation/);
    });

    it("does not skip when not in small-model mode", () => {
      expect(
        shouldSkipScenario(makeScenario({ brackets: true }), fullEnv),
      ).toBeNull();
    });
  });

  describe("largeModel requirement", () => {
    it("skips under small-model mode", () => {
      const reason = shouldSkipScenario(
        makeScenario({ largeModel: true }),
        smallModelEnv,
      );

      expect(reason).toMatch(/large\/frontier model/);
    });

    it("does not skip when not in small-model mode", () => {
      expect(
        shouldSkipScenario(makeScenario({ largeModel: true }), fullEnv),
      ).toBeNull();
    });
  });

  describe("params requirement", () => {
    // "actions" is in update-device's small-model excludeParams, so it is part
    // of the real SMALL_MODEL_EXCLUDED_PARAMS union this branch consults.
    it("skips under small-model mode when a required param is excluded there", () => {
      const reason = shouldSkipScenario(
        makeScenario({ params: ["actions"] }),
        smallModelEnv,
      );

      expect(reason).toMatch(
        /param\(s\) excluded in small-model mode: actions/,
      );
    });

    it("does not skip under small-model mode when the param is not excluded", () => {
      // `query` (ppal-library) is a descriptionOverride, never an
      // excludeParam, so it stays available even in small-model mode.
      expect(
        shouldSkipScenario(makeScenario({ params: ["query"] }), smallModelEnv),
      ).toBeNull();
    });

    it("does not skip when not in small-model mode", () => {
      expect(
        shouldSkipScenario(makeScenario({ params: ["actions"] }), fullEnv),
      ).toBeNull();
    });
  });

  describe("tools requirement", () => {
    // A run that restricts --tools below the required set.
    const restrictedEnv = {
      smallModelMode: false,
      tools: ["ppal-connect", "ppal-create-clip"],
      liveMajorVersion: 13,
    };

    it("skips when the run's --tools subset excludes a required tool", () => {
      const reason = shouldSkipScenario(
        makeScenario({ tools: ["ppal-update-device"] }),
        restrictedEnv,
      );

      expect(reason).toMatch(
        /--tools subset excludes required tool\(s\): ppal-update-device/,
      );
    });

    it("resolves short required tool names before comparing", () => {
      const reason = shouldSkipScenario(
        makeScenario({ tools: ["update-device"] }),
        restrictedEnv,
      );

      expect(reason).toMatch(/ppal-update-device/);
    });

    it("does not skip when all required tools are in the subset", () => {
      expect(
        shouldSkipScenario(makeScenario({ tools: ["connect"] }), restrictedEnv),
      ).toBeNull();
    });

    // ppal-manage is `omitInSmallModel`, so the mode never offers it.
    it("skips under small-model mode when a required tool is hidden there", () => {
      const reason = shouldSkipScenario(
        makeScenario({ tools: ["ppal-manage"] }),
        smallModelEnv,
      );

      expect(reason).toBe(
        "requires tool(s) hidden in small-model mode: ppal-manage",
      );
    });

    it("resolves short names for the small-model check too", () => {
      const reason = shouldSkipScenario(
        makeScenario({ tools: ["connect", "manage"] }),
        smallModelEnv,
      );

      expect(reason).toMatch(/hidden in small-model mode: ppal-manage$/);
    });

    it("does not skip under small-model mode when every required tool is offered", () => {
      expect(
        shouldSkipScenario(makeScenario({ tools: ["connect"] }), smallModelEnv),
      ).toBeNull();
    });

    it("does not skip a hidden tool outside small-model mode", () => {
      expect(
        shouldSkipScenario(makeScenario({ tools: ["ppal-manage"] }), fullEnv),
      ).toBeNull();
    });

    it("does not skip when the run has the full tool set", () => {
      expect(
        shouldSkipScenario(
          makeScenario({ tools: ["ppal-update-device"] }),
          fullEnv,
        ),
      ).toBeNull();
    });
  });

  describe("liveVersion requirement", () => {
    const scenario = makeScenario({ liveVersion: 13 });

    it("skips when ABLETON_APP is an older Live", () => {
      expect(
        shouldSkipScenario(scenario, { ...fullEnv, liveMajorVersion: 12 }),
      ).toBe("requires Live 13 or newer (ABLETON_APP is Live 12)");
    });

    it("does not skip when ABLETON_APP is the required version", () => {
      expect(
        shouldSkipScenario(scenario, { ...fullEnv, liveMajorVersion: 13 }),
      ).toBeNull();
    });

    it("does not skip when ABLETON_APP is newer", () => {
      expect(
        shouldSkipScenario(scenario, { ...fullEnv, liveMajorVersion: 14 }),
      ).toBeNull();
    });

    it("skips when the Live version can't be read", () => {
      expect(
        shouldSkipScenario(scenario, { ...fullEnv, liveMajorVersion: null }),
      ).toBe(
        "requires Live 13 or newer (could not read the Live version from ABLETON_APP)",
      );
    });
  });
});

describe("buildSkippedResult", () => {
  it("builds a skipped result carrying the reason and empty checks", () => {
    const result = buildSkippedResult(
      makeScenario({ transforms: true }),
      "run-123",
      "google/gemini-3.6-flash",
      "small-model",
      "requires the transforms DSL",
    );

    expect(result.result).toBe("skipped");
    expect(result.skipReason).toBe("requires the transforms DSL");
    expect(result.scenarioId).toBe("test-scenario");
    expect(result.model).toBe("google/gemini-3.6-flash");
    expect(result.configProfileId).toBe("small-model");
    expect(result.kind).toBe("capability");
    expect(result.turns).toStrictEqual([]);
    expect(result.checks).toStrictEqual({ pass: false, results: [] });
    expect(result.totalDurationMs).toBe(0);
  });
});
