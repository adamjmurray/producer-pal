# Slice: ppal-midi-map — MIDI/Key-Map-Mode-Mappings als .als-XML-Knoten

**Datum:** 2026-05-20 **Welle 1 / Eimer A:** Item 3 von 6. **Kandidat:** Gap
§2.8 „MIDI-Map/Key-Map" — Live's manuell zugewiesene MIDI-CC- und
Computer-Tastatur-Mappings auf Mixer-/Device-Parameter, gespeichert als
XML-Knoten in der `.als`. **Recon-Gate:** PENDING — Spekulationsverbot bei < 2
Fixtures.

## 1. Problem & Nutzen

Live's MIDI-Map-Mode (Cmd+M) und Key-Map-Mode (Cmd+K) erlauben dem User, einen
MIDI-Controller-CC oder eine Computer-Tastatur-Taste auf einen beliebigen
Live-Parameter zu mappen (Volume-Slider, Send, Device-Pot, ...). Die Mappings
persistieren in der `.als` als XML-Knoten (vermutlich unter `<MidiControllers>`
oder `<ControlMappings>` o.ae. — Recon entscheidet).

Slice-Ziel: programmatisches Setzen einer Mapping-Tupel-Liste offline.

## 2. Recon-Befund

**Hypothese (NICHT byte-belegt):**

- Mappings leben in einem dedizierten `<MidiControllers>` oder
  `<MidiRemoteControl>`-Block am Track-Level oder im Set-Header.
- Pro Mapping: Controller-Id (MIDI-CC-Nummer + Channel ODER Key-Code),
  Pointee-Id des Ziel-Parameters, Range (Min/Max), Mode (Absolute, Relative,
  Toggle).
- Pointee-Id ist die `<AutomationTarget Id="N">`-Referenz, die in Mixer/
  Device-Bloecken steht — gleiche Id wie bei Automation/Modulation- Targets.

**Recon-Plan (3 minimale Fixtures):**

| Fixture           | Beschreibung                                         | Zweck                                      |
| ----------------- | ---------------------------------------------------- | ------------------------------------------ |
| `MM-A.als`        | Set mit 1 Audio-Track, KEINE Mappings                | Baseline (keine Mapping-Block-Praesenz)    |
| `MM-B.als`        | wie A, **MIDI-Mapping** CC1 Channel 1 → Track-Volume | erster Mapping-Eintrag, MIDI-Pfad          |
| `MM-C.als`        | wie A, **Key-Mapping** Buchstabe Q → Track-Mute      | zweiter Mapping-Eintrag, Key-Pfad          |
| `MM-D.als` (opt.) | wie B + zweites Mapping CC2 → Track-Pan              | zweiter MIDI-Eintrag, Multi-Mapping-Schema |

**GO-Bedingung:**

- Klar identifizierbarer Mapping-Block (lokalisierbar via Tag-Name).
- Pointee-Id der Ziel-Parameter ist deterministisch (= konstante
  AutomationTarget-Id, die bereits in anderen Modulen byte-belegt ist).
- Mapping-Eintrag ist atomar (1 XML-Knoten pro Mapping, kein Cross-File-
  Reference).

**STOP-Bedingung:**

- Mapping bindet an Hardware-Controller-Setup (Live's "Control Surfaces"- Liste
  in Prefs) und ist nicht im .als selbst-contained.
- Pointee-Id ist set-spezifisch und nicht von der CLI rekonstruierbar (analog
  zur ROT-Beobachtung in ppal-routing fuer Set-spezifische Targets).

## 3. Scope

**IN (GO-Pfad):**

- Neues Modul `src/automation/als-midi-map.ts`:
  - `MidiMapping` Interface (controllerKind: "midi-cc"|"key", controllerId:
    string, pointeeId: string, mode: string).
  - `addMidiMapping(setXml, mapping)` — schreibt einen neuen Mapping- Eintrag in
    den Block.
  - `removeMidiMapping(setXml, controllerId)` — entfernt.
  - `getMidiMappings(setXml)` — liest alle aktuell vorhandenen.
- CLI-Subcommand `midi-map add|remove|get` in `scripts/ppal-write-automation/`.
- Open-Set-Guard wie ueberall.

**OUT (begruendet):**

- Control-Surface-Definitionen (Hardware-spezifisch).
- Bank-Selector-Mappings (komplexer Multi-Slot-Pfad).
- Macros-Bindings auf Device-Bank-Knoebe (= Device-internes Routing, kein
  Mapping).

## 4. Architektur

Folder-Limit `src/automation` 24→25 (im PR ausweisen). Helper-Modul ~150 Zeilen
erwartet (analog `als-clip-flags.ts`).

## 5. Akzeptanzkriterien / Gate

- `npm run check` Exit 0; Cov ≥ 95.53%.
- jscpd ≤ 0.25; tsc strict-null clean.
- Byte-Verify: add → Re-Parse-getMappings == erwartet, andere XML
  byte-identisch.
- Codex-Stage-2 APPROVED.

## 6. Risiken (Premortem-Skizze)

- R1: Pointee-Id ist set-spezifisch (= ROT-Aequivalent). Mitigation: Recon zeigt
  → STOP fuer Modulation-mapping, evtl. PARTIAL fuer Track-globale Pointees
  (Volume, Mute = bekannte konstante Ids).
- R2: Hot-Reload-Verhalten unklar (laedt Live die Mappings beim Open?).
  Mitigation: Roundtrip-Test in echtem Set, Voll-XML-Diff.
- R3: Key-Mapping vs MIDI-Mapping schema-different (Key = key-code, MIDI =
  cc+channel). Mitigation: zwei Sub-Schemas in `MidiMapping`- Type, separater
  Recon-Fixture pro Pfad (MM-B + MM-C).
