// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  paramsOf,
  registerMockObject,
  updateDevice,
} from "../../update-device-test-helpers.ts";

describe("updateDevice - a param named twice, the last one failing", () => {
  let paramThreshold: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("125", {
      path: livePath.track(0).device(2),
      type: "Device",
      properties: { parameters: children("789", "p-other") },
    });

    paramThreshold = registerMockObject("789", {
      path: livePath.track(0).device(2).parameter(0),
      type: "DeviceParameter",
      properties: {
        name: "Threshold",
        original_name: "Threshold",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
    });
    registerMockObject("p-other", {
      path: livePath.track(0).device(2).parameter(1),
      type: "DeviceParameter",
      properties: {
        name: "Other",
        original_name: "Other",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
    });
  });

  it("fails the earlier entry when the later value is invalid", () => {
    const result = updateDevice({
      id: "125",
      params: [
        { name: "Threshold", value: "0.2" },
        { name: "threshold", value: "bad" },
        { name: "Other", value: "0.3" },
      ],
    });

    expect(paramThreshold.set).not.toHaveBeenCalled();

    const [earlier, later, other] = paramsOf(result);

    expect(earlier).toStrictEqual({
      name: "Threshold",
      ok: false,
      detail: 'not written: "threshold" was meant to replace it, but failed',
    });
    expect(later).toStrictEqual({
      name: "threshold",
      ok: false,
      detail: expect.stringContaining("bad"),
    });
    expect(other).toStrictEqual({ id: "p-other", name: "Other" });
  });

  it("fails every earlier mention of a param named three times", () => {
    const result = updateDevice({
      id: "125",
      params: [
        { name: "Threshold", value: "0.2" },
        { id: "789", value: "0.4" },
        { name: "threshold", value: "bad" },
        { name: "Other", value: "0.3" },
      ],
    });
    const replaced =
      'not written: "threshold" was meant to replace it, but failed';

    expect(paramsOf(result).slice(0, 2)).toStrictEqual([
      { name: "Threshold", ok: false, detail: replaced },
      { id: "789", ok: false, detail: replaced },
    ]);
  });

  it("keeps the earlier entry's note when the later one lands", () => {
    const result = updateDevice({
      id: "125",
      params: [
        { name: "Threshold", value: "bad" },
        { name: "threshold", value: "0.8" },
        { name: "Other", value: "0.3" },
      ],
    });

    expect(paramsOf(result)[0]).toStrictEqual({
      name: "Threshold",
      detail: 'named again as "threshold" later in this call',
    });
  });
});
