// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { listDeviceParams, resolveAutomationTargetId } from "./als-param-resolver.ts";

const FIXTURE = [
  `<Ableton>`,
  `<Tracks>`,
  `<MidiTrack Id="1">`,
  `<Name><EffectiveName Value="SomeDefault" /><UserName Value="Spike Instr" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Operator Id="0">`,
  `<Frequency>`,
  `<Manual Value="12000" />`,
  `<MidiControllerRange><Min Value="30" /><Max Value="18500" /></MidiControllerRange>`,
  `<AutomationTarget Id="23005"><LockEnvelope Value="0" /></AutomationTarget>`,
  `</Frequency>`,
  `<Resonance>`,
  `<Manual Value="0.5" />`,
  `<AutomationTarget Id="23010"><LockEnvelope Value="0" /></AutomationTarget>`,
  `</Resonance>`,
  `</Operator>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks>`,
  `</Ableton>`,
].join("");

describe("listDeviceParams", () => {
  it("gibt Frequency und Resonance mit korrekten Werten zurueck", () => {
    const params = listDeviceParams(FIXTURE, "Spike Instr", 0);

    expect(params).toHaveLength(2);

    const freq = params.find((p) => p.element === "Frequency");
    const res = params.find((p) => p.element === "Resonance");

    expect(freq).toBeDefined();
    expect(freq?.automationTargetId).toBe("23005");
    expect(freq?.min).toBe(30);
    expect(freq?.max).toBe(18500);
    expect(freq?.manual).toBe(12000);

    expect(res).toBeDefined();
    expect(res?.automationTargetId).toBe("23010");
    expect(res?.min).toBeNull();
    expect(res?.max).toBeNull();
    expect(res?.manual).toBe(0.5);
  });

  it("wirft bei unbekanntem Track", () => {
    expect(() => listDeviceParams(FIXTURE, "Ghost Track", 0)).toThrow(/nicht gefunden/);
    expect(() => listDeviceParams(FIXTURE, "Ghost Track", 0)).toThrow(/Ghost Track/);
  });
});

describe("resolveAutomationTargetId", () => {
  it("loest per exaktem Element-Namen auf (Frequency)", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Frequency");

    expect(param.automationTargetId).toBe("23005");
    expect(param.element).toBe("Frequency");
    expect(param.min).toBe(30);
    expect(param.max).toBe(18500);
  });

  it("loest per Alias 'Filter Freq' auf", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Filter Freq");

    expect(param.automationTargetId).toBe("23005");
  });

  it("loest per Alias 'Filter Frequency' auf", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Filter Frequency");

    expect(param.automationTargetId).toBe("23005");
  });

  it("loest Resonance per exaktem Namen auf", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Resonance");

    expect(param.automationTargetId).toBe("23010");
  });

  it("wirft mit verfuegbar-Liste bei unbekanntem Selector", () => {
    expect(() =>
      resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Nope"),
    ).toThrow(/verfuegbar:/);
    expect(() =>
      resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Nope"),
    ).toThrow(/Frequency/);
  });

  it("wirft bei unbekanntem Track", () => {
    expect(() =>
      resolveAutomationTargetId(FIXTURE, "Ghost Track", 0, "Frequency"),
    ).toThrow(/nicht gefunden/);
  });
});
