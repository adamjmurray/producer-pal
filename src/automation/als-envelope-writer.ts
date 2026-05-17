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
 * Build a `<ClipEnvelope>` XML string for a single automation parameter.
 * Does NOT include the wrapping `<Envelopes>` element — caller adds that.
 *
 * Produces the exact Ableton 12 factory structure:
 * - Anchor event at Time="-63072000" (Ableton's "value before first point" sentinel)
 *   with Value = first breakpoint value, followed by user breakpoints at Id=1..n.
 * - LoopSlot and ScrollerTimePreserver after </Automation>.
 *
 * @param automationTargetId - The `AutomationTarget Id` of the parameter (PointeeId).
 * @param breakpoints - Clip-relative breakpoints; `time` = beats, `value` = raw param units.
 * @returns The `<ClipEnvelope Id="0">...</ClipEnvelope>` string.
 * @throws {Error} If breakpoints is empty.
 */
export function buildEnvelopeXml(
  automationTargetId: string | number,
  breakpoints: Breakpoint[],
): string {
  if (breakpoints.length === 0) {
    throw new Error("mindestens 1 Breakpoint erforderlich");
  }

  // Anchor event: Ableton's "value before first point" sentinel at -63072000
  const anchorEvent = `<FloatEvent Id="0" Time="-63072000" Value="${fmt(breakpoints[0].value)}" />`;

  // User breakpoints follow at Id=1..n
  const userEvents = breakpoints
    .map((bp, i) => `<FloatEvent Id="${i + 1}" Time="${fmt(bp.time)}" Value="${fmt(bp.value)}" />`)
    .join("");

  return (
    `<ClipEnvelope Id="0">` +
    `<EnvelopeTarget><PointeeId Value="${automationTargetId}" /></EnvelopeTarget>` +
    `<Automation>` +
    `<Events>${anchorEvent}${userEvents}</Events>` +
    `<AutomationTransformViewState>` +
    `<IsTransformPending Value="false" />` +
    `<TimeAndValueTransforms />` +
    `</AutomationTransformViewState>` +
    `</Automation>` +
    `<LoopSlot><Value /></LoopSlot>` +
    `<ScrollerTimePreserver><LeftTime Value="0" /><RightTime Value="0" /></ScrollerTimePreserver>` +
    `</ClipEnvelope>`
  );
}

/**
 * Matches the inner self-closing `<Envelopes />` within the outer wrapper,
 * capturing surrounding whitespace for round-trip preservation.
 * Group 1: whitespace after outer `<Envelopes>`, group 2: whitespace before outer `</Envelopes>`.
 */
const EMPTY_ENVELOPES_RE = /(<Envelopes>\s*)<Envelopes\s*\/>(\s*<\/Envelopes>)/;

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
 * Finds the clip whose `<Name Value="clipName" />` matches, then replaces the
 * inner self-closing `<Envelopes />` within the empty placeholder
 * `<Envelopes><Envelopes /></Envelopes>` with a populated inner list
 * `<Envelopes><ClipEnvelope ...>...</ClipEnvelope></Envelopes>`,
 * preserving the outer `<Envelopes>` wrapper Ableton requires.
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

  // emptyEnvMatch[1] = outer "<Envelopes>" + leading whitespace
  // emptyEnvMatch[2] = trailing whitespace + outer "</Envelopes>"
  // Result: <Envelopes>{ws}<Envelopes>{ClipEnvelope}</Envelopes>{ws}</Envelopes>
  const replacement =
    emptyEnvMatch[1] +
    `<Envelopes>${buildEnvelopeXml(automationTargetId, breakpoints)}</Envelopes>` +
    emptyEnvMatch[2];
  const updatedClip =
    clipBlock.slice(0, emptyEnvMatch.index) +
    replacement +
    clipBlock.slice(emptyEnvMatch.index + emptyEnvMatch[0].length);

  return xml.slice(0, start) + updatedClip + xml.slice(end);
}
