// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * `.agr`/Pool groove transform helpers, byte-belegt against the G5b
 * ground-truth fixture (`ableton12-groove-import-groundtruth.xml`).
 *
 * The transform reproduces EXACTLY the deterministic part of Ableton's
 * `.agr` import (Scope A): note-attr stripping + Live-12 schema-default
 * injection. The non-derivable Live-environment fields (`<Name>` catalog
 * value, `<SourceContext>`) are NOT reproduced (documented in the fixture).
 */

/** Groove-level `<Name Value="..." />` (first occurrence in the bare groove). */
export const AGR_NAME_RE = /<Name Value="([^"]*)" \/>/;

/**
 * The Live-12 schema-default block injected directly after
 * `<IsWarped Value="true" />` (before `<Notes>`). Byte-belegt; the 6-tab
 * base indentation matches the pool node's MidiClip-child depth.
 */
const POST_ISWARPED =
  '\n\t\t\t\t\t\t<TakeId Value="0" />' +
  '\n\t\t\t\t\t\t<IsInKey Value="false" />' +
  "\n\t\t\t\t\t\t<ScaleInformation>" +
  '\n\t\t\t\t\t\t\t<Root Value="0" />' +
  '\n\t\t\t\t\t\t\t<Name Value="0" />' +
  "\n\t\t\t\t\t\t</ScaleInformation>";

/**
 * The Live-12 probability-group defaults injected directly after
 * `</PerNoteEventStore>` (before `<NoteIdGenerator>`). Byte-belegt.
 */
const POST_PERNOTE =
  "\n\t\t\t\t\t\t\t<NoteProbabilityGroups />" +
  "\n\t\t\t\t\t\t\t<ProbabilityGroupIdGenerator>" +
  '\n\t\t\t\t\t\t\t\t<NextId Value="1" />' +
  "\n\t\t\t\t\t\t\t</ProbabilityGroupIdGenerator>";

/**
 * The Live-11 tail scale-info block (`<ScaleInformation><RootNote/><Name
 * Major/></ScaleInformation><IsInKey/><NoteSpellingPreference 3/>`) is
 * replaced by the Live-12 `<NoteSpellingPreference 0/>` +
 * `<AccidentalSpellingPreference 3/>`. Byte-belegt.
 */
const TAIL_OLD =
  "<ScaleInformation>" +
  '\n\t\t\t\t\t\t<RootNote Value="0" />' +
  '\n\t\t\t\t\t\t<Name Value="Major" />' +
  "\n\t\t\t\t\t</ScaleInformation>" +
  '\n\t\t\t\t\t<IsInKey Value="false" />' +
  '\n\t\t\t\t\t<NoteSpellingPreference Value="3" />';
const TAIL_NEW =
  '<NoteSpellingPreference Value="0" />' +
  '\n\t\t\t\t\t<AccidentalSpellingPreference Value="3" />';

/**
 * The Live-12 `<ExpressionGrid>` block injected directly after
 * `<PreferFlatRootNote Value="false" />` (before `</MidiClip>`). Byte-belegt.
 */
const POST_PREFERFLAT =
  "\n\t\t\t\t\t<ExpressionGrid>" +
  '\n\t\t\t\t\t\t<FixedNumerator Value="1" />' +
  '\n\t\t\t\t\t\t<FixedDenominator Value="16" />' +
  '\n\t\t\t\t\t\t<GridIntervalPixel Value="20" />' +
  '\n\t\t\t\t\t\t<Ntoles Value="2" />' +
  '\n\t\t\t\t\t\t<SnapToGrid Value="false" />' +
  '\n\t\t\t\t\t\t<Fixed Value="false" />' +
  "\n\t\t\t\t\t</ExpressionGrid>";

/** Matches the trailing groove-level `<SourceContext>...</SourceContext>`. */
const SOURCE_CONTEXT_RE =
  /\n\s*<SourceContext>[\S\s]*?<\/SourceContext>\s*\n\s*<\/SourceContext>/;

/**
 * Build the pool `<Groove Id="N">` node from a bare `.agr` `<Groove>`.
 *
 * Applies every byte-belegt G5b transformation step in order. The result is
 * structurally identical to the real Ableton import MODULO `<Name>` (Live
 * catalog value, not derivable) and `<SourceContext>` (omitted by Scope A).
 *
 * @param agrGroove - The bare `.agr` `<Groove>...</Groove>` XML.
 * @param id - The allocated pool id.
 * @param name - The groove name to write (overrides the `.agr`-internal one).
 * @returns The pool groove node XML.
 */
export function buildPoolGrooveNode(
  agrGroove: string,
  id: string,
  name: string,
): string {
  let s = agrGroove;
  const agrNameM = s.match(AGR_NAME_RE);

  if (agrNameM?.[1] == null) {
    throw new Error("unerwartetes .agr-Format: kein <Name> im <Groove>");
  }

  // 1) <Groove> -> <Groove Id="N">
  s = s.replace("<Groove>", `<Groove Id="${id}">`);
  // 2) the groove-level + embedded-clip <Name Value="<agr-name>"> -> name.
  // Scoped to the EXACT .agr-internal name so unrelated schema names
  // (e.g. <Name Value="Major" />, the injected <Name Value="0" />) are
  // never clobbered (byte-belegt: only these two carry the groove name).
  s = s.replaceAll(
    `<Name Value="${agrNameM[1]}" />`,
    `<Name Value="${name}" />`,
  );
  // 3) inject Live-12 defaults after <IsWarped Value="true" />
  s = replaceOnce(
    s,
    '<IsWarped Value="true" />',
    `<IsWarped Value="true" />${POST_ISWARPED}`,
  );
  // 4) strip Groove-Pool-schema-only note attributes
  s = s.replaceAll(/ VelocityDeviation="[^"]*"/g, "");
  s = s.replaceAll(/ Probability="[^"]*"/g, "");
  s = s.replaceAll(/ IsEnabled="[^"]*"/g, "");
  // 5) inject probability-group defaults after </PerNoteEventStore>
  s = replaceOnce(
    s,
    "</PerNoteEventStore>",
    `</PerNoteEventStore>${POST_PERNOTE}`,
  );
  // 6) Live-11 tail scale-info -> Live-12 spelling prefs
  s = replaceOnce(s, TAIL_OLD, TAIL_NEW);
  // 7) inject <ExpressionGrid> after <PreferFlatRootNote Value="false" />
  s = replaceOnce(
    s,
    '<PreferFlatRootNote Value="false" />',
    `<PreferFlatRootNote Value="false" />${POST_PREFERFLAT}`,
  );
  // 8) drop the groove-level <SourceContext> entirely (Scope A)
  s = s.replace(SOURCE_CONTEXT_RE, "");

  return s;
}

/**
 * Inject a pool groove node at the byte-belegt pool position (after the last
 * existing `<Groove>`, before `</Grooves>`) and apply the within-pool
 * side-effect: the new groove keeps `<Selection Value="true" />`; the
 * previously selected pool groove flips `true -> false`. `<DefaultGrooveId>`
 * is left unchanged. Everything OUTSIDE `<GroovePool>` stays byte-identical
 * (Mitigation-B is enforced by the caller comparing the complement).
 *
 * @param xml - The `.als` XML.
 * @param node - The pool groove node from `buildPoolGrooveNode`.
 * @returns The modified XML.
 * @throws {Error} If no `<GroovePool>`/`<Grooves>` is present.
 */
export function injectGrooveIntoPool(xml: string, node: string): string {
  const poolM = xml.match(/<GroovePool>[\S\s]*?<\/GroovePool>/);

  if (poolM?.index == null) {
    throw new Error("kein <GroovePool> im Set — Pool muss existieren");
  }

  const poolStart = poolM.index;
  const poolEnd = poolStart + poolM[0].length;
  let pool = poolM[0];

  // Flip the currently-selected pool groove true -> false (single byte-
  // belegt within-pool side-effect). Scope to existing entries only.
  pool = flipSelectedGroove(pool);

  const groovesClose = pool.lastIndexOf("</Grooves>");

  if (groovesClose === -1) {
    throw new Error("kein <Grooves> im <GroovePool> — Pool ist strukturlos");
  }

  // Byte-belegt aus G5b-after.als: der neue Knoten wird DIREKT nach dem
  // letzten bestehenden `</Groove>` eingefuegt, getrennt durch exakt
  // "\n\t\t\t\t" (4-Tab-Eintrags-Einrueckung). Der vorhandene Whitespace
  // vor `</Grooves>` (z. B. "\n\t\t\t") bleibt unveraendert — so ist die
  // Trennung Bestands-</Groove> -> neuer <Groove> ("\n\t\t\t\t") und
  // neuer </Groove> -> </Grooves> ("\n\t\t\t") byte-identisch zum echten
  // Ableton-Import.
  const lastEntryClose = pool.lastIndexOf("</Groove>", groovesClose);

  if (lastEntryClose === -1) {
    throw new Error(
      "kein bestehender <Groove>-Eintrag im Pool — leerer Pool nicht unterstuetzt",
    );
  }

  const insertAt = lastEntryClose + "</Groove>".length;
  const before = pool.slice(0, insertAt);
  const after = pool.slice(insertAt);
  const newPool = `${before}\n\t\t\t\t${node}${after}`;

  return xml.slice(0, poolStart) + newPool + xml.slice(poolEnd);
}

/**
 * Replace exactly one occurrence of `needle` with `repl`, asserting the
 * needle is present exactly once (defensive: a 0/2+ match means the .agr
 * structure deviated from the byte-belegt G5b ground-truth — fail loud).
 *
 * @param hay - The string to operate on.
 * @param needle - The literal substring to replace (exactly once).
 * @param repl - The replacement string.
 * @returns The string with the single replacement applied.
 * @throws {Error} If `needle` does not occur exactly once.
 */
function replaceOnce(hay: string, needle: string, repl: string): string {
  const first = hay.indexOf(needle);

  if (first === -1) {
    throw new Error(
      `Transform-Anker fehlt (.agr weicht von G5b-Ground-Truth ab): ${shorten(needle)}`,
    );
  }

  if (hay.includes(needle, first + needle.length)) {
    throw new Error(
      `Transform-Anker mehrdeutig (mehrfach im .agr): ${shorten(needle)}`,
    );
  }

  return hay.slice(0, first) + repl + hay.slice(first + needle.length);
}

/**
 * Flip the single `<Selection Value="true" />` among existing pool entries
 * to `false`. If no entry is currently selected, the pool is returned
 * unchanged (byte-belegt: G5b had exactly one selected entry, but a pool
 * with none is valid and must not error).
 *
 * @param pool - The `<GroovePool>...</GroovePool>` block.
 * @returns The pool with at most one selection flipped.
 */
function flipSelectedGroove(pool: string): string {
  const idx = pool.indexOf('<Selection Value="true" />');

  if (idx === -1) return pool;

  return (
    pool.slice(0, idx) +
    '<Selection Value="false" />' +
    pool.slice(idx + '<Selection Value="true" />'.length)
  );
}

/**
 * Extract the embedded `<MidiClip ...>...</MidiClip>` from a bare `.agr`
 * groove (non-backtracking: open-tag index + first `</MidiClip>`).
 *
 * @param grooveXml - The bare `<Groove>` XML.
 * @returns The verbatim embedded MidiClip XML.
 * @throws {Error} If no embedded `<MidiClip>` is present.
 */
export function extractMidiClip(grooveXml: string): string {
  const open = grooveXml.search(/<MidiClip\b/);

  if (open === -1) {
    throw new Error("unerwartetes .agr-Format: kein eingebetteter <MidiClip>");
  }

  const close = grooveXml.indexOf("</MidiClip>", open);

  if (close === -1) {
    throw new Error("unerwartetes .agr-Format: <MidiClip> nicht geschlossen");
  }

  return grooveXml.slice(open, close + "</MidiClip>".length);
}

/**
 * Truncate a transform-anchor needle for error messages.
 * @param s - The needle string.
 * @returns The first 40 chars (ellipsis if longer).
 */
function shorten(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}
