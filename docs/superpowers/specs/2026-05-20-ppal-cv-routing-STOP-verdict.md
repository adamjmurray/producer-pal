# STOP-Verdict: ppal-cv-routing (Welle 1 Item 1/6)

**Datum:** 2026-05-20 **Status:** STOP (dokumentierte Grenze, deferred bis
Hardware-Recon moeglich) **Spec:** `2026-05-20-ppal-cv-routing-design.md`

## Entscheidung

Slice 1 ppal-cv-routing wird als **STOP-DEFERRED** abgeschlossen. Item 1/6 der
Welle 1 ist damit entschieden.

## Begruendung (Recon-Faktenlage)

Recon-Versuch via Computer-Use auf dem aktuellen Test-System (MacBook Pro, macOS
25.4) zeigte:

1. **Verfuegbare Audio-Output-Geraete**: nur
   - MacBook Pro-Lautsprecher (0 In, **2 Out**)
   - ZoomAudioDevice (2 In, **2 Out**)

2. **Output-Channel-Limit**: Beide physischen Geraete haben **2 Channels**.
   Lives Track-Output-Dropdown bietet nur Mono 1, Mono 2 und Stereo 1/2 — alle
   bereits als `ext-mono` (M0) und `ext-stereo` (S0) im closed vocabulary von
   `als-routing.ts` byte-belegt (Stand main d088cbd9). **Kein neuer
   Vocabulary-Eintrag erzeugbar** ohne Hardware mit > 2 Outputs.

3. **Aggregate-Device-Versuch** (Audio-MIDI-Setup → Hauptgerät aus
   Lautsprecher + Zoom = 4 Channels): erstellt, aber Ableton Live 12 listet das
   Hauptgerät NICHT im "Audio-Ausgabegeraet"-Dropdown auf
   (CoreAudio-Geraete-Liste cached zur Live-Startzeit; Live-Restart waere
   noetig). Setup-Aufwand fuer 2 zusaetzliche Channels uebersteigt das im
   Goal-Spec angegebene Slice-1-Niveau "niedrig" (vermutete
   Mini-PR-Erweiterung).

4. **kb-research-Vor-Briefing**: KBs (Audio-NB, Capability-NB, Ableton- NB)
   liefern keinen byte-belegten CV-Eintrag. Hypothesen (CV als Sub-Namespace im
   regulaeren `AudioOutputRouting` mit `AudioOut/External/MX`-Targets) blieben
   **unverifiziert** — Spekulationsverbot bei < 2 byte-belegten Fixtures greift.

## Akzeptierte Grenze (analog Crossfade Coupled-Geometry)

Slice 1 ppal-cv-routing ist nicht "intrinsisch unmoeglich" wie Crossfade (38
Diff-Regions). Die Grenze ist **Setup-spezifisch**: ohne Audio- Hardware mit > 2
Output-Channels (DC-Interface wie ES-8/MOTU UltraLite/ Expert Sleepers ODER
virtuelles Multi-Channel-CoreAudio-Device wie BlackHole/Loopback) ist die
Recon-Fixture-Kampagne nicht autonom auf diesem System durchfuehrbar.

**Aufhebung der Grenze**: sobald ein Output-Geraet mit ≥ 3 Channels in Lives
Audio-Geraet-Liste auftaucht, kann der Slice via Spec + Recon- Diff-Tool
(`scripts/recon-cv-routing-diff.mjs`) reaktiviert werden. Spec + Plan +
Premortem liegen vor
(`docs/superpowers/specs/2026-05-20- ppal-cv-routing-design.md`,
`docs/superpowers/plans/2026-05-20- ppal-cv-routing.md`).

## Verifikations-Evidenz

Audio-MIDI-Setup-Screenshot zeigt die Geraete-Liste:

- MacBook Pro-Lautsprecher (0 In, 2 Out)
- ZoomAudioDevice (2 In, 2 Out)
- rekordbox Aggregate Device (0 In, 0 Out — leer/non-configured)
- Mikrofon-Devices (0 Outputs)

Live Audio-Voreinstellungen-Dropdown listet exakt:

- No Device
- Vom System uebernehmen
- MacBook Pro-Lautsprecher (0 In, 2 Out)
- ZoomAudioDevice (2 In, 2 Out)

Lives Ausgangskonfig fuer MacBook Pro-Lautsprecher zeigt nur Mono 1+2 und Stereo
1/2 als verfuegbare Channels.

## Memory + Folge-Aktion

- Memory `ppal-cv-routing-stop-deferred.md` wird geschrieben mit Querverweis auf
  diese Datei + die Spec.
- Task #1 → completed.
- Task #2 (ppal-ext-instrument-routing) wird in_progress; dieser Slice ist
  **NICHT** Hardware-gekoppelt (IAC Driver ist macOS-Built-in), kann autonom
  durchgezogen werden.

## STOP-Verdict ist legitime Slice-1-Entscheidung

Das Goal `Was wir HEUTE können (Stand main c12bacb5)` FERTIG-Definition lautet:
"alle 6 [Items] entschieden (gemergt ODER **STOP-Verdict**) + Welle 1 komplett
abgehakt + Codex-Stage-2 jedes Slices."

STOP-Verdict ist explizit als gleichwertige Slice-Abschluss-Form gelistet. Item
1/6 ist damit entschieden.
