// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Breakpoint } from "#src/automation/breakpoint-validator.ts";

// TAB-Indentation byte-verifiziert gegen das echte Set
// evals/live-sets/basic-midi-4-track (MainTrack-TimeSignature-Envelope):
// <Events>/</Events> = 7 TABs, <EnumEvent>-Kinder = 8 TABs.
const T = "\t";
const I7 = T.repeat(7);
const I8 = T.repeat(8);

/** Eingabe-Flags, die in Slice 6b (nur lineare Tsig-Marker) gesperrt sind. */
export interface TimeSigCurveGuardInput {
  curve?: boolean;
}

/**
 * Sperrt gekrümmte Time-Signature-Segmente (= Slice 6c) mit klarer
 * Fehlermeldung. Kein stiller No-Op.
 * @param input - Zu prüfende Eingabe-Flags.
 * @returns void wenn rein lineare Tsig-Eingabe.
 */
export function assertNoTimeSigCurve(input: TimeSigCurveGuardInput): void {
  if (input.curve === true) {
    throw new Error("Gekrümmte Segmente = Slice 6c, nicht in Slice 6b");
  }
}

/**
 * Resolve the Master/Main-Track TimeSignature `AutomationTarget Id` (=
 * PointeeId der Tsig-Envelope). Robust aus dem konkreten Set gelesen
 * (faktisch "10", nicht hardcoden). MainTrack per `<MainTrack ` isoliert.
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns Die TimeSignature-AutomationTarget-Id als String.
 * @throws {Error} Wenn kein `<MainTrack>` oder kein TimeSignature-Target.
 */
export function resolveTimeSigTargetId(xml: string): string {
  const block = isolateMainTrack(xml);
  const m = /<TimeSignature>[\S\s]*?<AutomationTarget Id="(\d+)"/.exec(block);

  if (m?.[1] == null) {
    throw new Error(
      "MainTrack: kein <TimeSignature><AutomationTarget Id> gefunden",
    );
  }

  return m[1];
}

/**
 * Locate the `<Events>…</Events>`-Block der MainTrack-TimeSignature-Envelope
 * (jene `<AutomationEnvelope>` mit `<PointeeId Value="{TsigId}" />`).
 * Absolute Indizes ins volle `xml` (Mitigation-B: index = Offset, block
 * materialisiert).
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns `{ start, end, block }` — `end` exklusiv, `block` = exakt der
 *   eingerueckte `<Events>`-Block inklusive fuehrender 7 TABs.
 * @throws {Error} Wenn kein `<MainTrack>` oder keine Tsig-Envelope/Events.
 */
export function locateTimeSigEnvelopeEvents(xml: string): {
  start: number;
  end: number;
  block: string;
} {
  const mainStart = xml.indexOf("<MainTrack ");
  const mainEnd = xml.indexOf("</MainTrack>");

  if (mainStart === -1 || mainEnd === -1) {
    throw new Error(
      "Kein <MainTrack> im .als — Master-TimeSignature-Locator gescheitert",
    );
  }

  const tsigId = resolveTimeSigTargetId(xml);
  const block = xml.slice(mainStart, mainEnd);
  const pidIdx = block.indexOf(`<PointeeId Value="${tsigId}" />`);

  if (pidIdx === -1) {
    throw new Error(
      `MainTrack: keine Tsig-<AutomationEnvelope> mit PointeeId ${tsigId}`,
    );
  }

  let s = block.indexOf("<Events>", pidIdx);
  const eMarkerEnd = block.indexOf("</Events>", s);

  if (s === -1 || eMarkerEnd === -1) {
    throw new Error(
      `MainTrack: Tsig-Envelope (PointeeId ${tsigId}) ohne <Events>-Block`,
    );
  }

  while (s > 0 && block[s - 1] === "\t") s--;

  const e = eMarkerEnd + "</Events>".length;
  const start = mainStart + s;
  const end = mainStart + e;

  return { start, end, block: xml.slice(start, end) };
}

/**
 * Ersetzt NUR den `<Events>…</Events>`-Block der MainTrack-TimeSignature-
 * Envelope durch Anker-EnumEvent (Id="0" Time="-63072000" Value=erster
 * Breakpoint-Value, Slice-6-Konvention) + User-Breakpoints (Id="1..n").
 * Alles ausserhalb byte-identisch (`xml.slice`). Value ist garantiert
 * roher Integer (Number.isInteger-Guard pro bp VOR jeder Mutation).
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @param breakpoints - Lineare Tsig-Breakpoints (`time` = globale Beats,
 *   `value` = roher Integer-Enum-Index); `curve` → Slice-6c-Throw.
 * @returns Modifizierter XML-String.
 * @throws {Error} Bei curve-Eingabe, nicht-ganzzahligem Value, fehlendem
 *   MainTrack/Envelope oder leerer Breakpoint-Liste.
 */
export function injectTimeSigEnvelope(
  xml: string,
  breakpoints: Breakpoint[],
): string {
  const first = breakpoints[0];

  if (first == null) {
    throw new Error("mindestens 1 Breakpoint erforderlich");
  }

  for (const bp of breakpoints) {
    assertNoTimeSigCurve({ curve: bp.curve });

    if (!Number.isInteger(bp.value)) {
      throw new Error("EnumEvent-Value muss Integer/ganzzahlig sein");
    }
  }

  const { start, end } = locateTimeSigEnvelopeEvents(xml);
  const anchor = `${I8}<EnumEvent Id="0" Time="-63072000" Value="${first.value}" />`;
  const userEvents = breakpoints
    .map(
      (bp, i) =>
        `${I8}<EnumEvent Id="${i + 1}" Time="${fmtTime(bp.time)}" Value="${bp.value}" />`,
    )
    .join("\n");
  const eventsBlock = `${I7}<Events>\n${anchor}\n${userEvents}\n${I7}</Events>`;

  return xml.slice(0, start) + eventsBlock + xml.slice(end);
}

/**
 * Isoliert den `<MainTrack …>…</MainTrack>`-Block (Open-Tag HAT Attribute →
 * per `<MainTrack ` lokalisieren, nicht `<MainTrack>`).
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns Der MainTrack-Substring (Open-Tag bis exkl. `</MainTrack>`).
 * @throws {Error} Wenn kein `<MainTrack>` vorhanden.
 */
function isolateMainTrack(xml: string): string {
  const start = xml.indexOf("<MainTrack ");
  const end = xml.indexOf("</MainTrack>");

  if (start === -1 || end === -1) {
    throw new Error(
      "Kein <MainTrack> im .als — Master-TimeSignature-Locator gescheitert",
    );
  }

  return xml.slice(start, end);
}

/**
 * Render the breakpoint `time` without scientific notation: integers as
 * integers, floats as floats (trailing zeros trimmed). Nur Time kann float
 * sein; Value ist garantiert Integer → direkte String-Interpolation.
 * Lokal gespiegelt (Slice-Kern bleibt git-diff-leer, kein Export-Eingriff).
 * @param n - Zu formatierende Zeit (globale Beats).
 * @returns Dezimalstring, niemals in Exponent-Form.
 */
function fmtTime(n: number): string {
  if (Number.isInteger(n)) {
    const s = String(n);

    return /[Ee]/.test(s) ? BigInt(n).toString() : s;
  }

  let s = n.toFixed(12);

  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");

  return s;
}
