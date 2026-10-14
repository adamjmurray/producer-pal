// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  automatedParam,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  AUTOMATION_OVERRIDDEN,
  automationOverriddenDetail,
  overridesActivator,
  overridesAutomation,
} from "../automation-override.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("overridesAutomation", () => {
  it.each([
    ["a lane and a changed value", 1, 0.5, 0.7, true],
    ["a lane and the same value", 1, 0.5, 0.5, false],
    ["an overridden lane and a changed value", 2, 0.5, 0.7, false],
    ["no lane and a changed value", 0, 0.5, 0.7, false],
    ["no state read", undefined, 0.5, 0.7, false],
  ])("with %s", (_, state, before, after, expected) => {
    const param = registerMockObject("param");
    const write = vi.fn(() => {
      param.properties.value = after;
    });

    param.properties.automation_state = state;
    param.properties.value = before;

    expect(overridesAutomation(LiveAPI.from(param.id), write)).toBe(expected);
    expect(write).toHaveBeenCalledOnce();
  });

  it("does not wait for the state to change within the call", () => {
    const param = registerMockObject("param");

    automatedParam(param, 1, true);

    expect(
      overridesAutomation(LiveAPI.from(param.id), () => {
        param.set("value", 1);
      }),
    ).toBe(true);
    expect(param.properties.automation_state).toBe(1);
  });

  it("can watch a value that isn't the parameter's own", () => {
    const param = registerMockObject("param");
    let tempo = 120;

    param.properties.automation_state = 1;

    const write = (): void => {
      tempo = 130;
    };

    expect(
      overridesAutomation(LiveAPI.from(param.id), write, () => tempo),
    ).toBe(true);
  });
});

describe("overridesActivator", () => {
  it("checks the owner's activator parameter", () => {
    const track = registerMockObject("track", { path: livePath.track(0) });
    const activator = registerMockObject("activator", {
      path: `${livePath.track(0).mixerDevice()} track_activator`,
    });

    registerMockObject("mixer", { path: livePath.track(0).mixerDevice() });
    automatedParam(activator, 1, true, track);

    const write = (): void => {
      track.set("mute", 1);
    };

    expect(
      overridesActivator(LiveAPI.from("track"), "track_activator", write),
    ).toBe(true);
  });

  it("just writes when the owner has no activator", () => {
    const owner = registerMockObject("pad", { path: livePath.track(0) });
    const write = vi.fn();

    mockNonExistentObjects();

    expect(
      overridesActivator(LiveAPI.from(owner.id), "chain_activator", write),
    ).toBe(false);
    expect(write).toHaveBeenCalledOnce();
  });
});

describe("automationOverriddenDetail", () => {
  it("names the field before the explanation", () => {
    expect(automationOverriddenDetail("pan")).toBe(
      `pan: ${AUTOMATION_OVERRIDDEN}`,
    );
  });
});
