// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { type Breakpoint } from "#src/automation/breakpoint-validator.ts";

// TAB-Indentation byte-verifiziert gegen
// docs/superpowers/fixtures/ableton12-arrangement-envelope-groundtruth.xml:
// <AutomationEnvelope Id="0"> = 6 TABs, <EnvelopeTarget> = 7, <PointeeId> = 8,
// <Automation> = 7, <Events> = 8, <FloatEvent> = 9,
// <AutomationTransformViewState> = 8, <IsTransformPending>/<TimeAndValueTransforms> = 9.
const T = "\t";
const I6 = T.repeat(6);
const I7 = T.repeat(7);
const I8 = T.repeat(8);
const I9 = T.repeat(9);

/**
 * Render a number without scientific notation: integers as integers, floats as
 * floats. Trims trailing zeros after the decimal point. Identical contract to
 * the Slice-1 `fmt` in als-envelope-writer (raw Ableton param units).
 * @param n - Number to format
 * @returns Plain decimal string, never in exponent form
 */
function fmt(n: number): string {
  if (Number.isInteger(n)) {
    const s = String(n);

    return /[Ee]/.test(s) ? BigInt(n).toString() : s;
  }

  let s = n.toFixed(12);

  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");

  return s;
}

/**
 * Build ONE `<AutomationEnvelope Id="0">` block for a single track-level
 * arrangement automation parameter. Does NOT include the wrapping
 * `<Envelopes>` element — `injectArrangementEnvelope` adds that.
 *
 * Byte-faithful to the Ableton 12 ground-truth fixture (TAB-indented, the
 * block starts at 6 TABs). Differs from the Slice-1 clip-scoped
 * `<ClipEnvelope>`: NO `<LoopSlot>`, NO `<ScrollerTimePreserver>`, element is
 * `<AutomationEnvelope>` (not `<ClipEnvelope>`), single-nested container.
 *
 * - Anchor event `Id="0" Time="-63072000"` with Value = first breakpoint value.
 * - User breakpoints follow at sequential `Id="1..n"` (Slice-1 convention,
 *   accepted by Ableton; we reproduce the structural schema, not Ableton's
 *   non-sequential Id list).
 *
 * @param automationTargetId - The parameter's `AutomationTarget Id` (PointeeId).
 * @param breakpoints - Arrangement breakpoints; `time` = global beats,
 *   `value` = raw param units.
 * @returns The TAB-indented `<AutomationEnvelope Id="0">...</AutomationEnvelope>`
 *   string (no leading newline, no surrounding `<Envelopes>`).
 * @throws {Error} If breakpoints is empty.
 */
export function buildArrangementEnvelopeXml(
  automationTargetId: string | number,
  breakpoints: Breakpoint[],
): string {
  if (breakpoints.length === 0) {
    throw new Error("mindestens 1 Breakpoint erforderlich");
  }

  const first = breakpoints[0];

  if (!first) throw new Error("mindestens 1 Breakpoint erforderlich");

  const anchorEvent = `${I9}<FloatEvent Id="0" Time="-63072000" Value="${fmt(first.value)}" />`;
  const userEvents = breakpoints
    .map(
      (bp, i) =>
        `${I9}<FloatEvent Id="${i + 1}" Time="${fmt(bp.time)}" Value="${fmt(bp.value)}" />`,
    )
    .join("\n");

  return (
    `${I6}<AutomationEnvelope Id="0">\n` +
    `${I7}<EnvelopeTarget>\n` +
    `${I8}<PointeeId Value="${automationTargetId}" />\n` +
    `${I7}</EnvelopeTarget>\n` +
    `${I7}<Automation>\n` +
    `${I8}<Events>\n` +
    `${anchorEvent}\n` +
    `${userEvents}\n` +
    `${I8}</Events>\n` +
    `${I8}<AutomationTransformViewState>\n` +
    `${I9}<IsTransformPending Value="false" />\n` +
    `${I9}<TimeAndValueTransforms />\n` +
    `${I8}</AutomationTransformViewState>\n` +
    `${I7}</Automation>\n` +
    `${I6}</AutomationEnvelope>`
  );
}

/**
 * Matches the EMPTY track-level placeholder
 * `<AutomationEnvelopes> <Envelopes /> </AutomationEnvelopes>` (whitespace
 * tolerant). Group 1: `<AutomationEnvelopes>` + leading whitespace,
 * group 2: trailing whitespace + `</AutomationEnvelopes>`.
 */
const EMPTY_TRACK_ENV_RE =
  /(<AutomationEnvelopes>\s*)<Envelopes\s*\/>(\s*<\/AutomationEnvelopes>)/;

/**
 * Locate the empty `<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`
 * placeholder inside the named track (matched by EffectiveName/UserName, same
 * naming convention as the resolver).
 *
 * @param xml - Raw (decompressed) `.als` XML string.
 * @param trackName - EffectiveName of the target track.
 * @returns `{ start, end, block }` — absolute indices into `xml` (end
 *   exclusive) spanning exactly the empty placeholder, `block` =
 *   `xml.slice(start, end)`.
 * @throws {Error} If the track is not found.
 * @throws {Error} If the placeholder is missing or already populated
 *   (descriptive — needed for the `--force` path in T5).
 */
export function locateTrackAutomationBlock(
  xml: string,
  trackName: string,
): { start: number; end: number; block: string } {
  // Kanonischer Locator (Mitigation A) — index = Start-Offset, block bereits
  // materialisiert (kein zweiter xml.slice nötig).
  const { index: trackStart, block: trackBlock } = locateTrackBlock(
    xml,
    trackName,
  );
  const m = EMPTY_TRACK_ENV_RE.exec(trackBlock);

  if (m == null) {
    throw new Error(
      `Track "${trackName}": kein leerer <AutomationEnvelopes>-Platzhalter ` +
        `(fehlt oder bereits gefuellt)`,
    );
  }

  const start = trackStart + m.index;
  const end = start + m[0].length;

  return { start, end, block: xml.slice(start, end) };
}

/**
 * Inject a track-level arrangement automation envelope into the named track.
 *
 * Replaces ONLY the inner self-closing `<Envelopes />` within the empty
 * placeholder with a populated `<Envelopes>{AutomationEnvelope}</Envelopes>`,
 * preserving the outer `<AutomationEnvelopes>` wrapper and its indentation.
 * Everything outside that replacement is byte-identical (`xml.slice`).
 *
 * @param xml - Raw (decompressed) `.als` XML string.
 * @param trackName - EffectiveName of the target track.
 * @param automationTargetId - The parameter's `AutomationTarget Id` (PointeeId).
 * @param breakpoints - Arrangement automation breakpoints.
 * @returns Modified XML string.
 * @throws {Error} If the track is not found.
 * @throws {Error} If the track has no empty `<AutomationEnvelopes>` placeholder.
 */
export function injectArrangementEnvelope(
  xml: string,
  trackName: string,
  automationTargetId: string | number,
  breakpoints: Breakpoint[],
): string {
  const { start, end, block } = locateTrackAutomationBlock(xml, trackName);
  const m = EMPTY_TRACK_ENV_RE.exec(block);

  if (m == null) {
    // Unreachable: locateTrackAutomationBlock already validated the match.
    throw new Error(
      `Track "${trackName}": kein leerer <AutomationEnvelopes>-Platzhalter`,
    );
  }

  // m[1] = "<AutomationEnvelopes>" + ws, m[2] = ws + "</AutomationEnvelopes>"
  const envelopeBlock = buildArrangementEnvelopeXml(
    automationTargetId,
    breakpoints,
  );
  const replacement =
    m[1] +
    `<Envelopes>\n${envelopeBlock}\n${"\t".repeat(5)}</Envelopes>` +
    m[2];

  return xml.slice(0, start) + replacement + xml.slice(end);
}
