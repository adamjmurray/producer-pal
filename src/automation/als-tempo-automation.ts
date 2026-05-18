// src/automation/als-tempo-automation.ts
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Breakpoint } from "#src/automation/breakpoint-validator.ts";

// TAB-Indentation byte-verifiziert gegen das echte Set
// evals/live-sets/basic-midi-4-track (MainTrack-Tempo-Envelope):
// <Events>/</Events> = 7 TABs, <FloatEvent>-Kinder = 8 TABs.
const T = "\t";
const I7 = T.repeat(7);
const I8 = T.repeat(8);

/** Eingabe-Flags, die in Slice 6 (nur lineare Tempo-Automation) gesperrt sind. */
export interface Slice6bGuardInput {
  timeSignature?: string;
  curve?: boolean;
}

/**
 * Sperrt Slice-6b-Funktionalität (Time-Signature-Marker, gekrümmte Segmente)
 * mit klarer Fehlermeldung. Kein stiller No-Op.
 * @param input - Zu prüfende Eingabe-Flags.
 * @returns void wenn rein lineare Tempo-Eingabe.
 */
export function assertNoSlice6bInput(input: Slice6bGuardInput): void {
  if (input.timeSignature != null) {
    throw new Error(
      "Time-Signature-Marker sind nicht in Slice 6 — siehe Slice 6b",
    );
  }

  if (input.curve === true) {
    throw new Error(
      "Gekrümmte Tempo-Segmente sind nicht in Slice 6 — siehe Slice 6b",
    );
  }
}

/**
 * Resolve the Master/Main-Track Tempo `AutomationTarget Id` (= PointeeId der
 * Tempo-Envelope). Robust aus dem konkreten Set gelesen (faktisch "8", nicht
 * hardcoden). MainTrack per `<MainTrack ` (Open-Tag HAT Attribute) isoliert.
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns Die Tempo-AutomationTarget-Id als String.
 * @throws {Error} Wenn kein `<MainTrack>` oder kein Tempo-AutomationTarget.
 */
export function resolveMasterTempoTargetId(xml: string): string {
  const block = isolateMainTrack(xml);
  const m = /<Tempo>[\S\s]*?<AutomationTarget Id="(\d+)"/.exec(block);

  if (m?.[1] == null) {
    throw new Error(
      "MainTrack: kein <Tempo><AutomationTarget Id> gefunden (Tempo-Param fehlt)",
    );
  }

  return m[1];
}

/**
 * Locate the `<Events>…</Events>`-Block der MainTrack-Tempo-Envelope (jene
 * `<AutomationEnvelope>` mit `<PointeeId Value="{TempoId}" />`). Absolute
 * Indizes ins volle `xml` (Mitigation-A: index = Offset, block materialisiert).
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns `{ start, end, block }` — `end` exklusiv, `block` = exakt der
 *   eingerueckte `<Events>`-Block inklusive fuehrender 7 TABs.
 * @throws {Error} Wenn kein `<MainTrack>` oder keine Tempo-Envelope/Events.
 */
export function locateTempoEnvelopeEvents(xml: string): {
  start: number;
  end: number;
  block: string;
} {
  const mainStart = xml.indexOf("<MainTrack ");
  const mainEnd = xml.indexOf("</MainTrack>");

  if (mainStart === -1 || mainEnd === -1) {
    throw new Error(
      "Kein <MainTrack> im .als — Master-Tempo-Locator gescheitert",
    );
  }

  const tempoId = resolveMasterTempoTargetId(xml);
  const block = xml.slice(mainStart, mainEnd);
  const pidIdx = block.indexOf(`<PointeeId Value="${tempoId}" />`);

  if (pidIdx === -1) {
    throw new Error(
      `MainTrack: keine Tempo-<AutomationEnvelope> mit PointeeId ${tempoId}`,
    );
  }

  let s = block.indexOf("<Events>", pidIdx);
  const eMarkerEnd = block.indexOf("</Events>", s);

  if (s === -1 || eMarkerEnd === -1) {
    throw new Error(
      `MainTrack: Tempo-Envelope (PointeeId ${tempoId}) ohne <Events>-Block`,
    );
  }

  while (s > 0 && block[s - 1] === "\t") s--;

  const e = eMarkerEnd + "</Events>".length;
  const start = mainStart + s;
  const end = mainStart + e;

  return { start, end, block: xml.slice(start, end) };
}

/**
 * Ersetzt NUR den `<Events>…</Events>`-Block der MainTrack-Tempo-Envelope
 * durch Anker-FloatEvent (Id="0" Time="-63072000" Value=erster Breakpoint-
 * Value, Slice-2-Konvention) + User-Breakpoints (Id="1..n"). Alles ausserhalb
 * byte-identisch (`xml.slice`).
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @param breakpoints - Lineare Tempo-Breakpoints (`time` = globale Beats,
 *   `value` = roher BPM); `curve`/`timeSignature` → Slice-6b-Throw.
 * @returns Modifizierter XML-String.
 * @throws {Error} Bei Slice-6b-Eingabe, fehlendem MainTrack/Envelope oder
 *   leerer Breakpoint-Liste.
 */
export function injectTempoEnvelope(
  xml: string,
  breakpoints: Breakpoint[],
): string {
  for (const bp of breakpoints) {
    assertNoSlice6bInput({ curve: bp.curve });
  }

  const first = breakpoints[0];

  if (first == null) {
    throw new Error("mindestens 1 Breakpoint erforderlich");
  }

  const { start, end } = locateTempoEnvelopeEvents(xml);
  const anchor = `${I8}<FloatEvent Id="0" Time="-63072000" Value="${fmt(first.value)}" />`;
  const userEvents = breakpoints
    .map(
      (bp, i) =>
        `${I8}<FloatEvent Id="${i + 1}" Time="${fmt(bp.time)}" Value="${fmt(bp.value)}" />`,
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
      "Kein <MainTrack> im .als — Master-Tempo-Locator gescheitert",
    );
  }

  return xml.slice(start, end);
}

/**
 * Render a number without scientific notation: integers as integers, floats as
 * floats. Trims trailing zeros after the decimal point. Identical contract to
 * the Slice-1 `fmt` in als-envelope-writer / als-arrangement-writer (raw
 * Ableton param units). Lokal gespiegelt (nicht aus als-arrangement-writer.ts
 * importiert: dort NICHT exportiert; Constraint = nur 2 Dateien aendern, der
 * Slice-1–5b-Kern muss git-diff-leer bleiben — kein Export-Eingriff).
 * @param n - Zu formatierende Zahl.
 * @returns Dezimalstring, niemals in Exponent-Form.
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
