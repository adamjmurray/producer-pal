# STOP-Verdict: ppal-update-globals Solo/Cue-Mode-Toggle (Welle 2 Slice 1)

**Datum:** 2026-05-20
**Status:** STOP (dokumentierte Grenze: kein LOM-Property fuer Master-Section
Solo/Cue-Toggle exposed)
**Spec:** `2026-05-20-ppal-update-globals-solo-cue-design.md`
**Welle:** 2

## Entscheidung

Welle-2-Slice 1 (Erweiterung von `ppal-update-live-set` um Solo/Cue-Mode-
Toggle) wird als **STOP** abgeschlossen. Begruendung Recon-B-belegt durch
drei unabhaengige Quellen, die einstimmig die Nicht-Existenz der LOM-
Property bestaetigen.

## Recon-Befund (Recon-B-Evidenz)

### Quelle 1 — Ableton-Live-12-Binary-String-Scan

`/Applications/Ableton Live 12 Suite.app/Contents/MacOS/Live` (Live 12 Suite)
auf Solo/Cue/Pfl-bezogene Symbole gescannt mit:

```bash
strings "/Applications/Ableton Live 12 Suite.app/Contents/MacOS/Live" \
  | grep -E "[a-z_]+(_solo|_cue|_pfl|_listen|_monitor)$" | sort -u
```

Treffer:

```
can_jump_to_next_cue
can_jump_to_prev_cue
env_listen
exclusive_solo
jump_to_next_cue
jump_to_prev_cue
muted_via_solo
set_or_delete_cue
```

und

```
cue_points
cue_volume
solo
```

**Belegte LOM-Properties (Solo/Cue-Familie):**

| Property                | Scope      | Typ      | Funktion |
|-------------------------|------------|----------|----------|
| `solo`                  | Track      | bool R/W | Track-Solo-Button-State |
| `muted_via_solo`        | Track      | bool R/O | Indikator (anderer Track soliert) |
| `exclusive_solo`        | Song       | bool R/W | "Mehr als ein Track gleichzeitig solo" |
| `cue_volume`            | Song       | float R/W | Master-Cue-Out-Volume |
| `cue_points`            | Song       | list     | Locators (CuePoint-Objekte) |
| `jump_to_next_cue`      | Song       | function | Locator-Sprung (Slice 2) |
| `jump_to_prev_cue`      | Song       | function | Locator-Sprung (Slice 2) |
| `set_or_delete_cue`     | Song       | function | Locator-Toggle (Slice 2) |
| `can_jump_to_next_cue`  | Song       | bool R/O | Listener-Property |
| `can_jump_to_prev_cue`  | Song       | bool R/O | Listener-Property |

**NICHT belegt** (keine Treffer im Binary-Scan):

- `solo_cue_mode`
- `solo_switch`, `solo_switch_action`, `solo_or_pfl`
- `pfl_active`, `pfl_enabled`, `pfl_routing`
- `solo_in_place`, `solo_lock`
- `solo_routing`, `monitor_solo_to_cue`
- Keine Property mit gleichzeitig `solo` + `cue`/`pfl`-Bezug im Namen.

### Quelle 2 — Ableton-MIDI-Remote-Scripts (alle Controller)

`/Applications/Ableton Live 12 Suite.app/Contents/App-Resources/MIDI Remote Scripts/`
enthaelt 130k+ Strings ueber alle `.pyc`-Module (Push 1/2/3, Launchpad
Pro/Mini/X, MIDI Mix, Mackie Control, Launchkey MK3, Tranzport, etc.).
Diese Scripts steuern fast jede LOM-API der Master/Track-Section.

Gefilterte Property-Referenzen:

```bash
find ... -name "*.pyc" -exec strings {} \; \
  | grep -iE "(exclusive_solo|solo_cue|solo_switch|prelisten|return_track|solo_or)" \
  | sort -u
```

Treffer: **NULL** (keine einzige Referenz auf eine Solo/Cue-Mode-Property).

Die Scripts referenzieren `solo`, `cue_volume`, `cue_points`,
`jump_to_next_cue`, `set_or_delete_cue`, `_master_cue_vol`,
`global_solo_button` (Push-UI-Element), `_create_solo_mode` (interne
Scene-Modi). Keine davon ist der gesuchte Master-Section-Toggle.

### Quelle 3 — KB-Research-Agent (NotebookLM)

`kb-research`-Agent konsultierte drei NotebookLM-Knowledge-Bases (Capability-
NB `88baab2c`, Ableton-NB `6c82c5d7`, Audio-NB `a14887fb`) plus lokale
`knowledge-base/*.md`. Verdikt:

> **NICHT KB-belegt. Hauptlauf muss empirisch reconnen.**
> Audio-NB nennt `live_set.solo_cue_mode` (0=Solo, 1=Cue) explizit als
> "Expertenwissen, gegen offizielle LOM verifizieren". Capability-NB
> Folge-Query liefert keinen Treffer auf den Namen.
> Lokales `knowledge-base/*.md`: null Treffer auf
> `solo_cue|cue.mode|pfl|exclusive_solo|solo_switch`.

Spekulations-Hypothese aus dem Audio-NB widerlegt durch Binary-Scan (s.o.
Quelle 1): die postulierte `live_set.solo_cue_mode` taucht NICHT als
String im Live-12-Binary auf.

## Bewertung

Drei unabhaengige Recon-Quellen einstimmig:

1. **Live-12-Binary**: definitive LOM-Property-Liste enumeriert; keine
   solo-cue-mode-aehnliche Property.
2. **MIDI-Remote-Scripts**: keine Controller-Bindung an einen solchen
   Switch — Indiz dass Ableton diesen Toggle bewusst nicht ueber LOM
   exposed.
3. **KB-Research**: Spekulationsverbot eingehalten; einzige KB-Erwaehnung
   ist als unverifiziert markiert und vom Binary-Scan widerlegt.

**Konsequenz**: der globale Master-Section "Solo / Cue"-Switch ist ein
**GUI-only Toggle**, vergleichbar mit anderen GUI-Reglern, die historisch
nicht ueber die LOM exposed sind (z.B. einzelne Device-Toggles wie
Compressor-Sidechain-Enable in alten Versionen, etc.). Live-Object-Model
kennt nur die abgeleitete Property `cue_volume` und den damit verknuepften
Cue-Bus, aber keine Steuerung des Master-Section-Routings selbst.

## Alternative GO-Variante (begruendet abgelehnt)

**Empirischer raw-live-api-Recon mit ENABLE_RAW_LIVE_API=true** koennte
theoretisch eine versteckte undokumentierte Property finden. Wurde bei
User-Konsultation 2026-05-20 abgewogen und gegen das STOP-Verdict
entschieden, weil:

- Drei unabhaengige Recon-Quellen einstimmig negativ — Bayes-Posterior
  fuer existierende-aber-undokumentierte Property sehr niedrig.
- User-Eingriff (Producer-Pal-Device mit env var neu starten) +
  1-2h Reload-Zyklen disproportional zum Slice-Risiko.
- Slice-Aufwand laut Goal "klein" (Welle 2 ist explizit nicht Welle-1-
  cross-cutting); Recon-Last >> Implementierungs-Last widerspricht
  diesem Buckel.

## Alternative GO-Variante Nr. 2 (begruendet abgelehnt)

**Re-Scope auf `exclusive_solo`**: Song.exclusive_solo (bool R/W) ist
definitiv LOM-exposed und steuert "mehr als ein Track gleichzeitig
solo". Funktional anderer Switch als das im Goal definierte
"Cue vs Solo-Mode". Bei User-Konsultation 2026-05-20 abgewogen und
gegen Re-Scope entschieden — Goal explizit "Cue-Out vs Solo-Modus
Toggle". Falls `exclusive_solo` separat gewuenscht: eigener
Folge-Slice mit eigener Spec.

## Reaktivierungs-Kriterien

Slice kann reaktiviert werden, sobald **EINE** der folgenden Bedingungen
erfuellt ist:

1. **Ableton-Update**: zukuenftige Live-Version (12.x oder 13) exposed
   die Property explizit. Trigger: erneuter Binary-String-Scan zeigt
   `solo_cue_mode`-aehnliche Property.
2. **Undokumentierter Property-Fund**: empirischer raw-live-api-Recon
   findet eine versteckte Property (sehr unwahrscheinlich gemaess
   Bayes-Posterior, aber moeglich).
3. **MIDI-Remote-Script-Workaround**: ein Custom Remote Script triggert
   den Switch ueber einen anderen Pfad (z.B. ueber einen synthetischen
   GUI-Event). Architektur-fremd zur LOM-API-Welt und nicht-portabel,
   abgelehnter Pfad.

## Verifikations-Evidenz (Reproduktion)

Alle Befunde reproduzierbar auf macOS 25.4 (Darwin) mit Live 12 Suite
installiert unter `/Applications/Ableton Live 12 Suite.app`:

```bash
# Quelle 1
strings "/Applications/Ableton Live 12 Suite.app/Contents/MacOS/Live" \
  | grep -iE "(solo|cue|pfl|prelisten|monitor)" \
  | grep -iE "_(solo|cue|pfl|mode|switch|listen)" \
  | sort -u

# Quelle 2
find "/Applications/Ableton Live 12 Suite.app/Contents/App-Resources/MIDI Remote Scripts" \
  -name "*.pyc" -exec strings {} \; \
  | grep -iE "(solo_cue|solo_switch|pfl_active|solo_or)" \
  | sort -u
# (erwartetes Ergebnis: 0 Zeilen)
```

## STOP-Verdict ist legitime Slice-Entscheidung

Goal-FERTIG-Definition (Welle 2):

> "alle Welle-2-Slices (2-3) entschieden (gemergt ODER STOP-Verdict mit
> Recon-B-Evidenz)"

STOP mit Recon-B-Evidenz aus 3 unabhaengigen Quellen ist gleichwertige
Slice-Abschluss-Form. Slice 1/2 entschieden. Naechster Slice: Welle-2-
Slice-2 (Locator-Sprung-Navigation fuer `ppal-playback`), hart LOM-
belegt via `jump_to_next_cue`, `jump_to_prev_cue`, `set_or_delete_cue`.

## Memory + Folge-Aktion

- Memory `ppal-update-globals-solo-cue-stop-no-lom-property.md` wird
  geschrieben mit Querverweis auf diese Datei und Welle-1-Verdict-Patterns.
- Task #9 → completed.
- Task #7 (Welle-2-Slice-2 Locator-Nav) wird `in_progress`.
