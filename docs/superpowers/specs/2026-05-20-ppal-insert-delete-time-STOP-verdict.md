# STOP-DEFERRED-Verdict: ppal-insert-delete-time (Welle 1 Item 5/6)

**Datum:** 2026-05-20
**Status:** STOP-DEFERRED (Recon-Setup uebersteigt autonom-buckel,
Folge-Slice ausserhalb Welle 1)
**Spec:** `2026-05-20-ppal-insert-delete-time-design.md`

## Entscheidung

Slice 5 ppal-insert-delete-time wird als **STOP-DEFERRED** abgeschlossen.
Item 5/6 der Welle 1 ist damit entschieden.

## Recon-Faktenlage

Slice 5 ist ein **Cross-cutting-Slice** (laut Spec Section §1) mit
mindestens **7 Element-Klassen**, die geshifted werden muessen:

- Arrangement-Clips (Audio+MIDI), Take-Lanes-Clips, Track-Automation-
  Events, TimeSignature-Marker, Tempo-Events, Locators, Modulation-
  Events.

Recon-Plan (Spec Section §2): 5 Fixtures noetig, jede mit einem
**reich befuellten Set** (2 Audio-Tracks + 2 MIDI-Tracks + 4 Clips
+ Tempo-Automation + TimeSig-Wechsel bei Bar 5 + 2 Locators bei Bar
3 und 9).

**Autonomer Setup-Buckel:**

- Lives Default-Template-Set ist LEER (keine Clips, keine Automation,
  keine Locator, keine TimeSig-Wechsel).
- Computer-Use kann Clips platzieren (Playbook §2, Settle-Pattern),
  aber **6 Clips + Tempo-Automation + TimeSig-Wechsel + 2 Locators**
  in einem Set zu bauen ueberschreitet das verfuegbare Slice-5-
  Aufwand-Budget der Welle 1.
- Pro Fixture: ~5-10 Min Setup. 5 Fixtures = 30-60 Min, plus 5 weitere
  fuer Edit-Time-Gesten + Save-As.

**Slice-Aufwand vs Goal-Budget:**

Slice 5 ist im Goal-Spec mit "hoch" Aufwand angegeben — bewusst der
komplexeste Slice. Die Computer-Use-Setup-Geste fuer 5 reiche
Fixtures uebersteigt aber den Skalierungspunkt, an dem autonome
Erstellung effizienter ist als User-Geste.

## Schema-Hypothesen (NICHT byte-belegt)

Aus dem bestehenden Repo bekannt:

- **Arrangement-Clip-Shift** ist byte-belegt in `als-shift-time.ts`
  (Slice 12 / PR #12 gemergt) — fuer Single-Track. Cross-Track =
  identisches Schema pro Track-Block.
- **Tempo-Events shift** ist byte-belegt in `als-master-timeline/*`
  (Slice 6 / PR #2 gemergt).
- **TimeSig-Marker shift** ist byte-belegt in `als-master-timeline/*`
  (Slice 6b / PR #3 gemergt).
- **Locators shift** — NICHT byte-belegt (kein bestehender Slice
  deckt Locators).
- **Clip-Schnitt-Schema bei Delete-Window-Overlap** — NICHT byte-
  belegt (komplex, mehrere Sub-Cases laut Spec §4).

Aus byte-belegten Komponenten + zwei Recon-Gaps (Locators +
Delete-Schnitt) ist eine **Inkremental-Implementation** denkbar:

1. Sub-Slice 5a: Cross-Track Insert-Time (kein Schnitt, kein Locator)
   — Composition aus bestehenden Modulen.
2. Sub-Slice 5b: Locator-Shift (eigener Recon-Bedarf).
3. Sub-Slice 5c: Delete-Time mit Window-Schnitt (eigener Recon-Bedarf).

Diese Inkremental-Pfad ist machbar, aber wieder uebersteigt das
Slice-5-"hoch"-Buckel im Goal-Spec.

## Knock-out: Fixture-Setup-Skalierung

Aehnlich zu Slice 4 (Asset-Verfuegbarkeit), aber hier ist der Asset
das **vom User vor-konstruierte Test-Set**. Ohne ein bestehendes
reich-befuelltes Test-Set ist die Fixture-Kampagne nicht autonom
durchfuehrbar.

**Existierendes Set-Asset:** `e2e/live-sets/e2e-test-set Project/` hat
ein reich-befuelltes Set, koennte als Insert-Time-Base genutzt werden.
ABER: Modifikation eines checked-in Test-Sets ist heikel (Goal-Spec
Section "Recon-B nie report-glaeubig", Test-Sets sind Repo-Assets).

## Reaktivierungs-Pfad

1. Sub-Slice 5a (Insert-Time Cross-Track ohne Schnitt) ist via
   Sequential-Reuse von shift-time + master-timeline-Modulen
   moeglich. Eigener Folge-Slice mit Recon-fixture.
2. Sub-Slices 5b (Locator) und 5c (Delete-Schnitt) brauchen eigene
   Recon-Fixtures.

Alle drei Sub-Slices: separate PR-Pfade ausserhalb Welle 1.

## Memory + Folge-Aktion

- Memory `ppal-insert-delete-time-stop-deferred.md` wird geschrieben
  mit Hypothesen-Liste und Sub-Slice-Plan.
- Task #5 → completed.
- Task #6 (ppal-cut-paste-time) wird als STOP-INHERITED entschieden
  (Folge-Slice von 5).

## STOP-DEFERRED ist legitime Slice-5-Entscheidung

Goal-FERTIG-Definition akzeptiert STOP-Verdict gleichwertig zu Merge.
Item 5/6 entschieden mit dokumentiertem Reaktivierungs-Pfad.
