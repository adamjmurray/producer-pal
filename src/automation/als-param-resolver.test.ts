// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { listDeviceParams, resolveAutomationTargetId } from "./als-param-resolver.ts";

// Real Operator nesting: Filter > Frequency (nested param), flat Globals > Volume,
// and Filter > LegacyQ. Track name resolved via EffectiveName (UserName is empty).
const FIXTURE = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="18">`,
  `<Name><EffectiveName Value="Spike Instr" /><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Operator Id="0">`,
  `<Globals>`,
  `<Volume>`,
  `<LomId Value="0" />`,
  `<Manual Value="1" />`,
  `<AutomationTarget Id="22715" />`,
  `</Volume>`,
  `</Globals>`,
  `<Filter>`,
  `<Frequency>`,
  `<LomId Value="0" />`,
  `<Manual Value="12000" />`,
  `<MidiControllerRange><Min Value="30" /><Max Value="18500" /></MidiControllerRange>`,
  `<AutomationTarget Id="23005" />`,
  `</Frequency>`,
  `<LegacyQ>`,
  `<Manual Value="1" />`,
  `<AutomationTarget Id="23007" />`,
  `</LegacyQ>`,
  `</Filter>`,
  `</Operator>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Fixture with two <Frequency> elements under different parents — for disambiguation tests.
const FIXTURE_DUPLICATE = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="1">`,
  `<Name><EffectiveName Value="Dup Track" /><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Operator Id="0">`,
  `<Filter>`,
  `<Frequency>`,
  `<LomId Value="0" />`,
  `<Manual Value="12000" />`,
  `<MidiControllerRange><Min Value="30" /><Max Value="18500" /></MidiControllerRange>`,
  `<AutomationTarget Id="23005" />`,
  `</Frequency>`,
  `</Filter>`,
  `<OscA>`,
  `<Frequency>`,
  `<LomId Value="0" />`,
  `<Manual Value="440" />`,
  `<AutomationTarget Id="23100" />`,
  `</Frequency>`,
  `</OscA>`,
  `</Operator>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

describe("listDeviceParams", () => {
  it("findet alle Parameter rekursiv: zaehlt Volume, Frequency, LegacyQ", () => {
    const params = listDeviceParams(FIXTURE, "Spike Instr", 0);

    expect(params).toHaveLength(3);

    const volume = params.find((p) => p.element === "Volume");

    expect(volume).toBeDefined();
    expect(volume?.automationTargetId).toBe("22715");
    expect(volume?.min).toBeNull();
    expect(volume?.max).toBeNull();
    expect(volume?.manual).toBe(1);
  });

  it("findet verschachtelte Params: Frequency mit min/max und LegacyQ ohne", () => {
    const params = listDeviceParams(FIXTURE, "Spike Instr", 0);
    const freq = params.find((p) => p.element === "Frequency");
    const legacyQ = params.find((p) => p.element === "LegacyQ");

    expect(freq).toBeDefined();
    expect(freq?.automationTargetId).toBe("23005");
    expect(freq?.min).toBe(30);
    expect(freq?.max).toBe(18500);
    expect(freq?.manual).toBe(12000);

    expect(legacyQ).toBeDefined();
    expect(legacyQ?.automationTargetId).toBe("23007");
    expect(legacyQ?.min).toBeNull();
    expect(legacyQ?.max).toBeNull();
    expect(legacyQ?.manual).toBe(1);
  });

  it("loest Track-Namen via EffectiveName auf wenn UserName leer ist", () => {
    const params = listDeviceParams(FIXTURE, "Spike Instr", 0);

    expect(params.length).toBeGreaterThan(0);
  });

  it("wirft bei unbekanntem Track", () => {
    expect(() => listDeviceParams(FIXTURE, "Ghost Track", 0)).toThrow(/nicht gefunden/);
    expect(() => listDeviceParams(FIXTURE, "Ghost Track", 0)).toThrow(/Ghost Track/);
  });
});

describe("resolveAutomationTargetId", () => {
  it("loest Frequency per exaktem Element-Namen auf (nested unter Filter)", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Frequency");

    expect(param.automationTargetId).toBe("23005");
    expect(param.element).toBe("Frequency");
    expect(param.min).toBe(30);
    expect(param.max).toBe(18500);
  });

  it("loest per Alias 'Filter Freq' auf (23005)", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Filter Freq");

    expect(param.automationTargetId).toBe("23005");
  });

  it("loest per Alias 'Filter Frequency' auf (23005)", () => {
    const param = resolveAutomationTargetId(FIXTURE, "Spike Instr", 0, "Filter Frequency");

    expect(param.automationTargetId).toBe("23005");
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

  it("wirft mehrdeutig-Fehler bei doppeltem Element-Namen ohne occurrence", () => {
    expect(() =>
      resolveAutomationTargetId(FIXTURE_DUPLICATE, "Dup Track", 0, "Frequency"),
    ).toThrow(/mehrdeutig/);
    // Error must list both target ids
    expect(() =>
      resolveAutomationTargetId(FIXTURE_DUPLICATE, "Dup Track", 0, "Frequency"),
    ).toThrow(/23005/);
    expect(() =>
      resolveAutomationTargetId(FIXTURE_DUPLICATE, "Dup Track", 0, "Frequency"),
    ).toThrow(/23100/);
  });

  it("waehlt per occurrence=1 den zweiten Treffer bei Duplikaten", () => {
    const param = resolveAutomationTargetId(FIXTURE_DUPLICATE, "Dup Track", 0, "Frequency", 1);

    expect(param.automationTargetId).toBe("23100");
  });
});
