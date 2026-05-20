# Slice: ppal-tuning — Scala/Tuning-Systeme (Live 12)

**Datum:** 2026-05-20
**Welle 1 / Eimer A:** Item 4 von 6.
**Kandidat:** Gap §2.9 „Tuning-Systeme / Scala-Import" — Live 12 Suite
hat eingebauten Scala-Tuning-Support. Tuning-Spec wird im Set referenziert
(externe `.scl`-Datei in Project-Ordner ODER inline-XML, Recon entscheidet).
**Recon-Gate:** PENDING.

## 1. Problem & Nutzen

Live 12 erlaubt per-Set ein globales Tuning-System (12-EDO, 24-EDO,
Scala-Datei, ...). Aktive Tuning beeinflusst Notenklang aller Tracks
mit MPE/Tuning-aware-Devices. Slice-Ziel: programmatisches Setzen des
Tuning-Systems ohne Live zu oeffnen, analog `.agr`-Import (Slice 5b).

## 2. Recon-Befund

**Hypothese (NICHT byte-belegt):**

- Inline-XML-Variante: Tuning-Spec liegt direkt im Set-Header
  (`<MasterTrack>` / `<Tuning>`) — keine externe Datei. Set-portable.
- File-Variante: Set referenziert `.scl`-Datei im Project-Ordner
  (`<Tuning Name="…" Path="…">`), analog `.agr`-Groove-Pool aus
  Slice 5b. Externe Datei muss mit-kopiert werden.
- Hybrid: Default-Tunings inline, importierte Scala-Files external.

**Recon-Plan (4 Fixtures):**

| Fixture | Beschreibung | Zweck |
|---|---|---|
| `T-A.als` | Set, **Default 12-EDO** Tuning aktiv | Baseline |
| `T-B.als` | Set, **24-EDO** (Built-in) aktiv | zweite Built-in-Variante |
| `T-C.als` | Set, **importierte Scala-Datei** aktiv (z.B. `meantone.scl`) | externe Datei-Pfad |
| `T-D.als` | Set, **eigene Scala** (User-Datei in Library) aktiv | Library-Pfad-Form |

Plus die zugehoerige Scala-Datei (User stellt eine bereit ODER aus Lives
Stock-Library z.B. `harmonic.scl`).

**GO-Bedingung (Slice 4a Inline-Pfad):**

- Lives Built-in-Tunings sind inline im Set (Set-portable).
- Recon zeigt klar das XML-Schema.

**GO-Bedingung (Slice 4b Scala-Datei-Pfad):**

- Externe `.scl`-Datei wird wie `.agr` ueber Path-Reference verlinkt;
  ImportPath im Set + Datei-Kopie in Project-Ordner.

**STOP-Bedingung:**

- Tuning-System bindet an Live-Lizenz/Pack-Installation (z.B. Suite-only
  Feature, das nicht offline schreibbar ist).
- Set-Datei enthaelt nur einen Hash/Id, der zur Laufzeit aufgeloest
  wird (= nicht byte-deterministisch).

## 3. Scope

**IN (GO-Pfad):**

- Neues Modul `src/automation/als-tuning.ts`:
  - `setTuningSystem(setXml, tuningName)` — schaltet auf Built-in oder
    User-defined Tuning.
  - `attachScalaFile(setXml, scalaFile, projectDir)` — fuer
    Scala-Import (= 4b, analog `attachGrooveFile` aus 5b).
- CLI-Subcommand `tuning set|import|get`.

**OUT:**

- MIDI-Mapping auf Tuning-Bank-Switcher (= MIDI-Map, Slice 3).
- Microtuning per-Note (=Live-Limitation; Tuning ist global).

## 4. Architektur

Folder-Limit ggf. 25→26 (im PR ausweisen).
Pattern analog `als-groove.ts` (Slice 5/5b).

## 5. Akzeptanzkriterien / Gate

- `npm run check` Exit 0; Cov ≥ 95.53%.
- Byte-Verify: setTuningSystem-Roundtrip; Scala-Import erzeugt
  byte-identischen Set + Datei-Kopie.

## 6. Risiken (Premortem-Skizze)

- R1: Scala-Datei-Pfad ist absolut vs relativ (Lives Library liegt
  außerhalb Project-Ordner). Mitigation: Recon-Fixture D zeigt Library-
  Path-Form.
- R2: Live re-derived Tuning-Name aus File-Inhalt beim Save (instabil).
  Mitigation: Set-Reopen-Test, Byte-Identitaet pruefen.
- R3: 4a + 4b sollten getrennte Sub-Slices sein, falls Recon zeigt sie
  haben unterschiedliche Risiken. Mitigation: nach Recon entscheiden.
