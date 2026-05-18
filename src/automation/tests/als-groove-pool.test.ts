// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  allocateGrooveId,
  extractGrooveFromAgr,
  injectGrooveIntoPool,
  parseAgr,
  transformToPoolGroove,
} from "../als-groove-pool.ts";
import { readAls } from "../als-file.ts";

const AGR_PATH =
  "/Users/macuser/Desktop/AIbleton/g5b-fixture/G5b-RockFatback.agr";
const GROUNDTRUTH =
  "/Users/macuser/Desktop/AIbleton/docs/superpowers/fixtures/" +
  "ableton12-groove-import-groundtruth.xml";

/**
 * Reads a CDATA section from the G5b ground-truth fixture.
 * @param tag - The wrapping element name (e.g. `AgrGroove`).
 * @returns The trimmed CDATA content.
 */
function gtCdata(tag: string): string {
  const gt = readFileSync(GROUNDTRUTH, "utf8");
  const m = gt.match(
    new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`),
  );

  if (m?.[1] == null) throw new Error(`CDATA ${tag} nicht in Fixture`);

  return m[1].trim();
}

const AGR_BUF = readFileSync(AGR_PATH);
const AGR_TEXT = AGR_BUF.toString("utf8");

/**
 * Indent-normalized line list for structure comparison.
 * @param s - Multi-line XML string.
 * @returns Trimmed non-empty lines.
 */
function norm(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

describe("parseAgr (T2)", () => {
  it("parst die echte G5b-.agr (plain XML, ein <Groove> ohne Id)", () => {
    const groove = parseAgr(AGR_BUF);

    expect(groove.startsWith("<Groove>")).toBe(true);
    expect(groove.endsWith("</Groove>")).toBe(true);
    expect(groove).toContain('<Name Value="Rock Fatback - 4 bars 16ths" />');
    // genau 62 Notes im .agr-Groove
    expect([...groove.matchAll(/<MidiNoteEvent /g)]).toHaveLength(62);
  });

  it("entspricht der Fixture-CDATA <AgrGroove> (byte-genau)", () => {
    expect(parseAgr(AGR_BUF)).toBe(gtCdata("AgrGroove"));
  });

  it("gzip-magic-Byte -> Klartextfehler (kein Binaer-Parse)", () => {
    const gz = gzipSync(Buffer.from(AGR_TEXT, "utf8"));

    expect(() => parseAgr(gz)).toThrow(/gzip|plain xml|kein gzip/i);
  });

  it("Binaer / Nicht-XML -> Klartextfehler", () => {
    expect(() => parseAgr(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toThrow(
      /xml|format/i,
    );
  });

  it("falsches Root-Element -> Klartextfehler", () => {
    expect(() =>
      parseAgr(Buffer.from('<?xml version="1.0"?><NotAbleton />', "utf8")),
    ).toThrow(/ableton|root/i);
  });

  it("kein <Groove> im .agr -> Klartextfehler", () => {
    expect(() =>
      parseAgr(Buffer.from("<Ableton><Foo /></Ableton>", "utf8")),
    ).toThrow(/groove/i);
  });

  it("<Groove> mit Id (kein bare .agr-Groove) -> Klartextfehler", () => {
    expect(() =>
      parseAgr(Buffer.from('<Ableton><Groove Id="3"></Groove></Ableton>', "utf8")),
    ).toThrow(/ohne id|bare|id/i);
  });
});

describe("extractGrooveFromAgr (T3)", () => {
  it("extrahiert LomId/Name/eingebetteten MidiClip woertlich", () => {
    const g = extractGrooveFromAgr(parseAgr(AGR_BUF));

    expect(g.name).toBe("Rock Fatback - 4 bars 16ths");
    expect(g.midiClip.startsWith('<MidiClip Id="0" Time="0">')).toBe(true);
    expect(g.midiClip.endsWith("</MidiClip>")).toBe(true);
    expect([...g.midiClip.matchAll(/<MidiNoteEvent /g)]).toHaveLength(62);
  });

  it("kein <Name> -> Klartextfehler", () => {
    expect(() =>
      extractGrooveFromAgr("<Groove><LomId Value=\"0\" /></Groove>"),
    ).toThrow(/name/i);
  });

  it("kein eingebetteter <MidiClip> -> Klartextfehler", () => {
    expect(() =>
      extractGrooveFromAgr(
        '<Groove><Name Value="X" /><Clip><Value /></Clip></Groove>',
      ),
    ).toThrow(/midiclip/i);
  });
});

describe("transformToPoolGroove (T4) — byte gegen Fixture-CDATA", () => {
  // Soll == <PoolGrooveAfterImport> MODULO der dokumentiert nicht
  // ableitbaren Felder: <Name>-Katalogwert + <SourceContext>.
  /**
   * The pool ground-truth lines minus the non-derivable `<SourceContext>`
   * block (Scope A).
   * @returns Indent-normalized expected pool node lines.
   */
  function poolModuloName(): string[] {
    const lines = norm(gtCdata("PoolGrooveAfterImport"));
    const scTags = [
      "<SourceContext",
      "<OriginalFileRef",
      "<FileRef",
      "<RelativePathType",
      "<RelativePath ",
      "<Path ",
      "<Type ",
      "<LivePackName",
      "<LivePackId",
      "<OriginalFileSize",
      "<OriginalCrc",
      "<SourceHint",
      "<BrowserContentPath",
      "<LocalFiltersJson",
    ];

    return lines.filter(
      (l) =>
        !scTags.some((t) => l.startsWith(t)) &&
        l !== "</SourceContext>" &&
        l !== "</OriginalFileRef>" &&
        l !== "</FileRef>",
    );
  }

  it("Default-Name = .agr-interner Name; Notes-Stripping + Live-12-Defaults byte-exakt", () => {
    const g = extractGrooveFromAgr(parseAgr(AGR_BUF));
    const node = transformToPoolGroove(g, "5", "Rock Fatback Accent 16ths");

    // <SourceContext> weggelassen
    expect(node).not.toContain("<SourceContext>");
    // Note-Attribute gestrippt
    expect(node).not.toContain("VelocityDeviation=");
    expect(node).not.toContain(" Probability=");
    expect(node).not.toContain("IsEnabled=");
    // Id-Attribut gesetzt
    expect(node.startsWith('<Groove Id="5">')).toBe(true);
    // strukturell == Pool-Soll modulo Name/SourceContext
    expect(norm(node)).toStrictEqual(poolModuloName());
  });

  it("--name override schlaegt den .agr-internen Namen", () => {
    const g = extractGrooveFromAgr(parseAgr(AGR_BUF));
    const node = transformToPoolGroove(g, "5", "My Custom Groove");

    expect(node).toContain('<Name Value="My Custom Groove" />');
    expect(node).not.toContain("Rock Fatback - 4 bars 16ths");
  });
});

const BEFORE_ALS =
  "/Users/macuser/Desktop/AIbleton/g5b-fixture/" +
  "G5b-before Project/G5b-before.als";

const POOL_RE = /<GroovePool>[\S\s]*?<\/GroovePool>/;

describe("injectGrooveIntoPool + Mitigation-B (T5) — gegen echte G5b-.als", () => {
  it("injiziert neuen <Groove Id> am Pool-Ende; Mitigation-B: alles ausser Pool byte-identisch", () => {
    const before = readAls(BEFORE_ALS);
    const g = extractGrooveFromAgr(parseAgr(AGR_BUF));
    const node = transformToPoolGroove(
      g,
      allocateGrooveId(before),
      "Rock Fatback Accent 16ths",
    );
    const after = injectGrooveIntoPool(before, node);

    // (b) Mitigation-B: ausserhalb <GroovePool> byte-identisch.
    expect(after.replace(POOL_RE, "")).toBe(before.replace(POOL_RE, ""));
    // Datei als Ganzes hat sich geaendert (Pool wuchs).
    expect(after).not.toBe(before);

    const afterPool = after.match(POOL_RE)?.[0] ?? "";
    const beforePool = before.match(POOL_RE)?.[0] ?? "";

    // Neuer Eintrag Id=5 (max(4)+1), am Pool-Ende vor </Grooves>.
    expect([...beforePool.matchAll(/<Groove Id="\d+">/g)]).toHaveLength(1);
    expect([...afterPool.matchAll(/<Groove Id="\d+">/g)]).toHaveLength(2);
    expect(afterPool).toContain('<Groove Id="5">');
    expect(
      afterPool.indexOf('<Groove Id="5">'),
    ).toBeGreaterThan(afterPool.indexOf('<Groove Id="4">'));
    expect(afterPool.indexOf("</Grooves>")).toBeGreaterThan(
      afterPool.indexOf('<Groove Id="5">'),
    );
  });

  it("(c) Bestands-Groove nur Selection-Flip true->false; <DefaultGrooveId> unveraendert; sonst byte-identisch", () => {
    const before = readAls(BEFORE_ALS);
    const g = extractGrooveFromAgr(parseAgr(AGR_BUF));
    const node = transformToPoolGroove(g, "5", "Rock Fatback Accent 16ths");
    const after = injectGrooveIntoPool(before, node);

    const groove4Before = before.slice(
      before.indexOf('<Groove Id="4">'),
      before.indexOf("</Groove>") + "</Groove>".length,
    );
    const groove4After = after.slice(
      after.indexOf('<Groove Id="4">'),
      after.indexOf("</Groove>") + "</Groove>".length,
    );

    // Genau EINE Aenderung im Bestands-Groove: Selection true -> false.
    expect(groove4Before).toContain('<Selection Value="true" />');
    expect(groove4After).toContain('<Selection Value="false" />');
    expect(
      groove4After.replace(
        '<Selection Value="false" />',
        '<Selection Value="true" />',
      ),
    ).toBe(groove4Before);

    // <DefaultGrooveId> unveraendert.
    const dg = /<DefaultGrooveId Value="(-?\d+)" \/>/;

    expect(after.match(dg)?.[1]).toBe(before.match(dg)?.[1]);
  });

  it("(byte) Pool-Position des neuen Knotens == echtes G5b-after (Separator-Bytes)", () => {
    const before = readAls(BEFORE_ALS);
    const g = extractGrooveFromAgr(parseAgr(AGR_BUF));
    const node = transformToPoolGroove(g, "5", "Rock Fatback Accent 16ths");
    const after = injectGrooveIntoPool(before, node);

    // Byte-belegt aus G5b-after.als: zwischen Bestands-</Groove> und dem
    // neuen <Groove Id="5"> steht exakt "\n\t\t\t\t"; nach dem letzten
    // </Groove> vor </Grooves> exakt "\n\t\t\t".
    expect(after).toContain('</Groove>\n\t\t\t\t<Groove Id="5">');
    expect(after).toContain("</Groove>\n\t\t\t</Grooves>");
  });

  it("kein <GroovePool> -> Klartextfehler (kein I/O)", () => {
    expect(() =>
      injectGrooveIntoPool("<Ableton><LiveSet /></Ableton>", "<Groove Id=\"5\" />"),
    ).toThrow(/groovepool/i);
  });

  it("kein <Grooves> im Pool -> Klartextfehler", () => {
    expect(() =>
      injectGrooveIntoPool(
        "<GroovePool><LomId Value=\"0\" /></GroovePool>",
        '<Groove Id="5" />',
      ),
    ).toThrow(/grooves/i);
  });

  it("Pool ohne selektierten Eintrag -> kein Flip, kein Fehler", () => {
    const pool =
      '<Ableton><GroovePool><Grooves>' +
      '<Groove Id="4"><Selection Value="false" /></Groove>' +
      "</Grooves><DefaultGrooveId Value=\"-1\" /></GroovePool></Ableton>";
    const out = injectGrooveIntoPool(pool, '<Groove Id="5" />');

    expect(out).toContain('<Groove Id="5" />');
    expect([...out.matchAll(/<Selection Value="false" \/>/g)]).toHaveLength(1);
  });
});

describe("allocateGrooveId (T5)", () => {
  it("max(poolGrooveIds)+1 (G5b: 4 -> 5)", () => {
    const before =
      '<GroovePool><Grooves><Groove Id="4"><LomId Value="0" />' +
      "</Groove></Grooves></GroovePool>";

    expect(allocateGrooveId(before)).toBe("5");
  });

  it("leerer Pool -> 0", () => {
    expect(
      allocateGrooveId("<GroovePool><Grooves /></GroovePool>"),
    ).toBe("0");
  });

  it("mehrere Ids -> max+1 (4,9 -> 10)", () => {
    const p =
      '<GroovePool><Grooves><Groove Id="4"></Groove>' +
      '<Groove Id="9"></Groove></Grooves></GroovePool>';

    expect(allocateGrooveId(p)).toBe("10");
  });
});
