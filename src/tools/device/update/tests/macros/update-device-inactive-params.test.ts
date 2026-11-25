// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  paramsOf,
  registerMockObject,
  registerNamedParams,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { automatedParam } from "#src/test/mocks/mock-registry.ts";
import { OVERRIDDEN } from "#src/tools/shared/arrangement/tracks/tests/automation-override-test-helpers.ts";
import { INACTIVE_PARAM_DETAIL } from "#src/tools/device/update/helpers/params/param-read-back.ts";
import { readBackDetail } from "#src/tools/shared/helpers/read-back-comparison.ts";

/**
 * Register a Wavetable whose LFO 1 Sync reads as given, beside the two rates
 * it picks between.
 * @param sync - "Free" or "Tempo"
 * @returns The sync param mock
 */
function registerWavetableLfo(sync: string): RegisteredMockObject {
  registerNamedParams(["LFO 1 Rate", "LFO 1 S. Rate", "Gain"], {}, "Wavetable");

  const syncParam = registerMockObject("sync", {
    properties: {
      name: "LFO 1 Sync",
      original_name: "LFO 1 Sync",
      is_quantized: 1,
      is_enabled: 1,
      value: sync === "Free" ? 0 : 1,
      value_items: ["Free", "Tempo"],
      canonical_parent: children("dev1"),
    },
  });

  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      class_display_name: "Wavetable",
      parameters: children("p0", "p1", "p2", "sync"),
    },
  });

  return syncParam;
}

describe("updateDevice - params inactive in the device's mode", () => {
  it("says so when Live marks the param inactive", () => {
    const [, reso] = registerNamedParams(["Cutoff", "Reso"]);

    (reso as NonNullable<typeof reso>).properties.state = 1;

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "Cutoff", value: "0.8" },
        { name: "Reso", value: "0.3" },
      ],
    });

    expect(paramsOf(result)).toStrictEqual([
      { id: "p0", name: "Cutoff" },
      { id: "p1", name: "Reso", detail: INACTIVE_PARAM_DETAIL },
    ]);
  });

  it("says so when a specialized rule marks the param inactive", () => {
    registerWavetableLfo("Tempo");

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "LFO 1 Rate", value: "0.8" },
        { name: "LFO 1 S. Rate", value: "0.3" },
      ],
    });

    expect(paramsOf(result)).toStrictEqual([
      { id: "p0", name: "LFO 1 Rate", detail: INACTIVE_PARAM_DETAIL },
      { id: "p1", name: "LFO 1 S. Rate" },
    ]);
  });

  it("says so for a pseudo-param controller (EQ Eight's B side in stereo)", () => {
    registerNamedParams(["3 Q A", "3 Q B"], {}, "EQ Eight");
    registerMockObject("dev1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        class_display_name: "EQ Eight",
        global_mode: 0,
        parameters: children("p0", "p1"),
      },
    });

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "3 Q A", value: "0.8" },
        { name: "3 Q B", value: "0.3" },
      ],
    });

    expect(paramsOf(result)).toStrictEqual([
      { id: "p0", name: "3 Q A" },
      { id: "p1", name: "3 Q B", detail: INACTIVE_PARAM_DETAIL },
    ]);
  });

  it("judges by the mode the whole call leaves, not the one it started in", () => {
    registerWavetableLfo("Tempo");

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "LFO 1 Sync", value: "Free" },
        { name: "LFO 1 Rate", value: "0.8" },
      ],
    });

    expect(paramsOf(result)).toStrictEqual([
      { id: "sync", name: "LFO 1 Sync", value: "Free" },
      { id: "p0", name: "LFO 1 Rate" },
    ]);
  });

  it("adds nothing to a param on a device with no rules", () => {
    registerNamedParams(["Cutoff"]);

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Cutoff", value: "0.8" }],
    });

    expect(paramsOf(result)).toStrictEqual([{ id: "p0", name: "Cutoff" }]);
  });

  it("reads no controller for a param no rule names", () => {
    const sync = registerWavetableLfo("Tempo");

    updateDevice({ id: "dev1", params: [{ name: "Gain", value: "0.8" }] });

    expect(sync.get).not.toHaveBeenCalledWith("value");
  });

  it("joins after the read-back detail", () => {
    registerNamedParams(["Cutoff"], { state: 1 });

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Cutoff", value: "0.123" }],
    });

    expect(paramsOf(result)).toStrictEqual([
      {
        id: "p0",
        name: "Cutoff",
        value: 0.12,
        detail: `${readBackDetail(["value"])}; ${INACTIVE_PARAM_DETAIL}`,
      },
    ]);
  });

  it("joins after the automation override detail", () => {
    const [cutoff] = registerNamedParams(["Cutoff"], { state: 1 });

    automatedParam(cutoff as NonNullable<typeof cutoff>);

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Cutoff", value: "0.8" }],
    });

    expect(paramsOf(result)).toStrictEqual([
      {
        id: "p0",
        name: "Cutoff",
        detail: `${OVERRIDDEN}; ${INACTIVE_PARAM_DETAIL}`,
      },
    ]);
  });
});
