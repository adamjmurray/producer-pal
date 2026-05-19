// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import * as zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  isOnlyWindowChanged,
  type ReplacementRange,
} from "../clip-patch-cli.ts";
import { singleRangeReplacement } from "../shared-cli-helpers.ts";

const E2E_ALS = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Eine .als entpacken (gzip) und das rohe XML als String liefern. Verwendet
 * die echten Bytes des e2e-Test-Sets, damit zwei der Guard-Tests aus echten
 * .als-Fixture-Bytes gespeist sind (Mitigation R3 der Premortem).
 * @returns Roh-XML-Inhalt der `.als`-Datei.
 */
function readRealAlsXml(): string {
  return zlib.gunzipSync(readFileSync(E2E_ALS)).toString("utf8");
}

describe("singleRangeReplacement", () => {
  it("delta = 0 (Window-Groesse unveraendert) liefert exakte Window-Bytes", () => {
    const xml = "PREFIX[INSIDE]SUFFIX";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    const updated = "PREFIX[CHANGED]SUFFIX";
    const r = singleRangeReplacement(xml, updated, start, end);

    expect(r).toStrictEqual({ start, end, replacement: "CHANGED" });
  });

  it("delta > 0 (Window waechst) liefert den vergroesserten Slice", () => {
    const xml = "PRE[abc]POST";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    const updated = "PRE[abcdefgh]POST";
    const r = singleRangeReplacement(xml, updated, start, end);

    expect(r).toStrictEqual({ start, end, replacement: "abcdefgh" });
  });

  it("delta < 0 (Window schrumpft) liefert den verkleinerten Slice", () => {
    const xml = "PRE[abcdef]POST";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    const updated = "PRE[xy]POST";
    const r = singleRangeReplacement(xml, updated, start, end);

    expect(r).toStrictEqual({ start, end, replacement: "xy" });
  });

  it("delta = -(end-start) (Window komplett geleert) liefert leeren String", () => {
    const xml = "PRE[abcdef]POST";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    const updated = "PRE[]POST";
    const r = singleRangeReplacement(xml, updated, start, end);

    expect(r).toStrictEqual({ start, end, replacement: "" });
  });
});

describe("isOnlyWindowChanged — Happy Pfade", () => {
  it("Single-Range: korrekter Ersatz an [start,end) -> true", () => {
    const xml = 'PREFIX<Tag Value="OLD" />SUFFIX';
    const start = xml.indexOf("OLD");
    const end = start + "OLD".length;
    const updated = 'PREFIX<Tag Value="NEW_VALUE" />SUFFIX';
    const ranges: ReplacementRange[] = [
      { start, end, replacement: "NEW_VALUE" },
    ];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(true);
  });

  it("Multi-Range: zwei disjunkte Subranges korrekt -> true", () => {
    const xml = "AAA<X>11</X>BBB<Y>22</Y>CCC";
    const s1 = xml.indexOf("11");
    const e1 = s1 + "11".length;
    const s2 = xml.indexOf("22");
    const e2 = s2 + "22".length;
    const updated = "AAA<X>9999</X>BBB<Y>3</Y>CCC";
    const ranges: ReplacementRange[] = [
      { start: s1, end: e1, replacement: "9999" },
      { start: s2, end: e2, replacement: "3" },
    ];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(true);
  });

  it("Single-Range mit echten .als-Bytes (Mitigation R3): Tempo-Tag patchen", () => {
    const xml = readRealAlsXml();
    const tempoTag = xml.match(/<Manual Value="[^"]*" \/>/);

    if (tempoTag == null)
      throw new Error("Test-Setup: kein <Manual>-Tag in e2e .als");
    const start = tempoTag.index as number;
    const end = start + tempoTag[0].length;
    const replacement = '<Manual Value="111" />';
    const updated = xml.slice(0, start) + replacement + xml.slice(end);
    const ranges: ReplacementRange[] = [{ start, end, replacement }];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(true);
  });
});

describe("isOnlyWindowChanged — Defekt-Faenge", () => {
  it("Prefix-Mutation -> false", () => {
    const xml = "PREFIX[INSIDE]SUFFIX";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    const updated = "PRefIX[CHANGED]SUFFIX";
    const ranges: ReplacementRange[] = [{ start, end, replacement: "CHANGED" }];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(false);
  });

  it("Suffix-Mutation -> false", () => {
    const xml = "PREFIX[INSIDE]SUFFIX";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    const updated = "PREFIX[CHANGED]SUffIX";
    const ranges: ReplacementRange[] = [{ start, end, replacement: "CHANGED" }];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(false);
  });

  it("Gap-Mutation zwischen 2 Ranges -> false (NEUER Schutz)", () => {
    const xml = "AAA<X>11</X>BBB<Y>22</Y>CCC";
    const s1 = xml.indexOf("11");
    const e1 = s1 + "11".length;
    const s2 = xml.indexOf("22");
    const e2 = s2 + "22".length;
    // BBB -> BXB im Gap zwischen Range 1 und Range 2.
    const updated = "AAA<X>9999</X>BXB<Y>3</Y>CCC";
    const ranges: ReplacementRange[] = [
      { start: s1, end: e1, replacement: "9999" },
      { start: s2, end: e2, replacement: "3" },
    ];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(false);
  });

  it("Replacement-Mismatch: deklarierter Inhalt != tatsaechlicher Inhalt -> false", () => {
    const xml = "PREFIX[INSIDE]SUFFIX";
    const start = xml.indexOf("[") + 1;
    const end = xml.indexOf("]");
    // updated enthaelt "OTHER" obwohl Range "CHANGED" deklariert.
    const updated = "PREFIX[OTHER]SUFFIX";
    const ranges: ReplacementRange[] = [{ start, end, replacement: "CHANGED" }];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(false);
  });

  it("Defekt mit echten .als-Bytes (Mitigation R3): unerwartete Byte-Aenderung ausserhalb des Tempo-Fensters wird gefangen", () => {
    const xml = readRealAlsXml();
    const tempoTag = xml.match(/<Manual Value="[^"]*" \/>/);

    if (tempoTag == null)
      throw new Error("Test-Setup: kein <Manual>-Tag in e2e .als");
    const start = tempoTag.index as number;
    const end = start + tempoTag[0].length;
    const replacement = '<Manual Value="111" />';
    // Das Tempo-Fenster KORREKT patchen — aber zusaetzlich eine
    // Byte-Mutation 200 Bytes spaeter einschleusen.
    const corruptIdx = end + 200;
    const updated =
      xml.slice(0, start) +
      replacement +
      xml.slice(end, corruptIdx) +
      "X" +
      xml.slice(corruptIdx + 1);
    const ranges: ReplacementRange[] = [{ start, end, replacement }];

    expect(isOnlyWindowChanged(xml, updated, ranges)).toBe(false);
  });
});

describe("isOnlyWindowChanged — Validierung", () => {
  it("leeres Range-Array -> throw", () => {
    expect(() => isOnlyWindowChanged("abc", "abc", [])).toThrow(/leer/i);
  });

  it("Ueberlappung -> throw", () => {
    const ranges: ReplacementRange[] = [
      { start: 0, end: 10, replacement: "x" },
      { start: 5, end: 15, replacement: "y" },
    ];

    expect(() => isOnlyWindowChanged("0123456789abcdef", "x", ranges)).toThrow(
      /ueberlapp|überlapp/i,
    );
  });

  it("falsche Reihenfolge -> throw", () => {
    const ranges: ReplacementRange[] = [
      { start: 10, end: 12, replacement: "y" },
      { start: 0, end: 5, replacement: "x" },
    ];

    expect(() => isOnlyWindowChanged("0123456789abcdef", "x", ranges)).toThrow(
      /sortiert|reihenfolge/i,
    );
  });

  it("Out-of-bounds start < 0 -> throw", () => {
    const ranges: ReplacementRange[] = [
      { start: -1, end: 5, replacement: "x" },
    ];

    expect(() => isOnlyWindowChanged("abcdef", "x", ranges)).toThrow(
      /bereich|bounds/i,
    );
  });

  it("Out-of-bounds end > xml.length -> throw", () => {
    const ranges: ReplacementRange[] = [
      { start: 0, end: 999, replacement: "x" },
    ];

    expect(() => isOnlyWindowChanged("abcdef", "x", ranges)).toThrow(
      /bereich|bounds/i,
    );
  });

  it("Out-of-bounds start >= end -> throw", () => {
    const ranges: ReplacementRange[] = [{ start: 3, end: 3, replacement: "x" }];

    expect(() => isOnlyWindowChanged("abcdef", "x", ranges)).toThrow(
      /bereich|bounds/i,
    );
  });
});
