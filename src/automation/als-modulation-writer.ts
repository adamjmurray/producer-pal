// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  injectClipEnvelope,
  locateClipBlock,
} from "#src/automation/als-envelope-writer.ts";
import { resolveAutomationTargetId } from "#src/automation/als-param-resolver.ts";
import {
  type Breakpoint,
  validateBreakpoints,
} from "#src/automation/breakpoint-validator.ts";

/** Bipolarer Modulation-Wertebereich (Recon-B: Fixture-Werte ⊂ [-1,1]). */
const MODULATION_RANGE = { min: -1, max: 1 } as const;

/**
 * Die ModulationTarget-Id eines Device-Params aufloesen. Nutzt den
 * exportierten `resolveAutomationTargetId` (kein Kern-Touch) fuer die
 * AutomationTarget-Id und liest die direkt benachbarte
 * `<ModulationTarget Id>` desselben Param-Elements (Recon-B: Adjazenz
 * byte-belegt).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param trackName - Track-Anzeigename (UserName/EffectiveName).
 * @param deviceIndex - 0-basierter Device-Index im Track.
 * @param paramSelector - Param-Element/Alias (z.B. "Frequency").
 * @param occurrence - Optionaler 0-basierter Index bei Mehrdeutigkeit.
 * @returns Die ModulationTarget-Id als String.
 */
export function resolveModulationTargetId(
  xml: string,
  trackName: string,
  deviceIndex: number,
  paramSelector: string,
  occurrence?: number,
): string {
  const param = resolveAutomationTargetId(
    xml,
    trackName,
    deviceIndex,
    paramSelector,
    occurrence,
  );

  return resolveModulationTargetIdFromAuto(xml, param.automationTargetId);
}

/**
 * Aus einer bekannten AutomationTarget-Id die unmittelbar folgende
 * `<ModulationTarget Id>` desselben Param-Elements lesen.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param automationTargetId - Bereits aufgeloeste AutomationTarget-Id.
 * @returns Die adjazente ModulationTarget-Id als String.
 */
export function resolveModulationTargetIdFromAuto(
  xml: string,
  automationTargetId: string,
): string {
  // Vom passenden <AutomationTarget Id="a"> bis zu SEINEM eigenen
  // </AutomationTarget> (tempered: der Zwischenraum darf den Close NICHT
  // ueberspringen ⇒ kein Verrutschen in einen spaeteren Param), dann
  // unmittelbar das Geschwister <ModulationTarget Id="m">. Nicht-modulierbare
  // Params (kein direkt folgendes ModulationTarget) ⇒ kein Match ⇒ Throw.
  const re = new RegExp(
    '<AutomationTarget Id="' +
      automationTargetId +
      '">(?:(?!</AutomationTarget>)[\\S\\s])*?</AutomationTarget>\\s*<ModulationTarget Id="(\\d+)"',
  );
  const m = re.exec(xml);

  if (m?.[1] == null) {
    throw new Error(
      `Param (AutomationTarget ${automationTargetId}) hat kein ModulationTarget — nicht modulierbar`,
    );
  }

  return m[1];
}

/**
 * Eine Modulation-Huellkurve in einen Clip injizieren. Duenner Wrapper
 * ueber den exportierten `injectClipEnvelope` (Recon-B: Struktur
 * byte-identisch zu Automation-ClipEnvelope, nur PointeeId =
 * ModulationTarget-Id). Werte werden gegen den bipolaren
 * Modulation-Bereich validiert (NICHT den rohen Param-Bereich).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param clipName - Exakter `<Name Value=…/>`-Wert des Clips.
 * @param modTargetId - ModulationTarget-Id (PointeeId).
 * @param breakpoints - Modulation-Breakpoints (bipolar).
 * @returns Modifizierter XML-String.
 */
export function injectModulationEnvelope(
  xml: string,
  clipName: string,
  modTargetId: string,
  breakpoints: Breakpoint[],
): string {
  const validated = validateBreakpoints(breakpoints, MODULATION_RANGE);

  return injectClipEnvelope(xml, clipName, modTargetId, validated);
}

/**
 * Alle ClipEnvelopes eines Clips lesen (PointeeId + Time/Value-Punkte).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param clipName - Exakter `<Name Value=…/>`-Wert des Clips.
 * @returns Liste der Envelopes mit PointeeId und Punkten.
 */
export function getModulationEnvelopes(
  xml: string,
  clipName: string,
): Array<{ pointeeId: string; points: Breakpoint[] }> {
  const { block } = locateClipBlock(xml, clipName);
  const out: Array<{ pointeeId: string; points: Breakpoint[] }> = [];
  const envRe = /<ClipEnvelope\b[\S\s]*?<\/ClipEnvelope>/g;

  for (const env of block.match(envRe) ?? []) {
    const pid = /<PointeeId Value="(\d+)"/.exec(env);

    if (pid?.[1] == null) {
      continue;
    }

    const points: Breakpoint[] = [];
    // Value exponent-tolerant (fmt() kann wiss. Notation erzeugen) — R1.
    const evRe =
      /<FloatEvent Id="\d+" Time="(-?\d+)" Value="(-?\d+(?:\.\d+)?(?:[Ee]-?\d+)?)" \/>/g;
    let e: RegExpExecArray | null;

    while ((e = evRe.exec(env)) != null) {
      if (e[1] != null && e[2] != null) {
        points.push({ time: Number(e[1]), value: Number(e[2]) });
      }
    }

    out.push({ pointeeId: pid[1], points });
  }

  return out;
}
