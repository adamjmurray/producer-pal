// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Breakpoint } from "#src/automation/breakpoint-validator.ts";

/**
 * Render a number without scientific notation: integers as integers, floats as floats.
 * @param n - Number to format
 * @returns Plain decimal string
 */
function fmt(n: number): string {
  return String(n);
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

/** Regex matching a complete `<MidiClip>...</MidiClip>` block (non-overlapping, dotall). */
const MIDI_CLIP_RE = /<MidiClip\b(?:(?!<\/MidiClip>).)*?<\/MidiClip>/gs;

/** Regex matching the empty envelopes placeholder Ableton writes for clips with no automation. */
const EMPTY_ENVELOPES_RE = /<Envelopes>\s*<Envelopes\s*\/>\s*<\/Envelopes>/;

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
  // Reset lastIndex since the regex is /g
  MIDI_CLIP_RE.lastIndex = 0;

  const namePattern = `<Name Value="${clipName}" />`;
  let matchedClip: RegExpExecArray | null = null;

  let m: RegExpExecArray | null;

  while ((m = MIDI_CLIP_RE.exec(xml)) !== null) {
    if (m[0].includes(namePattern)) {
      matchedClip = m;
      break;
    }
  }

  if (matchedClip == null) {
    throw new Error(`clip "${clipName}" nicht gefunden`);
  }

  const clipBlock = matchedClip[0];
  const emptyEnvMatch = EMPTY_ENVELOPES_RE.exec(clipBlock);

  if (emptyEnvMatch == null) {
    throw new Error(
      `clip "${clipName}" hat bereits Envelopes oder keine Envelopes-Sektion`,
    );
  }

  const replacement = `<Envelopes>${buildEnvelopeXml(automationTargetId, breakpoints)}</Envelopes>`;
  const updatedClip = clipBlock.slice(0, emptyEnvMatch.index) + replacement + clipBlock.slice(emptyEnvMatch.index + emptyEnvMatch[0].length);

  return xml.slice(0, matchedClip.index) + updatedClip + xml.slice(matchedClip.index + clipBlock.length);
}
