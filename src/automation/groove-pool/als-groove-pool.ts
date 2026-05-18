// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AGR_NAME_RE,
  buildPoolGrooveNode,
  extractMidiClip,
} from "./als-groove-pool-helpers.ts";

/** Extracted source groove from a `.agr` file. */
export interface AgrGroove {
  /** Internal `<Name Value>` of the `.agr` groove. */
  name: string;
  /** The embedded `<MidiClip ...>...</MidiClip>` (verbatim). */
  midiClip: string;
  /** The full bare `<Groove>...</Groove>` (verbatim, no Id). */
  raw: string;
}

/** gzip magic bytes (1f 8b) — a `.agr` is plain XML and must NOT be gzip. */
const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * Parse a `.agr` buffer and return the bare `<Groove>...</Groove>` XML.
 *
 * G5b byte-belegt: `.agr` = plain XML, root `<Ableton MajorVersion=...>`,
 * exactly one `<Groove>` WITHOUT an `Id` attribute. A gzip magic byte or
 * non-XML/binary content yields a plaintext error (no binary parse, no I/O).
 *
 * @param buf - Raw file bytes.
 * @returns The bare groove XML (`<Groove>...</Groove>`).
 * @throws {Error} On gzip, binary/non-XML, wrong root, missing/Id-bearing groove.
 */
export function parseAgr(buf: Buffer): string {
  if (buf[0] === GZIP_MAGIC[0] && buf[1] === GZIP_MAGIC[1]) {
    throw new Error(
      ".agr ist gzip-komprimiert — erwartet plain XML (kein gzip)",
    );
  }

  const text = buf.toString("utf8");

  if (!/^\s*(<\?xml|<Ableton)/.test(text)) {
    throw new Error(
      "unerwartetes .agr-Format: kein XML (Binaer oder kein <?xml/<Ableton>)",
    );
  }

  if (!/<Ableton\b/.test(text)) {
    throw new Error(
      "unerwartetes .agr-Format: Root-Element ist nicht <Ableton>",
    );
  }

  const open = text.indexOf("<Groove");

  if (open === -1) {
    throw new Error("unerwartetes .agr-Format: kein <Groove> gefunden");
  }

  // bare .agr-Groove hat KEINE Id (Pool-Grooves haben <Groove Id="N">).
  if (/^<Groove\s+Id=/.test(text.slice(open))) {
    throw new Error(
      "unerwartetes .agr-Format: <Groove> hat eine Id — bare .agr-Groove erwartet",
    );
  }

  const close = text.indexOf("</Groove>", open);

  if (close === -1) {
    throw new Error("unerwartetes .agr-Format: <Groove> nicht geschlossen");
  }

  return text.slice(open, close + "</Groove>".length);
}

/**
 * Extract source params + embedded MidiClip from a bare `.agr` groove.
 *
 * G5b byte-belegt: `<Name Value>` (groove-level) + `<Clip><Value><MidiClip>`
 * are taken verbatim. The MidiClip is the musical pattern (62 notes).
 *
 * @param grooveXml - The bare `<Groove>` XML from `parseAgr`.
 * @returns The extracted groove (name, embedded MidiClip, raw).
 * @throws {Error} If `<Name>` or the embedded `<MidiClip>` is missing.
 */
export function extractGrooveFromAgr(grooveXml: string): AgrGroove {
  const nameM = grooveXml.match(AGR_NAME_RE);

  if (nameM?.[1] == null) {
    throw new Error("unerwartetes .agr-Format: kein <Name> im <Groove>");
  }

  const midiClip = extractMidiClip(grooveXml);

  return { name: nameM[1], midiClip, raw: grooveXml };
}

/**
 * Transform a `.agr` groove into a functionally correct pool `<Groove Id="N">`
 * node (Scope A — NOT byte-identical to a Live GUI import).
 *
 * Deterministic, byte-belegt against the G5b `<PoolGrooveAfterImport>`
 * fixture: (a) strip MidiNoteEvent `VelocityDeviation/Probability/IsEnabled`;
 * (b) inject the Live-12 schema defaults at their byte-belegt positions;
 * (c) `<Name>` = `name`; (d) `<SourceContext>` omitted entirely.
 *
 * @param g - The extracted `.agr` groove.
 * @param id - The allocated pool id.
 * @param name - The groove name (`--name` or `.agr`-internal).
 * @returns The pool groove node XML (`<Groove Id="N">...</Groove>`).
 */
export function transformToPoolGroove(
  g: AgrGroove,
  id: string,
  name: string,
): string {
  return buildPoolGrooveNode(g.raw, id, name);
}

/**
 * Allocate a collision-free groove id (`max(poolGrooveIds)+1`).
 *
 * G5b byte-belegt: kein globaler Id-Zaehler ausserhalb des Pools; die neue
 * Id ist schlicht `max(existierende Pool-Ids)+1` (G5b: 4 -> 5). Leerer Pool
 * -> `0`.
 *
 * @param xml - The `.als` XML (or GroovePool substring).
 * @returns The new id as a string.
 */
export function allocateGrooveId(xml: string): string {
  const ids = [...xml.matchAll(/<Groove Id="(\d+)">/g)].map((m) =>
    Number(m[1]),
  );

  if (ids.length === 0) return "0";

  return String(Math.max(...ids) + 1);
}

export { injectGrooveIntoPool } from "./als-groove-pool-helpers.ts";
