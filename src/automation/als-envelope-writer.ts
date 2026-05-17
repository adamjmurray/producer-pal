// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Breakpoint } from "#src/automation/breakpoint-validator.ts";

/**
 * Render a number without scientific notation: integers as integers, floats as floats.
 * Trims trailing zeros after the decimal point.
 * @param n - Number to format
 * @returns Plain decimal string, never in exponent form
 */
function fmt(n: number): string {
  if (Number.isInteger(n)) {
    // String(n) uses sci-notation for |n| >= 1e21; use BigInt for those
    const s = String(n);

    return /[Ee]/.test(s) ? BigInt(n).toString() : s;
  }

  // plain decimal float, no exponent, trim trailing zeros
  let s = n.toFixed(12);

  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");

  return s;
}

/**
 * Build an `<AutomationEnvelope>` XML string for a single automation parameter.
 * Does NOT include the wrapping `<Envelopes>` element — caller adds that.
 *
 * @param automationTargetId - The `AutomationTarget Id` of the parameter (PointeeId).
 * @param breakpoints - Clip-relative breakpoints; `time` = beats, `value` = raw param units.
 * @returns The `<AutomationEnvelope Id="0">...</AutomationEnvelope>` string.
 */
export function buildEnvelopeXml(
  automationTargetId: string | number,
  breakpoints: Breakpoint[],
): string {
  const floatEvents = breakpoints
    .map((bp, i) => `<FloatEvent Id="${i}" Time="${fmt(bp.time)}" Value="${fmt(bp.value)}" />`)
    .join("");

  return (
    `<AutomationEnvelope Id="0">` +
    `<EnvelopeTarget><PointeeId Value="${automationTargetId}" /></EnvelopeTarget>` +
    `<Automation>` +
    `<Events>${floatEvents}</Events>` +
    `<AutomationTransformViewState>` +
    `<IsTransformPending Value="false" />` +
    `<TimeAndValueTransforms />` +
    `</AutomationTransformViewState>` +
    `</Automation>` +
    `</AutomationEnvelope>`
  );
}

/** Regex matching the empty envelopes placeholder Ableton writes for clips with no automation. */
const EMPTY_ENVELOPES_RE = /<Envelopes>\s*<Envelopes\s*\/>\s*<\/Envelopes>/;

/**
 * Locate the `<MidiClip ...>...</MidiClip>` block whose nested
 * `<Name Value="clipName" />` matches, and return its absolute byte range.
 *
 * @param xml - Raw (decompressed) `.als` XML string.
 * @param clipName - Exact value of the clip's `<Name Value="..." />` attribute.
 * @returns `{ start, end, block }` where `start`/`end` are absolute indices into
 *   `xml` (end exclusive) and `block` is `xml.slice(start, end)`.
 * @throws {Error} If no clip with the given name is found.
 */
export function locateClipBlock(
  xml: string,
  clipName: string,
): { start: number; end: number; block: string } {
  // Fresh regex per call — no module-level /g state (lastIndex side-effects)
  const midiClipRe = /<MidiClip\b(?:(?!<\/MidiClip>).)*?<\/MidiClip>/gs;

  const namePattern = `<Name Value="${clipName}" />`;
  let m: RegExpExecArray | null;

  while ((m = midiClipRe.exec(xml)) !== null) {
    if (m[0].includes(namePattern)) {
      return { start: m.index, end: m.index + m[0].length, block: m[0] };
    }
  }

  throw new Error(`clip "${clipName}" nicht gefunden`);
}

/**
 * Inject an automation envelope into a named `<MidiClip>` block inside raw `.als` XML.
 *
 * Finds the clip whose `<Name Value="clipName" />` matches, then replaces its
 * empty `<Envelopes><Envelopes /></Envelopes>` placeholder with a fully populated
 * `<Envelopes><AutomationEnvelope ...>...</AutomationEnvelope></Envelopes>` block.
 * Everything outside that replacement is byte-identical.
 *
 * @param xml - Raw (decompressed) `.als` XML string.
 * @param clipName - Exact value of the clip's `<Name Value="..." />` attribute.
 * @param automationTargetId - The parameter's `AutomationTarget Id` (PointeeId).
 * @param breakpoints - Clip-relative automation breakpoints.
 * @returns Modified XML string.
 * @throws {Error} If no clip with the given name is found.
 * @throws {Error} If the clip has no empty `<Envelopes>` placeholder.
 */
export function injectClipEnvelope(
  xml: string,
  clipName: string,
  automationTargetId: string | number,
  breakpoints: Breakpoint[],
): string {
  const { start, end, block: clipBlock } = locateClipBlock(xml, clipName);
  const emptyEnvMatch = EMPTY_ENVELOPES_RE.exec(clipBlock);

  if (emptyEnvMatch == null) {
    throw new Error(
      `clip "${clipName}" hat bereits Envelopes oder keine Envelopes-Sektion`,
    );
  }

  const replacement = `<Envelopes>${buildEnvelopeXml(automationTargetId, breakpoints)}</Envelopes>`;
  const updatedClip =
    clipBlock.slice(0, emptyEnvMatch.index) +
    replacement +
    clipBlock.slice(emptyEnvMatch.index + emptyEnvMatch[0].length);

  return xml.slice(0, start) + updatedClip + xml.slice(end);
}
