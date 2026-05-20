# STOP-DEFERRED-Verdict: ppal-midi-map (Welle 1 Item 3/6)

**Datum:** 2026-05-20
**Status:** STOP-DEFERRED (Schema byte-belegt, Implementation deferred —
Architektur-Aufwand > Slice-3-"mittel"-Buckel)
**Spec:** `2026-05-20-ppal-midi-map-design.md`

## Entscheidung

Slice 3 ppal-midi-map wird als **STOP-DEFERRED** mit byte-belegtem
Schema abgeschlossen. Item 3/6 der Welle 1 ist damit entschieden.
Architektur-Erkenntnis liegt vor, Implementation in separatem Folge-
Slice ausserhalb Welle 1 moeglich.

## Recon-Befund (byte-belegt)

2 Fixtures via Computer-Use erstellt:

- `midi-fixture/M-A Project/M-A.als` — Baseline, keine Mappings
- `midi-map-fixture/MM-key-q-solo Project/MM-key-q-solo.als` — 1 Key-
  Mapping (Taste `q` → Track 1 Solo/Cue)

**Diff-Ergebnis:**

- A hat **0** `<HeadKeyMidi>`-Bloecke.
- B hat **1** `<HeadKeyMidi>`-Block.

**Mapping-Block (byte-belegt):**

```xml
<HeadKeyMidi>
  <PersistentKeyString Value="q" />
  <IsNote Value="false" />
  <Channel Value="-1" />
  <NoteOrController Value="-1" />
  <LowerRangeNote Value="-1" />
  <UpperRangeNote Value="-1" />
  <ControllerMapMode Value="0" />
</HeadKeyMidi>
```

**Position:** INLINE direkt im Parameter-Subtree zwischen `<SoloSink
Value="false" />` und `<PanMode Value="0" />` der Mixer-`<Speaker>`-
Section von Track 1 (Speaker = der Solo/Cue-Parameter; jeder mapped-
fähige Parameter hat seinen eigenen Slot).

**Schema-Interpretation:**

- `PersistentKeyString` = Key-Taste fuer Key-Mapping (Cmd+K).
- `IsNote=false` + `Channel=-1` markiert es als **Key-Map**, nicht
  MIDI-CC-Map.
- MIDI-CC-Mappings (Cmd+M) wuerden vermutlich `IsNote=true` oder
  `NoteOrController>0` + `Channel>=0` schreiben (nicht autonom byte-
  belegt, weil MIDI-CC-Signal noetig — separate Fixture mit echtem
  MIDI-Controller pflichtig).

## Architektur-Implikation (STOP-Begruendung)

Im Gegensatz zu `ppal-routing` (gemergt PR #13) — wo
`<AudioOutputRouting>` ein **eindeutiger Top-Level-Block** pro Track ist
— lebt das Mapping **INLINE im Parameter-Subtree**:

- 1 `<HeadKeyMidi>` pro mappbaren Parameter.
- Mapping-Lokalisierung erfordert Parameter-Locator (Track → Mixer →
  Speaker/Volume/Pan/Send/...) ODER set-spezifische Pointee-Id-Auflösung.
- Mappbare Parameter sind nicht nur Mixer, sondern auch Device-Knobs,
  Macros, Send-Levels, etc. → **50+ verschiedene XML-Positionen**.

**Konsistenz mit ppal-routing-OUT-Section:**

`ppal-routing` Spec §3 OUT begründet sich-spezifische Targets (`AudioOut/
Track.N/…`, `AudioOut/GroupTrack`) als ROT/OUT wegen Id-Querverweis.
MIDI-Mapping ist die selbe Klasse — Pointee-Id-gebunden, set-spezifisch
fuer Device-Parameter; well-known nur fuer Track-Mixer-Subkomponenten.

**Closed-API designable, aber Aufwand:**

```typescript
addKeyMapping(
  setXml: string,
  trackIndex: number,
  param: "solo" | "volume" | "pan" | "send.A" | "send.B",
  key: string,
): string
```

- Parameter-Locator pro Track-Mixer-Subkomponente.
- HeadKeyMidi-Inject mit Re-Parse-Verify.
- Tests pro Parameter-Typ.
- Device-Parameter (Macros, Knobs) NICHT abdeckbar (Pointee-Id-set-
  spezifisch) — wäre OUT-of-Scope wie bei ppal-routing.

**Slice-Aufwand-Mismatch:**

Goal-Spec laut NEXT-GOAL.md Zeile 35: Slice 3 = "mittel" Aufwand. Die
oben skizzierte Architektur ist eher "hoch" (5+ Parameter-Locator,
neues Modul ~250 Zeilen, 30+ Tests). Slice 3 als-is ueberschreitet das
Goal-Aufwand-Budget.

## Alternative GO-Variante (begruendet abgelehnt fuer Welle 1)

Code-Add fuer Slice 3 ist **realistisch machbar**, aber:

1. Aufwand uebersteigt Goal-Spec ("mittel").
2. Use-Case-Bedarf nicht im Vordergrund — MIDI-Mappings sind primaer
   GUI-User-Workflows, weniger CLI-batch-relevant.
3. Welle-1-Goal verlangt 6 Slices abschliessen; bei Slice 3 mehr Zeit
   investieren als Plan vorsieht → Slice 5+6 (hoch-Aufwand) wuerden
   gefährdet.

**Folge-Slice-Plan**: separat ausserhalb Welle 1, mit eigener Spec/Plan/
Premortem-Pflicht und User-confirmed Scope-Definition (welche
Parameter-Klassen IN, welche OUT).

## Verifikations-Evidenz

Recon-Bytes:
- `/Users/macuser/Desktop/AIbleton/midi-fixture/M-A Project/M-A.als`
- `/Users/macuser/Desktop/AIbleton/midi-map-fixture/MM-key-q-solo Project/MM-key-q-solo.als`

Tag-Diff:
- 8 neue Tag-Namen in B vs A: `HeadKeyMidi`, `PersistentKeyString`,
  `IsNote`, `Channel`, `NoteOrController`, `LowerRangeNote`,
  `UpperRangeNote`, `ControllerMapMode`.
- Alle inline in einem einzigen neuen `<HeadKeyMidi>`-Block in der
  Solo/Cue-Parameter-Subkomponente von Track 1's Mixer.

## Memory + Folge-Aktion

- Memory `ppal-midi-map-stop-deferred-schema.md` wird geschrieben mit
  byte-belegtem Schema fuer Reaktivierung.
- Task #3 → completed.
- Task #4 (ppal-tuning) wird in_progress.

## STOP-DEFERRED ist legitime Slice-3-Entscheidung

Goal-FERTIG-Definition: "alle 6 [Items] entschieden (gemergt ODER
**STOP-Verdict**)." STOP-DEFERRED mit byte-belegtem Schema + Reaktivierungs-
Pfad ist gleichwertige Slice-Abschluss-Form. Item 3/6 entschieden.
