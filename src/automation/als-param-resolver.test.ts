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

// GroupTrack containing two AudioTracks — K1: GroupTrack must NOT be matched
// as a track block by locateTrackBlock; the inner AudioTrack must resolve to
// its own complete block, not a truncated/over-greedy match.
const FIXTURE_GROUP = [
  `<Ableton><Tracks>`,
  `<GroupTrack Id="5">`,
  `<Name><EffectiveName Value="My Group" /><UserName Value="" /></Name>`,
  `<DeviceChain><Mixer><Volume>`,
  `<AutomationTarget Id="500" /></Volume></Mixer></DeviceChain>`,
  `</GroupTrack>`,
  `<AudioTrack Id="6">`,
  `<Name><EffectiveName Value="Inner A" /><UserName Value="" /></Name>`,
  `<DeviceChain><Mixer>`,
  `<Volume><AutomationTarget Id="601" /></Volume>`,
  `<Pan><AutomationTarget Id="602" /></Pan>`,
  `</Mixer></DeviceChain>`,
  `</AudioTrack>`,
  `<AudioTrack Id="7">`,
  `<Name><EffectiveName Value="Inner B" /><UserName Value="" /></Name>`,
  `<DeviceChain><Mixer>`,
  `<Volume><AutomationTarget Id="701" /></Volume>`,
  `</Mixer></DeviceChain>`,
  `</AudioTrack>`,
  `</Tracks></Ableton>`,
].join("");

// AudioTrack with UserName != EffectiveName — W1: locateTrackBlock must use
// the same extractTrackName() logic as listDeviceParams (UserName preferred).
const FIXTURE_MIXER_USERNAME = [
  `<Ableton><Tracks>`,
  `<AudioTrack Id="8">`,
  `<Name><EffectiveName Value="Audio 1" /><UserName Value="Renamed Bus" /></Name>`,
  `<DeviceChain><Mixer>`,
  `<Volume><AutomationTarget Id="801" /></Volume>`,
  `</Mixer></DeviceChain>`,
  `</AudioTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Mixer values in scientific / E-notation — K2: number regex must parse these
// without producing NaN.
const FIXTURE_ENOTATION = [
  `<Ableton><Tracks>`,
  `<AudioTrack Id="9">`,
  `<Name><EffectiveName Value="ENot" /><UserName Value="" /></Name>`,
  `<DeviceChain><Mixer>`,
  `<Volume>`,
  `<Manual Value="1.5E-3" />`,
  `<MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1.99526238E0" /></MidiControllerRange>`,
  `<AutomationTarget Id="901" />`,
  `</Volume>`,
  `</Mixer></DeviceChain>`,
  `</AudioTrack>`,
  `</Tracks></Ableton>`,
].join("");

// Track with a Mixer but no TrackSendHolder — W3(c): send:0 must throw a
// descriptive error stating zero sends are present.
const FIXTURE_NO_SENDS = [
  `<Ableton><Tracks>`,
  `<AudioTrack Id="11">`,
  `<Name><EffectiveName Value="No Sends" /><UserName Value="" /></Name>`,
  `<DeviceChain><Mixer>`,
  `<Volume><AutomationTarget Id="1101" /></Volume>`,
  `</Mixer></DeviceChain>`,
  `</AudioTrack>`,
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

  // Slice-2 Bug-Fix: vor der Konsolidierung matchte listDeviceParams nur
  // <MidiTrack> — ein AudioTrack mit Device scheiterte still ("nicht
  // gefunden"). Der kanonische Locator deckt MidiTrack|AudioTrack ab.
  it("findet Device-Params auch in einem AudioTrack (Slice-2 AudioTrack-Fix)", () => {
    const fixtureAudioDevice = [
      `<Ableton><Tracks>`,
      `<AudioTrack Id="70">`,
      `<Name><EffectiveName Value="Gtr Bus" /><UserName Value="" /></Name>`,
      `<DeviceChain><DeviceChain><Devices>`,
      `<Eq8 Id="0">`,
      `<Gain>`,
      `<LomId Value="0" />`,
      `<Manual Value="3.5" />`,
      `<MidiControllerRange><Min Value="-15" /><Max Value="15" /></MidiControllerRange>`,
      `<AutomationTarget Id="42042" />`,
      `</Gain>`,
      `</Eq8>`,
      `</Devices></DeviceChain></DeviceChain>`,
      `</AudioTrack>`,
      `</Tracks></Ableton>`,
    ].join("");

    const params = listDeviceParams(fixtureAudioDevice, "Gtr Bus", 0);

    expect(params).toHaveLength(1);
    expect(params[0]?.element).toBe("Gain");
    expect(params[0]?.automationTargetId).toBe("42042");
    expect(params[0]?.min).toBe(-15);
    expect(params[0]?.max).toBe(15);
    expect(params[0]?.manual).toBe(3.5);

    // resolveAutomationTargetId muss denselben AudioTrack-Param auflösen.
    const resolved = resolveAutomationTargetId(
      fixtureAudioDevice,
      "Gtr Bus",
      0,
      "Gain",
    );

    expect(resolved.automationTargetId).toBe("42042");
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

  // Negativer occurrence umgeht den ">= length"-Bound-Check (-1 >= 2 == false),
  // matches[-1] ist undefined -> defensiver result==null-Guard muss greifen.
  it("wirft defensiven Format-Guard bei negativem occurrence (-1)", () => {
    expect(() =>
      resolveAutomationTargetId(
        FIXTURE_DUPLICATE,
        "Dup Track",
        0,
        "Frequency",
        -1,
      ),
    ).toThrow(/unerwartetes \.als-Format: kein Param an Index -1/);
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

  // K1: GroupTrack darf nicht als Track-Block gematcht werden; ein innerer
  // AudioTrack muss seinen eigenen vollständigen Block liefern (nicht durch
  // GroupTrack-Greedy abgeschnitten/überschrieben).
  it("matcht GroupTrack NICHT und liefert inneren AudioTrack-Block vollständig", () => {
    const r = locateTrackBlock(FIXTURE_GROUP, "Inner A");

    expect(r.block).toContain(`AutomationTarget Id="601"`);
    expect(r.block).toContain(`AutomationTarget Id="602"`);
    expect(r.block).toContain("</AudioTrack>");
    // Block darf nicht in GroupTrack-Markup oder den Nachbar-Track lecken
    expect(r.block).not.toContain("GroupTrack");
    expect(r.block).not.toContain(`AutomationTarget Id="701"`);
    // GroupTrack-Name darf nicht in der Namensliste auftauchen
    expect(r.names).not.toContain("My Group");
    expect(r.names).toStrictEqual(["Inner A", "Inner B"]);
  });

  it("findet auch den zweiten inneren AudioTrack korrekt", () => {
    const r = locateTrackBlock(FIXTURE_GROUP, "Inner B");

    expect(r.block).toContain(`AutomationTarget Id="701"`);
    expect(r.block).not.toContain(`AutomationTarget Id="601"`);
  });

  // W1: gleiche extractTrackName()-Logik wie listDeviceParams — UserName
  // bevorzugt vor EffectiveName.
  it("löst Track-Namen via UserName auf (Konsistenz mit listDeviceParams)", () => {
    const r = locateTrackBlock(FIXTURE_MIXER_USERNAME, "Renamed Bus");

    expect(r.block).toContain(`AutomationTarget Id="801"`);
    expect(r.names).toContain("Renamed Bus");
    expect(r.names).not.toContain("Audio 1");
  });
});

describe("resolveMixerTarget", () => {
  const xml = readAls(MULTISEND_ALS);

  // W2: gegen die konkrete Fixture-Id gehärtet (aus der echten .als ermittelt).
  it("löst Mixer-Volume zu konkreter AutomationTarget Id + Range auf", () => {
    const r = resolveMixerTarget(xml, TRACK, "volume");

    expect(r.element).toBe("Volume");
    expect(r.automationTargetId).toBe("22230");
    expect(r.min).toBe(0.0003162277571);
    expect(r.max).toBe(1.99526238);
    expect(r.manual).toBe(0.5011872053);
  });
  it("löst Mixer-Pan zu konkreter Id + Range auf", () => {
    const r = resolveMixerTarget(xml, TRACK, "pan");

    expect(r.element).toBe("Pan");
    expect(r.automationTargetId).toBe("22224");
    expect(r.min).toBe(-1);
    expect(r.max).toBe(1);
  });
  it("löst Send mit Index auf (send:0) zu konkreter Id", () => {
    const r = resolveMixerTarget(xml, TRACK, "send:0");

    expect(r.element).toBe("Send");
    expect(r.automationTargetId).toBe("22219");
  });
  // W3(a): zweiter Send.
  it("löst Send mit Index auf (send:1) zu konkreter Id", () => {
    const r = resolveMixerTarget(xml, TRACK, "send:1");

    expect(r.element).toBe("Send");
    expect(r.automationTargetId).toBe("22221");
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

  // W3(b): Sends werden per Id-Attribut gematcht, NICHT per Array-Position.
  // Festgeschrieben mit einer Fixture, deren TrackSendHolder-Ids nicht
  // 0,1,2… in Dokumentreihenfolge sind: send:7 muss den Holder mit Id="7"
  // treffen (zweites Element im Dokument), nicht den an Position 7.
  it("matcht Sends per Id-Attribut, nicht per Array-Position", () => {
    const fixtureSendIds = [
      `<Ableton><Tracks>`,
      `<AudioTrack Id="12">`,
      `<Name><EffectiveName Value="SendIds" /><UserName Value="" /></Name>`,
      `<DeviceChain><Mixer>`,
      `<TrackSendHolder Id="3"><Send>`,
      `<AutomationTarget Id="3300" /></Send></TrackSendHolder>`,
      `<TrackSendHolder Id="7"><Send>`,
      `<AutomationTarget Id="7700" /></Send></TrackSendHolder>`,
      `</Mixer></DeviceChain>`,
      `</AudioTrack>`,
      `</Tracks></Ableton>`,
    ].join("");

    const r3 = resolveMixerTarget(fixtureSendIds, "SendIds", "send:3");

    expect(r3.automationTargetId).toBe("3300");

    const r7 = resolveMixerTarget(fixtureSendIds, "SendIds", "send:7");

    expect(r7.automationTargetId).toBe("7700");
    // Position-basiert wäre send:1 der zweite Holder — muss hier fehlschlagen
    expect(() =>
      resolveMixerTarget(fixtureSendIds, "SendIds", "send:1"),
    ).toThrow(/außerhalb|1/);
  });

  // W3(c): Track ohne Sends — send:0 wirft mit aussagekräftigem Fehler.
  it("wirft aussagekräftig bei send:0 auf Track ohne Sends", () => {
    expect(() =>
      resolveMixerTarget(FIXTURE_NO_SENDS, "No Sends", "send:0"),
    ).toThrow(/0 Sends vorhanden|außerhalb/);
  });

  // K2: Mixer-Werte in E-Notation müssen korrekt geparst werden (kein NaN).
  it("parst Mixer-Werte in E-Notation ohne NaN", () => {
    const r = resolveMixerTarget(FIXTURE_ENOTATION, "ENot", "volume");

    expect(r.element).toBe("Volume");
    expect(r.automationTargetId).toBe("901");
    expect(r.min).toBe(0.0003162277571);
    expect(r.max).toBe(1.99526238);
    expect(r.manual).toBe(0.0015);
    expect(Number.isNaN(r.min)).toBe(false);
    expect(Number.isNaN(r.max)).toBe(false);
    expect(Number.isNaN(r.manual)).toBe(false);
  });
});

// Slice-2 defensive Error-Branches (resolveMixerTarget/extractMixerParam):
// jeweils gezielt per Inline-XML provoziert, echtes Throw-Verhalten geprueft.
describe("resolveMixerTarget defensive Guards", () => {
  /**
   * Baut eine minimale .als-XML mit AudioTrack "G" und beliebigem DeviceChain-Inhalt.
   * @param chain - XML-Inhalt der DeviceChain (Mixer-Block o.ae.)
   * @returns Vollstaendige .als-XML als String
   */
  const trackXml = (chain: string): string =>
    [
      `<Ableton><Tracks><AudioTrack Id="9">`,
      `<Name><EffectiveName Value="G" /><UserName Value="" /></Name>`,
      `<DeviceChain>${chain}</DeviceChain>`,
      `</AudioTrack></Tracks></Ableton>`,
    ].join("");

  it("wirft 'Kein <Mixer>' wenn Track keinen Mixer-Block hat", () => {
    expect(() => resolveMixerTarget(trackXml(""), "G", "volume")).toThrow(
      /Kein <Mixer> im Track "G"/,
    );
  });

  it("wirft 'Kein <Volume>' wenn Mixer kein Volume-Element hat", () => {
    const xml = trackXml(
      `<Mixer><Pan><AutomationTarget Id="1" /></Pan></Mixer>`,
    );

    expect(() => resolveMixerTarget(xml, "G", "volume")).toThrow(
      /Kein <Volume> im Mixer/,
    );
  });

  it("wirft 'Kein <Pan>' wenn Mixer kein Pan-Element hat", () => {
    const xml = trackXml(
      `<Mixer><Volume><AutomationTarget Id="1" /></Volume></Mixer>`,
    );

    expect(() => resolveMixerTarget(xml, "G", "pan")).toThrow(
      /Kein <Pan> im Mixer/,
    );
  });

  it("wirft 'Kein <Send>' wenn TrackSendHolder keinen Send-Block hat", () => {
    const xml = trackXml(
      `<Mixer><TrackSendHolder Id="0"><Active Value="true" /></TrackSendHolder></Mixer>`,
    );

    expect(() => resolveMixerTarget(xml, "G", "send:0")).toThrow(
      /Kein <Send> in TrackSendHolder 0/,
    );
  });

  it("wirft 'Kein AutomationTarget' wenn Volume-Element keines enthaelt", () => {
    const xml = trackXml(
      `<Mixer><Volume><Manual Value="0.5" /></Volume></Mixer>`,
    );

    expect(() => resolveMixerTarget(xml, "G", "volume")).toThrow(
      /Kein AutomationTarget in <Volume>/,
    );
  });
});
