// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  listDeviceParams,
  resolveAutomationTargetId,
  resolveMixerTarget,
  locateTrackBlock,
} from "./als-param-resolver.ts";
import { readAls } from "./als-file.ts";

const MULTISEND_ALS =
  "/Users/macuser/Desktop/AIbleton/producer-pal/evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";
const TRACK = "Drums";

// Fixture with UserName set to a non-empty string — exercises the UserName branch.
const FIXTURE_USERNAME = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="10">`,
  `<Name><EffectiveName Value="Effective" /><UserName Value="My Track" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Synth Id="0">`,
  `<Volume>`,
  `<LomId Value="0" />`,
  `<Manual Value="0.8" />`,
  `<AutomationTarget Id="9001" />`,
  `</Volume>`,
  `</Synth>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Fixture with two devices under one track — exercises deviceIndex > 0 path.
const FIXTURE_TWO_DEVICES = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="20">`,
  `<Name><EffectiveName Value="Two Devs" /><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<DeviceA Id="0">`,
  `<Gain>`,
  `<LomId Value="0" />`,
  `<Manual Value="1" />`,
  `<AutomationTarget Id="100" />`,
  `</Gain>`,
  `</DeviceA>`,
  `<DeviceB Id="1">`,
  `<Pan>`,
  `<LomId Value="0" />`,
  `<Manual Value="0" />`,
  `<AutomationTarget Id="200" />`,
  `</Pan>`,
  `</DeviceB>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Fixture with no <Devices> block — exercises the devicesMatch == null path.
const FIXTURE_NO_DEVICES = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="30">`,
  `<Name><EffectiveName Value="No Devices" /><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

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

// Fixture with a param having partial MidiControllerRange (Max only, no Min) and no Manual —
// exercises extractMinMax min=null branch (line 81) and extractManual null branch (line 94).
const FIXTURE_PARTIAL_RANGE = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="40">`,
  `<Name><EffectiveName Value="Partial Range" /><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Synth Id="0">`,
  `<Cutoff>`,
  `<LomId Value="0" />`,
  `<MidiControllerRange><Max Value="200" /></MidiControllerRange>`,
  `<AutomationTarget Id="5001" />`,
  `</Cutoff>`,
  `</Synth>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Fixture with a param having partial MidiControllerRange (Min only, no Max) —
// exercises extractMinMax max=null branch (line 82).
const FIXTURE_MIN_ONLY = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="50">`,
  `<Name><EffectiveName Value="Min Only" /><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Synth Id="0">`,
  `<Resonance>`,
  `<LomId Value="0" />`,
  `<MidiControllerRange><Min Value="0" /></MidiControllerRange>`,
  `<AutomationTarget Id="6001" />`,
  `</Resonance>`,
  `</Synth>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Fixture with a track that has no <EffectiveName> tag and empty UserName —
// exercises the effectiveNameMatch == null fallback (line 59), track name resolves to "".
const FIXTURE_NO_EFFECTIVE_NAME = [
  `<Ableton><Tracks>`,
  `<MidiTrack Id="60">`,
  `<Name><UserName Value="" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Synth Id="0">`,
  `<Volume>`,
  `<LomId Value="0" />`,
  `<Manual Value="1" />`,
  `<AutomationTarget Id="7001" />`,
  `</Volume>`,
  `</Synth>`,
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
    expect(() => listDeviceParams(FIXTURE, "Ghost Track", 0)).toThrow(
      /nicht gefunden/,
    );
    expect(() => listDeviceParams(FIXTURE, "Ghost Track", 0)).toThrow(
      /Ghost Track/,
    );
  });

  it("loest Track-Namen via UserName auf wenn UserName nicht leer", () => {
    const params = listDeviceParams(FIXTURE_USERNAME, "My Track", 0);

    expect(params).toHaveLength(1);
    expect(params[0]?.element).toBe("Volume");
    expect(params[0]?.automationTargetId).toBe("9001");
  });

  it("gibt leeres Array zurueck wenn keine Devices-Sektion vorhanden", () => {
    const params = listDeviceParams(FIXTURE_NO_DEVICES, "No Devices", 0);

    expect(params).toStrictEqual([]);
  });

  it("gibt leeres Array zurueck wenn deviceIndex ausserhalb der Geraete-Liste liegt", () => {
    const params = listDeviceParams(FIXTURE, "Spike Instr", 99);

    expect(params).toStrictEqual([]);
  });

  it("waehlt deviceIndex=1 (zweites Geraet) korrekt aus", () => {
    const params = listDeviceParams(FIXTURE_TWO_DEVICES, "Two Devs", 1);

    expect(params).toHaveLength(1);
    expect(params[0]?.element).toBe("Pan");
    expect(params[0]?.automationTargetId).toBe("200");
  });

  it("setzt min=null wenn MidiControllerRange kein <Min> enthaelt", () => {
    const params = listDeviceParams(FIXTURE_PARTIAL_RANGE, "Partial Range", 0);

    expect(params).toHaveLength(1);
    expect(params[0]?.element).toBe("Cutoff");
    expect(params[0]?.min).toBeNull();
    expect(params[0]?.max).toBe(200);
    expect(params[0]?.manual).toBeNull();
  });

  it("setzt max=null wenn MidiControllerRange kein <Max> enthaelt", () => {
    const params = listDeviceParams(FIXTURE_MIN_ONLY, "Min Only", 0);

    expect(params).toHaveLength(1);
    expect(params[0]?.element).toBe("Resonance");
    expect(params[0]?.min).toBe(0);
    expect(params[0]?.max).toBeNull();
  });

  it("gibt leeres Array zurueck wenn kein <EffectiveName>-Tag vorhanden (Track-Name '')", () => {
    const params = listDeviceParams(FIXTURE_NO_EFFECTIVE_NAME, "", 0);

    expect(params).toHaveLength(1);
    expect(params[0]?.element).toBe("Volume");
    expect(params[0]?.automationTargetId).toBe("7001");
  });
});

describe("resolveAutomationTargetId", () => {
  it("loest Frequency per exaktem Element-Namen auf (nested unter Filter)", () => {
    const param = resolveAutomationTargetId(
      FIXTURE,
      "Spike Instr",
      0,
      "Frequency",
    );

    expect(param.automationTargetId).toBe("23005");
    expect(param.element).toBe("Frequency");
    expect(param.min).toBe(30);
    expect(param.max).toBe(18500);
  });

  it("loest per Alias 'Filter Freq' auf (23005)", () => {
    const param = resolveAutomationTargetId(
      FIXTURE,
      "Spike Instr",
      0,
      "Filter Freq",
    );

    expect(param.automationTargetId).toBe("23005");
  });

  it("loest per Alias 'Filter Frequency' auf (23005)", () => {
    const param = resolveAutomationTargetId(
      FIXTURE,
      "Spike Instr",
      0,
      "Filter Frequency",
    );

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
    const param = resolveAutomationTargetId(
      FIXTURE_DUPLICATE,
      "Dup Track",
      0,
      "Frequency",
      1,
    );

    expect(param.automationTargetId).toBe("23100");
  });

  it("wirft wenn occurrence ausserhalb des Bereichs liegt", () => {
    expect(() =>
      resolveAutomationTargetId(
        FIXTURE_DUPLICATE,
        "Dup Track",
        0,
        "Frequency",
        5,
      ),
    ).toThrow(/occurrence 5 ausserhalb/);
  });
});

describe("locateTrackBlock", () => {
  const xml = readAls(MULTISEND_ALS);

  it("liefert Track-Block + alle Namen, eine einzige Quelle", () => {
    const r = locateTrackBlock(xml, TRACK);

    expect(r.block).toContain("<Mixer");
    expect(r.names).toContain(TRACK);
    expect(typeof r.index).toBe("number");
  });
  it("wirft bei unbekanntem Track mit verfügbaren Namen", () => {
    expect(() => locateTrackBlock(xml, "NICHT-DA")).toThrow(
      /nicht-da|verfügbar/i,
    );
  });
});

describe("resolveMixerTarget", () => {
  const xml = readAls(MULTISEND_ALS);

  it("löst Mixer-Volume zu AutomationTarget Id + Range auf", () => {
    const r = resolveMixerTarget(xml, TRACK, "volume");

    expect(r.element).toBe("Volume");
    expect(r.automationTargetId).toMatch(/^\d+$/);
  });
  it("löst Mixer-Pan auf", () => {
    const r = resolveMixerTarget(xml, TRACK, "pan");

    expect(r.element).toBe("Pan");
    expect(r.automationTargetId).toMatch(/^\d+$/);
  });
  it("löst Send mit Index auf (send:0)", () => {
    const r = resolveMixerTarget(xml, TRACK, "send:0");

    expect(r.element).toBe("Send");
    expect(r.automationTargetId).toMatch(/^\d+$/);
  });
  it("wirft bei unbekanntem Target", () => {
    expect(() => resolveMixerTarget(xml, TRACK, "bogus")).toThrow(
      /volume|pan|send/i,
    );
  });
  it("wirft bei Send-Index außerhalb", () => {
    expect(() => resolveMixerTarget(xml, TRACK, "send:99")).toThrow(
      /99|außerhalb|range/i,
    );
  });
});
