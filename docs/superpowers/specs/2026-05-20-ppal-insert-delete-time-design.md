# Slice: ppal-insert-delete-time — Cross-cutting Time-Operation

**Datum:** 2026-05-20 **Welle 1 / Eimer A:** Item 5 von 6 (hoch — komplexester
Slice). **Kandidat:** Gap §2.x — Live's Edit → Insert/Delete Time (Cmd+Shift+I /
Cmd+Shift+Delete) verschiebt ALLE Track-Inhalte ab einer Zeitposition um eine
Laenge. Erweiterung des bestehenden `shift-time`-Subcommands (Slice 12) auf
SET-WEITE Operation aller Track-Element-Typen. **Recon-Gate:** PENDING —
Multi-Fixture-Kampagne Pflicht.

## 1. Problem & Nutzen

`ppal-shift-time` heute (Slice 12, gemergt PR #12): verschiebt **Arrangement-
Clips eines einzelnen Tracks** um delta-Bars. Nicht abgedeckt:

- Set-weite Operation (alle Tracks gleichzeitig).
- Automation-Events (Arrangement + Master-Tempo + TimeSig-Marker).
- Locators (Cue-Markers).
- Window-Guard fuer einen WINDOW \[startTime, endTime\] — alles ausserhalb der
  Range bleibt unveraendert.

**Insert-Time:** ab `startTime` einen Zeitabschnitt `length` einfuegen (alles ab
startTime wird um +length verschoben). **Delete-Time:** ab `startTime` einen
Zeitabschnitt `length` entfernen (alles ab startTime+length wird um −length
verschoben; alle Elemente INNERHALB \[startTime, startTime+length\] werden
geloescht).

## 2. Recon-Befund

**Element-Klassen, die bewegt/geloescht werden muessen (Hypothese aus
bestehenden Slices abgeleitet):**

| Klasse                           | Modul/XPath                                              | Operation                      |
| -------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Arrangement-Clips (Audio + MIDI) | `<ArrangementClip>` in jedem Track                       | currentStart/currentEnd shift  |
| Take-Lanes-Clips                 | `<TakeLane><Clips>...`                                   | currentStart/currentEnd shift  |
| Track-Automation-Events          | `<AutomationEnvelopes>` pro Track + Master               | FloatEvent Time-Attribut shift |
| TimeSignature-Marker             | `<MasterTrack><TimeSignatures><RemoteableTimeSignature>` | Time shift                     |
| Tempo-Events                     | `<MasterTrack><Tempo><AutomationEnvelopes>`              | FloatEvent shift               |
| Locators (Cues)                  | `<Locators><Locator>`                                    | Time shift                     |
| Loop-Region                      | `<MainSequencer><LoopStart>`                             | optional shift (User-decision) |
| Modulation-Events                | Modulation-Envelopes (Slice ppal-modulation)             | wie Automation                 |

**Recon-Plan (5 Fixtures, je vorher/nachher-Paar):**

| Fixture            | Beschreibung                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `IT-A-base.als`    | Set mit 2 Audio-Tracks, 2 MIDI-Tracks, 4 Clips, Tempo-Automation, TimeSig-Wechsel bei Bar 5, 2 Locators bei Bar 3 und 9 |
| `IT-B-insert.als`  | Set A, **Edit → Insert Silence** 2 Bars ab Bar 4                                                                        |
| `IT-C-delete.als`  | Set A, **Edit → Delete Time** 2 Bars ab Bar 4                                                                           |
| `IT-D-edge.als`    | Set A, Insert ab Bar 1 (vor allem); Delete ab Bar 10 (nach allem)                                                       |
| `IT-E-overlap.als` | Set A, Delete genau im Bereich eines Clips (Clip mid-section betroffen)                                                 |

Diff A↔B, A↔C, A↔D, A↔E zeigt:

- exakte Liste der bewegten XML-Tags
- Schnitt-Verhalten fuer Clips, die GENAU an der Window-Grenze starten/enden
- Was passiert mit Elementen im Loesch-Window (Delete-Case)

## 3. Scope

**IN:**

- Neues Modul `src/automation/als-insert-delete-time.ts`:
  - `insertTime(setXml, startBeats, lengthBeats)` — shift ALL Elemente
    ≥startBeats um +lengthBeats.
  - `deleteTime(setXml, startBeats, lengthBeats)` — entferne Elemente in
    \[startBeats, startBeats+lengthBeats\), shift Elemente ≥end um −lengthBeats.
- CLI-Subcommand `time-edit insert|delete --start <beats> --length <beats>`.
- Aufruft alle bestehenden shift-Komponenten (analog Composition-Pattern aus
  Slice 12 + Slice 6 Tempo-Events + Slice 6b TimeSig).

**OUT:**

- Per-Track-Insertion (Slice 12 deckt das bereits ab fuer single track).
- Manual Loop-Region-Shift (User-decision, Default unveraendert).
- Computer-Use-Capture-Fallback (Eimer C, separate Welle).

## 4. Architektur

Composition aus bestehenden Modulen:

- `als-shift-time.ts` (Track-Level Clip-Shift)
- `als-arrangement-writer.ts` (Automation-Events)
- `als-master-timeline/*.ts` (Tempo + TimeSig)

Neuer Modul ist Orchestrator + Locators-Handler (Locators sind heute noch nicht
abgedeckt). Folder-Limit 26→27 erwartet.

**KRITISCH:** Delete-Time-Window-Schnitt fuer Clips, die das Window ueberlappen,
ist non-trivial:

- Clip beginnt vor Window, endet im Window: Clip wird verkurzt (End auf
  Window-Start gekuerzt).
- Clip beginnt im Window, endet danach: Clip wird verkurzt (Start auf
  Window-End - length geschoben, dabei Inhalt-Offset anpassen).
- Clip komplett im Window: Clip geloescht.
- Clip umspannt das ganze Window: Clip wird "geteilt" (zwei Clips? Recon
  entscheidet — wahrscheinlich teilt Live nicht, sondern macht einen verkurzten
  Clip mit Loch).

## 5. Akzeptanzkriterien / Gate

- `npm run check` Exit 0; Cov ≥ 95.53%.
- Byte-Verify pro Recon-Diff: IT-B-insert reconstructable from IT-A
  - insertTime(...).
- Roundtrip mit allen 5 Fixtures (A→B, A→C, A→D, A→E).
- Codex-Stage-2 APPROVED.

## 6. Risiken (Premortem-Skizze)

- R1 (HOCH): Clip-Verkurzungs-Schema im Delete-Fall ist Live-spezifisch und
  nicht trivial reproduzierbar. Mitigation: Fixture IT-E (overlap) ist Pflicht;
  Schema durch Diff-Analyse byte-belegen.
- R2 (HOCH): Cross-cutting Aenderung erhoeht jscpd-Risk (mehrere Shift- Pfade
  aehnlich). Mitigation: shared `shiftTimeOnEvents`-Utility,
  Single-Source-of-Truth.
- R3 (MITTEL): Locators-Modul existiert noch nicht — wenn Recon zeigt
  Locator-Tag ist nicht-trivial, separater Sub-Slice 5a.
- R4 (MITTEL): Window-Guard fuer Multi-Track-Shift muss alle Track-Bloecke
  abdecken, nicht nur einen — Subrange-API von Slice ppal-window-guard ist
  Pflicht.

## 7. Slice-Schnitt-Vorschlag

Wenn Recon zeigt der Scope ist > 1 Tag, in 3 Sub-Slices teilen:

- **5a Locators-Shift** (kleinster, Standalone-Modul + CLI-Op).
- **5b Cross-Track-Insert** (Insert-only, kein Schnitt — einfacher).
- **5c Cross-Track-Delete-mit-Schnitt** (Schnitt-Schema).
