// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readAls, writeAls, backupAls, isSetLikelyOpen, assertOnlyEnvelopeChanged } from "./als-file.ts";

const SAMPLE_XML = `<Ableton><Tracks><MidiTrack Id="1"><MidiClip Id="0"><Name Value="TestClip" /><Envelopes><Envelopes /></Envelopes></MidiClip></MidiTrack></Tracks></Ableton>`;

/**
 * Write a gzip-compressed xml string to a temp file and return the path.
 * @param xml - XML string to compress and write
 * @returns Path to the temp file
 */
function writeTempAls(xml: string): string {
  const tmpPath = path.join(os.tmpdir(), `als-file-test-${Date.now()}-${Math.random().toString(36).slice(2)}.als`);

  fs.writeFileSync(tmpPath, zlib.gzipSync(Buffer.from(xml, "utf8")));

  return tmpPath;
}

describe("readAls / writeAls round-trip", () => {
  it("liest und schreibt XML verlustfrei", () => {
    const tmpPath = writeTempAls(SAMPLE_XML);

    try {
      const xml = readAls(tmpPath);

      expect(xml).toBe(SAMPLE_XML);

      const modified = xml.replace("TestClip", "Modified");

      writeAls(tmpPath, modified);

      const back = readAls(tmpPath);

      expect(back).toBe(modified);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it("hinterlaesst keine .tmp-* Datei nach writeAls", () => {
    const tmpPath = writeTempAls(SAMPLE_XML);
    const dir = path.dirname(tmpPath);
    const base = path.basename(tmpPath);

    try {
      writeAls(tmpPath, SAMPLE_XML);

      const tmpFiles = fs.readdirSync(dir).filter(
        (f) => f.startsWith(base) && f.includes(".tmp-"),
      );

      expect(tmpFiles).toHaveLength(0);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });
});

describe("backupAls", () => {
  it("erstellt .bak Kopie und gibt Pfad zurueck", () => {
    const tmpPath = writeTempAls(SAMPLE_XML);
    const bakPath = `${tmpPath}.bak`;

    try {
      const returned = backupAls(tmpPath);

      expect(returned).toBe(bakPath);
      expect(fs.existsSync(bakPath)).toBe(true);

      const bakXml = readAls(bakPath);

      expect(bakXml).toBe(SAMPLE_XML);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    }
  });
});

describe("isSetLikelyOpen", () => {
  it("gibt boolean zurueck", () => {
    const result = isSetLikelyOpen();

    expect(typeof result).toBe("boolean");
  });
});

describe("assertOnlyEnvelopeChanged", () => {
  const CLIP_NAME = "TestClip";
  const BEFORE = `<Ableton><MidiClip Id="0"><Name Value="${CLIP_NAME}" /><Envelopes><Envelopes /></Envelopes></MidiClip></Ableton>`;
  const AFTER_ENV = `<Ableton><MidiClip Id="0"><Name Value="${CLIP_NAME}" /><Envelopes><AutomationEnvelope Id="0"><EnvelopeTarget><PointeeId Value="23005" /></EnvelopeTarget></AutomationEnvelope></Envelopes></MidiClip></Ableton>`;

  it("passt bei reiner Envelope-Aenderung im Ziel-Clip", () => {
    expect(() => assertOnlyEnvelopeChanged(BEFORE, AFTER_ENV, CLIP_NAME)).not.toThrow();
  });

  it("wirft bei Aenderung im prefix (ausserhalb des Clips)", () => {
    const badAfter = AFTER_ENV.replace("<Ableton>", "<Ableton2>");

    expect(() => assertOnlyEnvelopeChanged(BEFORE, badAfter, CLIP_NAME)).toThrow(/prefix/);
  });

  it("wirft bei Aenderung im suffix (ausserhalb des Clips)", () => {
    const badAfter = AFTER_ENV.replace("</Ableton>", "</Ableton2>");

    expect(() => assertOnlyEnvelopeChanged(BEFORE, badAfter, CLIP_NAME)).toThrow(/suffix/);
  });

  it("passt wenn beide identisch sind (keine Aenderung)", () => {
    expect(() => assertOnlyEnvelopeChanged(BEFORE, BEFORE, CLIP_NAME)).not.toThrow();
  });

  it("duplikat-Clips: nur Ziel-Clip aendert sich → kein Fehler", () => {
    const OTHER_CLIP = `<MidiClip Id="0"><Name Value="Other" /><Envelopes><Envelopes /></Envelopes></MidiClip>`;
    const TARGET_BEFORE = `<MidiClip Id="1"><Name Value="${CLIP_NAME}" /><Envelopes><Envelopes /></Envelopes></MidiClip>`;
    const TARGET_AFTER = `<MidiClip Id="1"><Name Value="${CLIP_NAME}" /><Envelopes><AutomationEnvelope /></Envelopes></MidiClip>`;
    const beforeXml = `<Root>${OTHER_CLIP}${TARGET_BEFORE}</Root>`;
    const afterXml = `<Root>${OTHER_CLIP}${TARGET_AFTER}</Root>`;

    expect(() => assertOnlyEnvelopeChanged(beforeXml, afterXml, CLIP_NAME)).not.toThrow();
  });

  it("duplikat-Clips: Aenderung im anderen Clip → wirft", () => {
    const OTHER_BEFORE = `<MidiClip Id="0"><Name Value="Other" /><Envelopes><Envelopes /></Envelopes></MidiClip>`;
    const OTHER_AFTER = `<MidiClip Id="0"><Name Value="Other" /><Envelopes><AutomationEnvelope /></Envelopes></MidiClip>`;
    const TARGET_CLIP = `<MidiClip Id="1"><Name Value="${CLIP_NAME}" /><Envelopes><Envelopes /></Envelopes></MidiClip>`;
    const beforeXml = `<Root>${OTHER_BEFORE}${TARGET_CLIP}</Root>`;
    const afterXml = `<Root>${OTHER_AFTER}${TARGET_CLIP}</Root>`;

    expect(() => assertOnlyEnvelopeChanged(beforeXml, afterXml, CLIP_NAME)).toThrow(/Unerwartete/);
  });
});
