// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { shouldSkipScenario } from "../../helpers/json-results/skip-scenario.ts";
import { durationReachForQuarter } from "../clip/notation/duration-reach-for-quarter.ts";
import { deviceKitByName } from "../device/presets/device-kit-by-name.ts";
import { devicePresetSwapByName } from "../device/presets/device-preset-swap-by-name.ts";

const smallEnv = { smallModelMode: true, tools: [] as string[] };

describe("scenarios that need what small-model mode hides", () => {
  it.each([deviceKitByName, devicePresetSwapByName, durationReachForQuarter])(
    "$id is skipped in small-model mode",
    (scenario) => {
      expect(shouldSkipScenario(scenario, smallEnv)).not.toBeNull();
    },
  );
});
