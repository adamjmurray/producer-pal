// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEVICE_VIEW_ANCHORS } from "../helpers/build-open-device-window-steps.ts";
import { openDeviceWindow } from "../open-device-window.ts";

describe("ppal-open-device-window runbook", () => {
  it("starts with a selection-verify screenshot and ends with a verify screenshot", () => {
    const result = openDeviceWindow({ devicePath: "t0/d1" });

    expect(result.steps[0]).toMatchObject({ action: "screenshot" });
    expect(result.steps.at(-1)).toMatchObject({ action: "screenshot" });
  });

  it("never sends Tab (toggles view) or auto-Escape", () => {
    const result = openDeviceWindow({ devicePath: "t0/d1" });
    const keys = result.steps.filter((s) => s.action === "key");

    expect(keys).toHaveLength(0);
  });

  it("clicks the show-plugin-window button at the default device-view anchor", () => {
    const result = openDeviceWindow({ devicePath: "t0/d1" });
    const click = result.steps.find((s) => s.action === "left_click");

    expect(click).toMatchObject({
      action: "left_click",
      coordinate: DEVICE_VIEW_ANCHORS.showWindowButton,
    });
  });

  it("explicit editX/editY override the default anchor", () => {
    const result = openDeviceWindow({
      devicePath: "t0/d1",
      editX: 900,
      editY: 660,
    });
    const click = result.steps.find((s) => s.action === "left_click");

    expect(click).toMatchObject({
      action: "left_click",
      coordinate: [900, 660],
    });
  });

  it("editX without editY throws (half-override is silently wrong-target)", () => {
    expect(() => openDeviceWindow({ devicePath: "t0/d1", editX: 900 })).toThrow(
      /editX and editY must be supplied as a pair/,
    );
  });

  it("editY without editX also throws", () => {
    expect(() => openDeviceWindow({ devicePath: "t0/d1", editY: 660 })).toThrow(
      /editX and editY must be supplied as a pair/,
    );
  });

  it("settles after the click before the verify screenshot", () => {
    const result = openDeviceWindow({ devicePath: "t0/d1" });
    const clickIdx = result.steps.findIndex((s) => s.action === "left_click");
    const next = result.steps[clickIdx + 1];

    expect(next).toMatchObject({ action: "wait" });
    expect((next as { duration: number }).duration).toBeGreaterThan(0);
  });

  it("verify is vision-only and echoes the devicePath", () => {
    const result = openDeviceWindow({ devicePath: "t2/d0" });

    expect(result.verify).toStrictEqual({
      windowShouldAppear: true,
      devicePath: "t2/d0",
      visionOnly: true,
    });
  });

  it("failModes cover native-device-no-window and window-behind-live, distinct", () => {
    const result = openDeviceWindow({ devicePath: "t0/d1" });

    expect(result.failModes.length).toBeGreaterThanOrEqual(3);
    const symptoms = new Set(result.failModes.map((f) => f.symptom));

    expect(symptoms.size).toBe(result.failModes.length);
    expect(result.failModes.some((f) => /native/i.test(f.symptom))).toBe(true);
    expect(result.failModes.some((f) => /behind|hinter/i.test(f.symptom))).toBe(
      true,
    );
  });

  it("meta carries tool, version, locale default, estimatedSeconds", () => {
    const r = openDeviceWindow({ devicePath: "t0/d1" });

    expect(r.meta.tool).toBe("ppal-open-device-window");
    expect(r.meta.version).toBe("1.0.0");
    expect(r.meta.abletonLocale).toBe("unknown");
    expect(r.meta.estimatedSeconds).toBeGreaterThan(0);
  });

  it("passes through an explicit abletonLocale to meta", () => {
    const r = openDeviceWindow({ devicePath: "t0/d1", abletonLocale: "de" });

    expect(r.meta.abletonLocale).toBe("de");
  });

  it("warns in meta.notes when the default set-dependent anchor is used", () => {
    const r = openDeviceWindow({ devicePath: "t0/d1" });

    expect(r.meta.notes.length).toBeGreaterThan(0);
    expect(r.meta.notes.some((n) => /set-dependent/i.test(n))).toBe(true);
  });

  it("omits the default-anchor warning when explicit editX/editY are supplied", () => {
    const r = openDeviceWindow({ devicePath: "t0/d1", editX: 900, editY: 660 });

    expect(r.meta.notes).toStrictEqual([]);
  });
});
