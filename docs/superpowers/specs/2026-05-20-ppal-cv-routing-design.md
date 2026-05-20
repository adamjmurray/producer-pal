# Slice: ppal-cv-routing — CV-Output-Routing (Vocabulary-Erweiterung)

**Datum:** 2026-05-20
**Welle 1 / Eimer A:** Item 1 von 6 (Restposten).
**Kandidat:** Gap §2.6 „External Hardware / CV-Routing" — DC-gekoppelte
Audio-Out-Channels in Live 12 (`AudioOutputRouting`-Block), die heute nicht
im closed vocabulary von `als-routing.ts` stehen.
**Recon-Gate:** **PENDING** — Spekulationsverbot bei < 2 Fixtures. Diese
Spec ist CONDITIONAL: GO-Pfad (Vocabulary-Erweiterung) ODER STOP-Pfad
(Interface-Display-Name-Leak im `.als` zerbricht closed vocabulary →
dokumentierte Grenze analog Crossfade).

## 1. Problem & Nutzen

Programmatisches Setzen des Audio-Out-Routings einer Spur auf einen
einzelnen Mono-CV-Channel (DC-gekoppelter Audio-Output, von Live als
regulärer `<AudioOutputRouting>`-Block kodiert — Hypothese aus
kb-research-Briefing; muss byte-belegt werden) ohne Live-GUI. Use-Case:
External-Modular-Setup vorbereiten, ohne Live öffnen zu müssen.

## 2. Recon-Befund

**Ausgangsbild aus kb-research (NICHT byte-belegt, nur Hypothese):**

- CV-Outs sind kein separater XML-Knoten, sondern reguläre
  `<AudioOutputRouting>`-Blöcke mit `target="AudioOut/External/M{N}"`-
  Strings (Mono pro Channel, analog `ext-mono` Eintrag heute).
- Pack-Voraussetzung: CV-Tools (Live 12 Suite). Hardware: DC-gekoppeltes
  Audio-Interface (ES-8, MOTU UltraLite, Expert Sleepers) ODER reine
  Software-Channel-Aktivierung in Live-Audio-Prefs (CV-fähig ≠ pflicht
  für Tag-Schreibung — das `.als` schreibt das Routing-Tag auch ohne
  echten DC-Output).
- CV-In ist **kein Track-Routing**, sondern Device-Parameter (CV-Trigger-
  In-Max-Device-Dropdown) → **OUT of scope** dieses Slices.

**Recon-Plan (3 minimale Fixtures, 1 optionale Kontroll-Fixture):**

| Fixture | Beschreibung | Zweck |
|---|---|---|
| `A-main.als` | leeres Set, 1 Audio-Track, AudioOut=Main | Baseline (entspricht heutigem `audio-out.main`) |
| `B-mono-out-3.als` | identisch, AudioOut=Mono Out 3 (Ext. Out 3) | erstes neues Vocabulary-Tripel |
| `C-mono-out-4.als` | identisch, AudioOut=Mono Out 4 (Ext. Out 4) | zweites Tripel — bestätigt Index-Schema |
| `D-other-device-mono-out-3.als` (opt.) | wie B, anderes Audio-Output-Device aktiv | testet Interface-Display-Name-Leak |

**GO-Bedingung (Vocabulary-Erweiterung):**

- Diff A→B und A→C zeigt nur `<AudioOutputRouting>`-Block-Änderung an
  Target/Upper/Lower (kein neuer Tag, kein Index-bezogenes Quer-Reference
  woanders im XML).
- Target-Strings sind interface-unabhängig (z.B. `AudioOut/External/M2`
  + `M3` — kein Interface-Display-Name im Target).
- UpperDisplayString interface-unabhängig (z.B. `Ext. Out` in beiden
  Fixtures); LowerDisplayString = Channel-Nummer (`3` bzw `4`).
- IF D vorhanden: B und D haben **identische** Routing-Tripel
  (Display-Name leakt NICHT).

**STOP-Bedingung (dokumentierte Grenze):**

- Falls UpperDisplayString den Interface-Device-Namen enthält
  (`"ES-8 Out"`, `"Built-in Output"` o.ä.) → kein interface-unabhängiges
  closed vocabulary möglich. STOP-Verdict analog Crossfade Coupled-
  Geometry: dokumentierte Grenze, Live's Display-String ist dynamisch
  System-Audio-Setup-abhängig.
- Falls CV-Tools-Devices zusätzliche Routing-Eintragungen erzeugen, die
  nicht im `<AudioOutputRouting>`-Block leben (z.B. eigene
  `<CvOutputRouting>`-Tags): Vocabulary-Erweiterung allein reicht nicht,
  Slice eskaliert auf Schema-Erweiterung — dann nicht "niedrig" und
  Re-Scope-Entscheidung mit User.

## 3. Scope (CONDITIONAL — abhängig von Recon-Befund)

**GO-Variante (IN — Vocabulary-Erweiterung im Bestand):**

- `src/automation/als-routing.ts`: in `ROUTING_TARGETS["audio-out"]`
  einen oder mehrere neue Keys ergänzen mit byte-belegten Target/Upper/
  Lower-Strings aus Fixtures B + C (mindestens 2 Keys, damit das Index-
  Schema bewiesen ist). Vorschlags-Naming (FINAL pending Recon):
  - `ext-mono-3`, `ext-mono-4` (falls Lives Display "Ext. Out 3" / "4")
  - ODER `cv-mono-3`, `cv-mono-4` (falls Display "CV Out 3" / "4")
  - Naming MUSS Lives Display-String spiegeln (User-mental-model).
- CLI `track-routing set --kind audio-out --target <new-key>` funktioniert
  ohne weiteren Code-Add (existierender Dispatch).
- Falls Recon zeigt es gibt einen mono-`audio-in`-Symmetrie-Eintrag
  (analog zu ext-mono), optional dort spiegeln.

**STOP-Variante (IN — STOP-Verdict-Dokument):**

- `docs/superpowers/specs/2026-05-20-ppal-cv-routing-STOP-verdict.md`
  schreiben (analog `…crossfade-expert-STOP-verdict.md`): Recon-Bytes
  zeigen Interface-Display-Name-Leak → kein byte-treues closed vocabulary
  möglich → dokumentierte Grenze, Item 1/6 als STOP entschieden, Welle 1
  zählt es ab.
- Kein Code-Add; nur Dokument + Memory-Eintrag.

**OUT (begründet, unabhängig von Recon):**

- CV-In (Device-Parameter, nicht Track-Routing).
- CV-Tools-Device-Parameter (eigene Device-Tree-Logik, separater Slice).
- Stereo-CV-Paare (Live behandelt CV pro Mono-Channel; falls Recon doch
  Stereo-CV zeigt, separater Folge-Slice).
- Interface-Display-Name-Mapping (System-Audio-Setup-spezifisch =
  hardware-leakage).

## 4. Architektur

**GO-Pfad — KEIN neuer Subcommand, KEIN neues Modul:**

- Einzige Änderung: `ROUTING_TARGETS["audio-out"]` bekommt 2-4 neue
  Einträge. `KIND_TO_TAG`, `patchTrackRouting`, `getTrackRouting`,
  `readRoutingBlock`, `replaceRoutingTriple`, der CLI-Subcommand
  `track-routing` — alle UNVERÄNDERT.
- Folder-Limit unverändert (kein neues File).
- Test-File: bestehendes `als-routing.test.ts` (oder dort wo
  Vocabulary-Tests leben) bekommt N neue assertion-rows pro neuem Key
  (Roundtrip + Konsistenz-Throw bei kind-mismatch).

**STOP-Pfad:**

- Nur Doku: `…-STOP-verdict.md` + Memory + NEXT-GOAL-Update.

## 5. Akzeptanzkriterien / Gate

**GO-Pfad:**

- `npm run check` Exit 0; Branch-Coverage ≥ 95.53 %.
- `npx tsc` strict-null clean; jscpd src ≤ 0.25.
- Byte-Verify: für jeden neuen Key:
  1. CLI `track-routing set --kind audio-out --target <key>` auf Baseline
     `A-main.als` erzeugt byte-identische `.als` zur Fixture B/C/...
     (Voll-XML-Diff leer außer Routing-Block).
  2. CLI `track-routing get` liest das Tripel woertlich zurück.
- Codex-Stage-2 (`codex:rescue`) APPROVED.

**STOP-Pfad:**

- STOP-Verdict-Dokument mit Byte-Evidenz aus den Fixtures (zitierte
  Interface-Strings, Diff-Auszug).
- Memory `ppal-cv-routing-stop-verdict.md` geschrieben.

## 6. Risiken (Premortem im Folge-Dokument)

Hauptrisiko: **Recon-Befund ist ambivalent** (Fixtures zeigen weder
klares closed vocabulary noch klaren Leak — z.B. Live schreibt das
Routing nicht, weil Channel nicht "verfügbar" markiert ist). Dann ist
weder GO noch STOP entschieden, und der Slice braucht zusätzliche
Fixtures. Mitigation: Pre-Recon-Spec dokumentiert die ambivalent-
Klausel → bei Bedarf zusätzliche Fixture-Anforderung an User
(Spekulationsverbot bleibt scharf).

Weitere Risiken im `…-plan.md` + Premortem-Skill ausgearbeitet, sobald
Fixtures vorliegen.

## 7. Branch + PR

- Branch: `feat/ppal-cv-routing` von echtem `origin/main` (`git ls-
  remote` + reset --hard + rev-parse-Verify).
- PR-Titel: "ppal-cv-routing: CV-Out Vocabulary-Erweiterung in
  als-routing.ts" (GO) ODER "ppal-cv-routing: STOP-Verdict (Item 1/6
  als dokumentierte Grenze)" (STOP).
- Merge: User-Wort oder bei Mandat autonom.
