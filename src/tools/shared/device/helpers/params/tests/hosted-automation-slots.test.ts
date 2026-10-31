// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { installWrapper } from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  mapSlot,
  parseSlotName,
  readSlotMap,
  slotName,
} from "../hosted-automation-slots.ts";

describe("slot names", () => {
  it("pads the number to three digits, as the wrapper names its slots", () => {
    expect(slotName(2)).toBe("Automation 002");
    expect(slotName(128)).toBe("Automation 128");
  });

  it("reads a slot number back from a name, and only from a slot's name", () => {
    expect(parseSlotName("Automation 002")).toBe(2);
    expect(parseSlotName("Automation 2")).toBeNull();
    expect(parseSlotName("Device On")).toBeNull();
  });
});

describe("readSlotMap", () => {
  it("reads a wrapper's slot count and what its slots drive", () => {
    installWrapper({
      slots: () => ({
        success: true,
        slotCount: 128,
        slots: [{ slot: 3, index: 7, name: "Cutoff" }],
      }),
    });

    expect(readSlotMap("9")).toStrictEqual({
      ok: true,
      slots: {
        count: 128,
        mapped: new Map([[3, { slot: 3, index: 7, name: "Cutoff" }]]),
      },
    });
  });

  it("reads a wrapper that lists nothing as having no slots", () => {
    installWrapper({ slots: () => ({ success: true }) });

    expect(readSlotMap("9")).toStrictEqual({
      ok: true,
      slots: { count: 0, mapped: new Map() },
    });
  });

  it("says why a wrapper's answer is no use", () => {
    installWrapper({ slots: () => ({ success: false, error: "boom" }) });

    expect(readSlotMap("9")).toStrictEqual({
      ok: false,
      reason: "couldn't read the automation slots: boom",
    });
  });
});

describe("mapSlot", () => {
  it("maps a slot and gives the param's name", () => {
    const heard = installWrapper({
      map: () => ({ success: true, slot: 2, index: 5, name: "Cutoff" }),
    });

    expect(mapSlot("9", 2, 5)).toStrictEqual({ ok: true, name: "Cutoff" });
    expect(heard).toStrictEqual([
      { deviceId: "9", op: "map", slot: 2, index: 5 },
    ]);
  });

  it("gives a blank name when the wrapper sends none", () => {
    installWrapper({ map: () => ({ success: true }) });

    expect(mapSlot("9", 2, 5)).toStrictEqual({ ok: true, name: "" });
  });

  it("says when the device is still loading", () => {
    installWrapper({
      map: () => ({ success: false, error: "the device is still loading" }),
    });

    expect(mapSlot("9", 2, 5)).toStrictEqual({
      ok: false,
      reason: "the device is still loading; try again in a moment",
    });
  });

  it("says when nothing answers", () => {
    vi.mocked(globalThis.messnamed).mockReset();

    expect(mapSlot("9", 2, 5)).toStrictEqual({
      ok: false,
      reason: "the hosted plug-in didn't answer",
    });
  });
});
