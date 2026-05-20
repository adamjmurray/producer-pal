# Slice: ppal-ext-instrument-routing — MIDI-Out + Audio-In Vocabulary-Erweiterung

**Datum:** 2026-05-20 **Welle 1 / Eimer A:** Item 2 von 6. **Kandidat:** Gap
§2.6 „External Instrument / Hardware-Routing-Detail" + „MIDI-Output-Mapping"
(NICHT abgedeckt im closed vocabulary von `als-routing.ts`). **Recon-Gate:**
PENDING — Spekulationsverbot bei < 2 Fixtures.

## 1. Problem & Nutzen

Heute hat `ROUTING_TARGETS["midi-out"]` nur `none`/`MidiOut/None`. Lives GUI
bietet aber:

- System-MIDI-Ports (IAC Driver Bus 1/2/..., Network MIDI) → OS-portable,
  closed-vocabulary-Kandidat.
- Hardware-MIDI-Ports (USB-MIDI-Geraete) → Geraete-Display-Name leak potentiell,
  STOP-Kandidat.
- "No Output" + MIDI-Channel-Wahl (per Port: Channel 1-16, alle, ...).

Slice-Ziel: well-known **system-portable** MIDI-Out-Targets ergaenzen (IAC,
Network MIDI) + MIDI-Channel-Mapping pruefen. Hardware-MIDI-Ports sind als
dokumentierte Grenze ausgewiesen wenn Recon zeigt der Geraete-Name leaked.

Zusatz-Scope: External-Instrument-Device-internes Routing (Audio-In-
Channel-Select + MIDI-Out-Channel-Select des Devices) — separater Pfad, weil das
Device-Parameter ist, nicht Track-Routing. **OUT for now** (eigener Folge-Slice,
falls Bedarf), Slice fokussiert auf Track-Level-MIDI-Out.

## 2. Recon-Befund

**Hypothese (NICHT byte-belegt):**

- IAC Driver erscheint in Lives MIDI-Out-Dropdown nur, wenn in macOS
  Audio-MIDI-Setup-App ein IAC-Bus aktiviert ist.
- Track-Routing-Tag pro MIDI-Out enthaelt zusaetzlich zur Port-Auswahl einen
  Channel-Sub-Eintrag (z.B. `MidiOut/IAC.Bus 1/0` fuer Channel 1 oder
  `MidiOut/IAC.Bus 1/-1` fuer "All").
- UpperDisplayString = "IAC Driver" oder Geraete-Name; LowerDisplayString =
  Channel ("All", "Ch. 1", ...).

**Recon-Plan (4 minimale Fixtures, optional 2 Hardware-Kontrolle):**

| Fixture                   | Beschreibung                                           | Zweck                              |
| ------------------------- | ------------------------------------------------------ | ---------------------------------- |
| `M-A.als`                 | leeres Set, 1 MIDI-Track, MidiOut=None                 | Baseline                           |
| `M-B-iac1-all.als`        | MidiOut=IAC Driver Bus 1, Channel=All                  | erstes Tripel + Channel-All-Schema |
| `M-C-iac1-ch1.als`        | MidiOut=IAC Driver Bus 1, Channel=1                    | Channel-Pick-Schema                |
| `M-D-iac2-ch1.als`        | MidiOut=IAC Driver Bus 2, Channel=1                    | Bus-Index-Schema                   |
| `M-E-hardware.als` (opt.) | MidiOut=<irgendein USB-MIDI-Out>, Channel=All          | Geraete-Name-Leak-Test             |
| `M-F-audio-in.als` (opt.) | Audio-Track AudioIn auf konkreten Mono-In (ext-mono-3) | komplementiert audio-in-Vocabulary |

**Voraussetzung User**: macOS IAC Driver Bus 1 + Bus 2 aktiv (Audio-MIDI-
Setup-App → IAC Driver → "Device is online" + 2 Buses). Falls Windows-/
Linux-User: Slice-Scope auf Network-MIDI oder loopMIDI anpassen.

**GO-Bedingung (Vocabulary-Erweiterung):**

- IAC-Bus-Targets sind system-portable (gleiche Strings auf jedem Mac).
- Channel-Sub-Schema ist deterministisch (Index in Target, Display in Lower).
- Hardware-Fixture E (falls geliefert): zeigt klar Geraete-Name-Leak →
  Hardware-MIDI-Ports OUT, IAC-Ports IN.

**STOP/Partial-Bedingung:**

- IAC-Display-String ist macOS-Version-abhaengig (z.B. variabel zwischen macOS
  Sequoia / Sonoma) → Partial-Scope auf den verifizierten OS- Stand.

## 3. Scope

**IN (GO-Pfad):**

- `ROUTING_TARGETS["midi-out"]` um IAC-Bus-Eintraege erweitern (`iac-1-all`,
  `iac-1-ch1` … `iac-1-ch16`, `iac-2-all`, … falls Recon-Index-Schema das so
  kodiert).
- Naming-Vorschlag (FINAL nach Recon): `iac-<bus>-<channel>`.
- Optional: `ROUTING_TARGETS["audio-in"]` um `ext-mono-<N>` ergaenzen (falls
  Fixture F geliefert; spiegelt Slice 1 falls dort GO-Pfad passiert, sonst
  eigener Recon).

**OUT (begruendet):**

- Hardware-MIDI-Ports (USB-Geraete-Name-Leak) → dokumentierte Grenze.
- External-Instrument-DEVICE-Parameter (Device-Tree, separater Slice).
- Network-MIDI (separate Recon-Welle falls relevant).

## 4. Architektur

Identisch zu Slice 1: nur `ROUTING_TARGETS`-Eintraege + Test-Tabelle-
Synchronisation. KEIN Helper-Code, KEIN Dispatch. Test-Infrastruktur greift
automatisch.

## 5. Akzeptanzkriterien / Gate

- `npm run check` Exit 0; Branch-Cov ≥ 95.53%.
- jscpd ≤ 0.25; tsc strict-null clean.
- Byte-Verify: Roundtrip pro neuem Key gegen Fixtures.
- Codex-Stage-2 APPROVED.

## 6. Risiken (Premortem-Skizze)

- R1: Channel-Sub-Schema explosiv (16 Channels × 2 Busse = 32 Eintraege).
  Mitigation: erstes Recon zeigt das Schema → moeglicherweise reicht ein
  synthetisches Schema (`iac-{bus}-ch{1..16}` als Code-Generator statt 32
  hand-gepflegter Eintraege). Aber: Spekulationsverbot → jeden Channel mind.
  einmal byte-belegen. Pragmatik: alle 16 Channels pro Bus zu verifizieren ist
  16 Fixtures × 2 Busse = 32 — zu viel. → Slice 2.1: nur 4 Spot-Checks pro Bus
  (Ch 1, 5, 10, 16), wenn Schema linear ist (Index nimmt), Rest per
  Code-Generator.
- R2: IAC nicht aktiviert auf User-Mac → keine Recon moeglich. Mitigation:
  User-Setup-Hinweis. Wenn IAC nicht aktivierbar, STOP- Verdict fuer Slice 2
  oder Skip mit Network-MIDI als Fallback.
- R3: macOS-Display-String-Drift (z.B. `"IAC-Treiber"` auf deutschsprachigem
  macOS). Mitigation: Lokale-Test gegen englische macOS-Locale; im Notfall
  Lokale-Hinweis im Modul-Header.
