# Slice: ppal-cut-paste-time — Cut/Paste Time (Folge-Slice von 5)

**Datum:** 2026-05-20 **Welle 1 / Eimer A:** Item 6 von 6. **Kandidat:** Edit →
Cut Time (Cmd+Shift+X) + Paste Time (Cmd+Shift+V). **Recon-Gate:** abhaengig von
Slice 5.

## 1. Problem & Nutzen

Cut Time = Delete Time + Clipboard-Schreibvorgang. Paste Time = Insert Time +
Clipboard-Einfuegung der zuvor gecuttetes Inhalt.

Slice-5-Mechanik wird wiederverwendet, plus ein Clipboard-Format fuer den
"zwischengespeicherten Zeitabschnitt".

## 2. Recon-Befund

**Hypothese:**

- Live's Clipboard-Format fuer Time-Selection ist ein "fragment XML"- Subtree,
  der ALLE Element-Klassen aus dem Bereich enthaelt: Clip- Bloecke,
  Automation-Event-Listen, TimeSig-/Tempo-Marker, Locators.
- Cut == Copy + Delete-Time-Operation.
- Paste == Insert-Time-Operation mit den gecuttetes Elementen einlesend.
- Live persistiert Clipboard NICHT im .als (Run-time-only).

**Recon-Plan (2 Fixtures, beide nach manueller Geste):**

| Fixture                | Beschreibung                                                             |
| ---------------------- | ------------------------------------------------------------------------ |
| `CT-A-base.als`        | Set wie Slice 5 (IT-A-base), 2 Tracks + Automation + Locators            |
| `CT-B-cut.als`         | Set A nach **Cut Time** 4 Bars ab Bar 4                                  |
| `CT-C-paste.als`       | Set A nach Cut + **Paste Time** an Bar 10                                |
| `CT-D-paste-other.als` | Set A nach Cut + Paste in **anderes Set** mit kompatibler Track-Struktur |

CT-A→CT-B verifiziert: Cut == Delete-Time (Slice 5 reicht). CT-A→CT-C: Inhalt
von Bar 4-8 erscheint ab Bar 10 (Track-Identitaet behalten? Locators
mitkopiert?). CT-A→CT-D: Cross-Set-Paste — fuer offline-CLI vermutlich
OUT-of-scope (Clipboard-Format extern noetig).

## 3. Scope

**IN (wenn Slice 5 GO):**

- CLI-Subcommand `time-edit cut|paste-fragment` — Cut schreibt Fragment- XML in
  eine Datei (`<name>.als-fragment.xml`), Paste liest sie und insert in
  Ziel-Set.
- Fragment-Format: subset des Lives Set-XML mit allen Klassen aus Slice 5.

**OUT:**

- Cross-Set-Paste mit Auto-Track-Mapping (zu fragil).
- Run-time-Clipboard-Format-Reverse-Engineering (Live persistiert es nicht).

## 4. Architektur

Cut = `deleteTime` + Fragment-XML-Extract. Paste = `insertTime` mit Pre-Fill.

Neuer Modul `src/automation/als-time-clipboard.ts` (Fragment-Reader/-Writer).

## 5. Akzeptanzkriterien / Gate

Identisch Slice 5.

## 6. Risiken

- R1: Slice 5 nicht GO ⇒ Slice 6 nicht moeglich. Mitigation: Slice 6 ist
  explizit Folge-Slice, kein Standalone.
- R2: Fragment-Format muss self-contained sein (Sample-Refs der Audio- Clips!) —
  gleicher Project-Ordner-Wraparound wie heute fuer .agr/.scl. Mitigation: Slice
  6 nur fuer Same-Project-Roundtrip; Cross-Project ist OUT.
- R3: Trivial-Folge-Slice nach 5 — bei Slice-5-Delay verzoegert sich 6
  deterministisch.

## 7. STOP-Bedingung

Falls Slice 5 STOP-Verdict, Slice 6 automatisch STOP (Komposition unmoeglich).
