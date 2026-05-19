// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import {
  getTrackRouting,
  patchTrackRouting,
  ROUTING_TARGETS,
  type RoutingKind,
} from "#src/automation/als-routing.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const MIDI_TRACK = "Drums";
const AUDIO_TRACK = "Audio 1";

const KIND_TO_TAG: Record<RoutingKind, string> = {
  "audio-in": "AudioInputRouting",
  "audio-out": "AudioOutputRouting",
  "midi-in": "MidiInputRouting",
  "midi-out": "MidiOutputRouting",
};

/**
 * Den Track-Block aus dem ECHTEN e2e-test-set holen.
 * @param track - Anzeigename des Ziel-Tracks.
 * @returns Roher Track-Block-String (von locateTrackBlock).
 */
function block(track: string): string {
  return locateTrackBlock(readAls(SET), track).block;
}

describe("ROUTING_TARGETS Tabelle (byte-belegt, woertlich)", () => {
  it("enthaelt exakt die Recon-Tripel inkl. leerer lower", () => {
    expect(ROUTING_TARGETS["audio-in"].none).toStrictEqual({
      target: "AudioIn/None",
      upper: "No Output",
      lower: "",
    });
    expect(ROUTING_TARGETS["audio-in"]["ext-stereo"]).toStrictEqual({
      target: "AudioIn/External/S0",
      upper: "Ext. In",
      lower: "1/2",
    });
    expect(ROUTING_TARGETS["audio-in"]["ext-mono"]).toStrictEqual({
      target: "AudioIn/External/M0",
      upper: "Ext. In",
      lower: "1",
    });
    expect(ROUTING_TARGETS["audio-out"].main).toStrictEqual({
      target: "AudioOut/Main",
      upper: "Main",
      lower: "",
    });
    expect(ROUTING_TARGETS["audio-out"].none).toStrictEqual({
      target: "AudioOut/None",
      upper: "No Output",
      lower: "",
    });
    expect(ROUTING_TARGETS["audio-out"]["ext-stereo"]).toStrictEqual({
      target: "AudioOut/External/S0",
      upper: "Ext. Out",
      lower: "1/2",
    });
    expect(ROUTING_TARGETS["midi-in"]["ext-all"]).toStrictEqual({
      target: "MidiIn/External.All/-1",
      upper: "Ext: All Ins",
      lower: "",
    });
    expect(ROUTING_TARGETS["midi-out"].none).toStrictEqual({
      target: "MidiOut/None",
      upper: "None",
      lower: "",
    });
  });
});

describe.each([
  ["MIDI", MIDI_TRACK],
  ["Audio", AUDIO_TRACK],
])("getTrackRouting (%s-Track)", (_label, track) => {
  it("liefert plausible rohe Tripel fuer alle 4 Routings", () => {
    const r = getTrackRouting(block(track));

    expect(r["midi-in"]).toStrictEqual({
      target: "MidiIn/External.All/-1",
      upper: "Ext: All Ins",
      lower: "",
    });
    expect(r["midi-out"]).toStrictEqual({
      target: "MidiOut/None",
      upper: "None",
      lower: "",
    });
    expect(r["audio-in"].target.startsWith("AudioIn/")).toBe(true);
    expect(r["audio-out"].target.startsWith("AudioOut/")).toBe(true);
  });
});

describe.each([
  ["MIDI", MIDI_TRACK],
  ["Audio", AUDIO_TRACK],
])("patchTrackRouting jedes (kind,key) (%s-Track)", (_label, track) => {
  it("schreibt jedes gueltige Tripel woertlich, Re-Parse == Tabelle", () => {
    const base = block(track);

    for (const kind of Object.keys(ROUTING_TARGETS) as RoutingKind[]) {
      for (const key of Object.keys(ROUTING_TARGETS[kind])) {
        const want = ROUTING_TARGETS[kind][key];
        const out = patchTrackRouting(base, kind, key);

        expect(getTrackRouting(out)[kind]).toStrictEqual(want);
      }
    }
  });

  it("laesst die anderen 3 Routings + MpeSettings + Rest byte-unveraendert", () => {
    const base = block(track);
    const out = patchTrackRouting(base, "audio-out", "none");

    // Andere 3 Routings unveraendert.
    for (const kind of ["audio-in", "midi-in", "midi-out"] as RoutingKind[]) {
      const re = new RegExp(
        `<${KIND_TO_TAG[kind]}>[\\s\\S]*?</${KIND_TO_TAG[kind]}>`,
      );

      expect(out.match(re)?.[0]).toBe(base.match(re)?.[0]);
    }

    // MpeSettings im Ziel-Block byte-identisch.
    const mpeRe = /<MpeSettings>[\S\s]*?<\/MpeSettings>/g;

    expect([...out.matchAll(mpeRe)].map((m) => m[0])).toStrictEqual(
      [...base.matchAll(mpeRe)].map((m) => m[0]),
    );

    // Nur der AudioOutputRouting-Block aendert sich: davor/danach identisch.
    const aoRe = /<AudioOutputRouting>[\S\s]*?<\/AudioOutputRouting>/;
    const bm = base.match(aoRe);
    const om = out.match(aoRe);

    expect(bm?.index).toBe(om?.index);
    expect(base.slice(0, bm?.index)).toBe(out.slice(0, om?.index));
    expect(base.slice((bm?.index ?? 0) + (bm?.[0].length ?? 0))).toBe(
      out.slice((om?.index ?? 0) + (om?.[0].length ?? 0)),
    );
  });

  it("bewahrt das exakte Whitespace-/Self-Close-Format", () => {
    const out = patchTrackRouting(block(track), "audio-out", "ext-stereo");

    expect(out).toContain('<Target Value="AudioOut/External/S0" />');
    expect(out).toContain('<UpperDisplayString Value="Ext. Out" />');
    expect(out).toContain('<LowerDisplayString Value="1/2" />');
  });
});

describe("patchTrackRouting Guards (kein Partial-Write, R4/R6)", () => {
  it("wirft bei unbekanntem kind", () => {
    expect(() =>
      patchTrackRouting(block(MIDI_TRACK), "bogus" as RoutingKind, "none"),
    ).toThrow();
  });

  it("wirft bei unbekanntem key", () => {
    expect(() =>
      patchTrackRouting(block(MIDI_TRACK), "audio-out", "nope"),
    ).toThrow();
  });

  it("wirft bei kind-fremdem key (cross-kind, R4)", () => {
    // 'main' ist nur fuer audio-out gueltig, nicht fuer midi-in.
    expect(() =>
      patchTrackRouting(block(MIDI_TRACK), "midi-in", "main"),
    ).toThrow();
  });

  it("wirft bei fehlendem Routing-Block (defensiv, R6)", () => {
    expect(() =>
      patchTrackRouting("<Foo></Foo>", "audio-out", "main"),
    ).toThrow();
  });

  it("wirft bei fehlendem Tag im Block (Teil-Patch verboten, R6)", () => {
    const broken =
      '<MidiOutputRouting><Target Value="x" />' +
      '<LowerDisplayString Value="" /></MidiOutputRouting>';

    expect(() => patchTrackRouting(broken, "midi-out", "none")).toThrow();
  });
});

describe("getTrackRouting bei fehlenden Blocken (R5 keine toten Branches)", () => {
  it("liefert leere Tripel wenn ein Block fehlt", () => {
    const r = getTrackRouting("<DeviceChain></DeviceChain>");

    expect(r["audio-in"]).toStrictEqual({ target: "", upper: "", lower: "" });
    expect(r["midi-out"]).toStrictEqual({ target: "", upper: "", lower: "" });
  });

  it("liefert leere Felder fuer fehlende Tags in einem vorhandenen Block", () => {
    // Block existiert, aber Upper/Lower fehlen -> readAttr m==null-Zweig
    // (defensiv, kein toter Branch).
    const partial =
      '<AudioOutputRouting><Target Value="AudioOut/Main" />' +
      "</AudioOutputRouting>";
    const r = getTrackRouting(partial);

    expect(r["audio-out"]).toStrictEqual({
      target: "AudioOut/Main",
      upper: "",
      lower: "",
    });
  });
});
