# STOP-DEFERRED-Verdict: ppal-tuning (Welle 1 Item 4/6)

**Datum:** 2026-05-20
**Status:** STOP-DEFERRED (Recon-Asset nicht autonom verfuegbar)
**Spec:** `2026-05-20-ppal-tuning-design.md`

## Entscheidung

Slice 4 ppal-tuning wird als **STOP-DEFERRED** abgeschlossen. Item 4/6
der Welle 1 ist damit entschieden.

## Recon-Faktenlage

**Live-Default-State (out-of-box, ohne User-Pack-Installation):**

- Lives Browser-Bibliothek-Eintrag "Tuning-Systems" ist **leer** (keine
  Built-in Tunings ohne installierte Tuning-Packs).
- Lives Tuning-Sektion links unten zeigt Text "Tuning-System hier
  ablegen" — kein aktives Tuning gesetzt = 12-EDO Default (implizit,
  kein XML-Knoten erwartet).
- Keine User-bereitgestellte `.scl`-Datei verfuegbar fuer Scala-Import.

**Recon-Bedingungen (laut Spec `ppal-tuning-design.md` Section 2):**

Slice braucht 4 Fixtures: T-A (Default 12-EDO), T-B (24-EDO Built-in),
T-C (Scala-Import), T-D (User-Library Tuning).

- T-A waere via Save des aktuellen Default-Sets erreichbar (kein Tuning
  aktiv).
- T-B, T-C, T-D benoetigen **Pack-installierte Tunings ODER User-
  bereitgestellte Scala-Datei** — autonom nicht generierbar.

Ohne mindestens 2 differenzierende Fixtures gilt **Spekulationsverbot**
laut Goal-Spec ("Spekulationsverbot bei < 2 Fixtures"). Recon nicht
durchfuehrbar.

## Knock-out: Pack/Asset-Abhaengigkeit

Im Gegensatz zu Slice 1 (CV) und Slice 2 (Ext-Instrument), die Hardware-
abhaengig waren, ist Slice 4 **Pack/Asset-abhaengig**:

- Lives Standard-Tunings (24-EDO, Harmonics, etc.) sind in einem
  optional installierbaren Tuning-Pack (Live 12 Suite-Feature ODER
  separate Pack-Library).
- Scala-Files (`.scl`) sind ein externes Datei-Format, das der User
  importieren muesste.

**Kein intrinsisches XML-/Byte-Problem** wie bei Slice 2 (Locale-Leak)
oder Slice 3 (inline-Position-Komplexitaet). Reine **Asset-Verfuegbarkeit**.

## Reaktivierungs-Pfad

Sobald **eine Scala-Datei** auf dem System verfuegbar ist:

1. Computer-Use: Datei in Lives Tuning-Sektion droppen (Drag-and-Drop
   auf "Tuning-System hier ablegen"-Target).
2. Save als `T-scala.als`.
3. Byte-Diff Baseline-Set vs T-scala.als zeigt das XML-Schema.
4. Wenn Schema klar (inline-XML ODER Pfad-Reference analog `.agr`),
   eigener Folge-Slice mit Code-Add.

Schema-Hypothesen (NICHT byte-belegt):

- **Inline-Variante**: `<MasterTrack><Tuning ScaleLength="N">…<Pitch>…
  </Tuning></MasterTrack>` (set-portable).
- **File-Reference-Variante**: `<Tuning Name="..." Path="...">` plus
  Datei-Kopie ins Project-Ordner-`Samples/`-Subverzeichnis (analog
  Slice-5b `.agr`-Groove-Import).

## Memory + Folge-Aktion

- Memory `ppal-tuning-stop-deferred-asset.md` wird geschrieben.
- Task #4 → completed.
- Task #5 (ppal-insert-delete-time) wird in_progress.

## STOP-DEFERRED ist legitime Slice-4-Entscheidung

Goal-FERTIG-Definition akzeptiert STOP-Verdict gleichwertig zu Merge.
Item 4/6 entschieden, ohne Spekulationsverbot-Verletzung.
