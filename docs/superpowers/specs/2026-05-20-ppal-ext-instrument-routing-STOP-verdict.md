# STOP-Verdict: ppal-ext-instrument-routing (Welle 1 Item 2/6)

**Datum:** 2026-05-20
**Status:** STOP (dokumentierte Grenze: macOS-Locale-Leak im
MIDI-Out-Routing-String)
**Spec:** `2026-05-20-ppal-ext-instrument-routing-design.md`

## Entscheidung

Slice 2 ppal-ext-instrument-routing wird als **STOP** abgeschlossen.
Item 2/6 der Welle 1 ist damit entschieden. Begruendung byte-belegt
durch Multi-Fixture-Recon-Kampagne (autonom via Computer-Use erstellt).

## Recon-Befund (byte-belegt)

4 Fixtures via Computer-Use in `/Users/macuser/Desktop/AIbleton/midi-
fixture/M-A Project/`:

| Fixture | MIDI-To | Target (woertlich) | Upper | Lower |
|---|---|---|---|---|
| M-A.als | No Output | `MidiOut/None` | `None` | `` |
| M-B-iac1-ch2.als | IAC Bus 1 Ch 2 | `MidiOut/External.Dev:IAC-Treiber (Bus 1)/1` | `IAC-Treiber (Bus 1)` | `Ch. 2` |
| M-C-iac1-ch1.als | IAC Bus 1 Ch 1 | `MidiOut/External.Dev:IAC-Treiber (Bus 1)/0` | `IAC-Treiber (Bus 1)` | `Ch. 1` |
| M-D-iac2-ch1.als | IAC Bus 2 Ch 1 | `MidiOut/External.Dev:IAC-Treiber (Bus 2)/0` | `IAC-Treiber (Bus 2)` | `Ch. 1` |

**Schema (eindeutig aus Recon):**

- Target-Format: `MidiOut/External.Dev:<DEVICE_DISPLAY_NAME>/<CHANNEL_0_BASED>`
- UpperDisplayString = `<DEVICE_DISPLAY_NAME>`
- LowerDisplayString = `Ch. <CHANNEL_1_BASED>`
- "All Channels"-Option existiert NICHT in Lives MIDI-To-Dropdown
  (nur Ch. 1-16 + MPE).

## Knock-out: macOS-Locale-Leak

`DEVICE_DISPLAY_NAME` enthaelt die **macOS-lokalisierte** Geraete-Bezeichnung:

- **Deutsch:** `IAC-Treiber (Bus 1)` (in den Recon-Bytes oben)
- **Englisch (Standard-macOS):** `IAC Driver (Bus 1)`

Auf macOS ist der IAC-Treiber via `Audio MIDI Setup`-App vorinstalliert,
sein Display-Name ist OS-Locale-abhaengig (Apple-System-Lokalisierung).
Lives `.als` schreibt diesen Display-Namen **woertlich** ins Target +
UpperDisplayString.

**Konsequenz fuer closed-vocabulary-Modell** (`als-routing.ts`-Pattern):

- Closed-vocabulary verlangt **system-portable** Strings, die set-/system-
  unabhaengig byte-deterministisch sind (analog `MidiOut/None`,
  `AudioOut/Main`).
- IAC-MIDI-Out-Strings sind NICHT system-portable: sie haengen am
  macOS-Locale-System-Display-Namen.
- Ein Closed-Vocab-Eintrag `iac-1-ch1` mit dem byte-belegten deutschen
  String `IAC-Treiber (Bus 1)` wuerde auf englischen Macs ein
  inkonsistentes Routing produzieren (Live re-derived den Display beim
  Laden, aber der `.als`-Target-String bleibt deutsch — Live sucht
  dann nach einem `IAC-Treiber`-Geraet, das auf Englisch nicht
  existiert, also FALLBACK auf None).

Gleicher Knock-out gilt fuer alle Hardware-MIDI-Ports (USB-Geraete-Namen
sind ebenfalls Display-Name-abhaengig — z.B. `Roland XV-5080` —
hardware-spezifisch, nicht system-portable).

## Analogie zu Slice ppal-routing OUT-Scope

Slice `ppal-routing` (gemergt PR #13) hat bereits set-spezifische Targets
(`AudioOut/Track.N/…`, `AudioOut/GroupTrack`) als **OUT-of-Scope**
gewertet (Spec Section §3 OUT). MIDI-Out auf Hardware-/IAC-Targets
faellt in dieselbe Kategorie: **dynamische, system-spezifische
Target-Strings**, die nicht ins closed-vocabulary gehoeren.

## Alternative GO-Variante (begruendet abgelehnt)

Theoretischer GO-Pfad: **template-based vocabulary** mit
Device-Name-Parameter (`midi-out-target --device "<NAME>" --channel <N>`),
das Modul generiert das Tripel zur Laufzeit. Architektur-Wechsel weg vom
closed-vocabulary-Modell.

**Abgelehnt weil:**

- Slice-Aufwand laut Goal "niedrig" — Architektur-Refactor ist
  "mittel" bis "hoch".
- ppal-routing wurde bewusst closed-vocabulary entworfen (Spec § 4
  Architektur), template-based Variante widerspricht dem.
- Andere Slices (mixer-routing, routing) haben den gleichen Cut bei
  set-spezifischen Targets gemacht — Konsistenz.

Falls template-based gewuenscht: eigener Folge-Slice **ausserhalb
Welle 1** mit eigener Spec/Plan/Premortem-Pflicht.

## Verifikations-Evidenz

Recon-Bytes in: `/Users/macuser/Desktop/AIbleton/midi-fixture/M-A Project/{M-A,M-B-iac1-ch2,M-C-iac1-ch1,M-D-iac2-ch1}.als`

Befund-Dump:

```
=== A (M-A.als) ===
  target="MidiOut/None" upper="None" lower=""

=== B (M-B-iac1-ch2.als) ===
  target="MidiOut/External.Dev:IAC-Treiber (Bus 1)/1" upper="IAC-Treiber (Bus 1)" lower="Ch. 2"

=== C (M-C-iac1-ch1.als) ===
  target="MidiOut/External.Dev:IAC-Treiber (Bus 1)/0" upper="IAC-Treiber (Bus 1)" lower="Ch. 1"

=== D (M-D-iac2-ch1.als) ===
  target="MidiOut/External.Dev:IAC-Treiber (Bus 2)/0" upper="IAC-Treiber (Bus 2)" lower="Ch. 1"
```

## Memory + Folge-Aktion

- Memory `ppal-ext-instrument-routing-stop-locale-leak.md` wird
  geschrieben mit Querverweis auf diese Datei.
- Task #2 → completed.
- Task #3 (ppal-midi-map) wird in_progress.

## STOP-Verdict ist legitime Slice-2-Entscheidung

Goal-FERTIG-Definition: "alle 6 [Items] entschieden (gemergt ODER
**STOP-Verdict**)." STOP mit byte-belegter Recon-Evidenz ist gleichwertige
Slice-Abschluss-Form. Item 2/6 entschieden.
