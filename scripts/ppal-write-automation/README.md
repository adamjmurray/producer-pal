# `ppal-write-automation` — Offline `.als` Schreib-CLI

Bytebewusste Offline-Schreib-CLI für Ableton-`.als`-Dateien. Schreibt gezielt
einzelne XML-Tags, ohne dass Ableton Live laufen muss (LOM-Lücken- Workaround).
Alle Schreib-Operationen sind byte-treu gegen Live-Capture- Fixtures verifiziert
und durch einen Window-Guard abgesichert, der jede Mutation ausserhalb der
deklarierten Subranges fängt.

## Aufruf

```bash
node scripts/ppal-write-automation/ppal-write-automation.ts <subcommand> <args>
```

Exit-Codes (einheitlich):

- `0` — Erfolg
- `1` — Fehler (CLI-Args, Validierung, Window-Guard, Re-Parse-Verify)
- `2` — Open-Set-Guard (Set offen in Ableton, kein `--force`)

Alle write-Subcommands schreiben standardmässig ein `.bak`-Backup neben das
Ziel-File, vor dem `--force` zwingend erforderlich ist solange das Ziel-Set in
Ableton geöffnet ist.

## Subcommands (Lese-/Schreib-Pfade)

Die Reihenfolge folgt der `DISPATCH`-Map in `ppal-write-automation.ts`.

### Automation-Automation

#### `list` — Automation-Parameter eines Track-Device auflisten

```bash
list --als <path> --track <name> [--device <name>]
```

Liefert ParamId/Name-Paare als JSON; Anker für nachfolgende `write`-Calls.

#### `write` — Automation-Breakpoints in Clip injizieren

```bash
write --als <path> --track <name> --clip <name> --param-id <id> \
      --breakpoints <beat:value,beat:value,...>
```

Schreibt Clip-Envelope-Breakpoints byte-treu.

### Arrangement-Transport

#### `arrangement-loop get|set`

```bash
arrangement-loop get --als <path>
arrangement-loop set --als <path> [--on true|false] [--start <beat>] \
                     [--length <beat>] [--force]
```

Set-global Transport-Loop-Region.

### Clip-Eigenschaften

#### `clip-settings get|set` — generische Clip-Setting-Key-Value-Patches

```bash
clip-settings get --als <path> --track <name> --clip <name>
clip-settings set --als <path> --track <name> --clip <name> \
  --key <k> --value <v> [--key <k2> --value <v2> ...] [--force]
```

Unterstützt LaunchMode/FollowAction/Loop-Felder via geteiltem Set-Pattern.
Mehrere `--key`/`--value`-Paare in einem Call.

#### `clip-flags get|set` — AudioClip Warp/Loop/RAM/Slice-Flags

```bash
clip-flags get|set --als <path> --track <name> --clip <name> \
  [--key <flag> --value <bool>] [--force]
```

#### `clip-scale get|set` — MidiClip ScaleInformation (Root + Name)

```bash
clip-scale get|set --als <path> --track <name> --clip <name> \
  [--root <int>] [--name <str>] [--force]
```

### Fades + Kurven

#### `fades get|set` — Audio-Clip Fade-In/Out Längen + Composite-Curve

```bash
fades get|set --als <path> --track <name> --clip <name> \
  [--key FadeInLength --value <beats>] \
  [--key FadeInCurve --value up|down] \
  [--key FadeOutLength --value <beats>] [--force]
```

#### `fadeout-curve get|set` — FadeOut-Skew/Slope (Slice-4c, IsDefaultFadeOut=false Vorbedingung)

```bash
fadeout-curve get|set --als <path> --track <name> --clip <name> \
  [--value up|down] [--force]
```

### Groove-Pool

#### `groove list|assign|tune|import`

```bash
groove list   --als <path>
groove assign --als <path> --track <name> --clip <name> --groove-id <id>
groove tune   --als <path> --groove-id <id> --key <k> --value <v>
groove import --als <path> --agr <agr-file>
```

`.agr`-Import: GUI-Byte-Treue NICHT garantiert (siehe
`ppal-slice5b-groove-import-shipped`-Memory); Pool-Inhalt funktional korrekt.

### Tempo + Time-Signature

#### `tempo get|set` — Master-Tempo-Automation (Events-Replace)

```bash
tempo get --als <path>
tempo set --als <path> --events <beat=tempo[~],...> [--force]
```

`~` Suffix = gekrümmtes Segment (Tempo-Kurve, siehe Slice-6c).

#### `timesig list|write` — Time-Signature-Marker

```bash
timesig list  --als <path>
timesig write --als <path> --markers <beat=num/den,...> [--force]
```

### Mixer + Routing

#### `mixer-routing crossfade|send-pre` — Track-Mixer-Crossfade-Assign + Send Pre/Post

```bash
mixer-routing crossfade --als <path> --track <name> --value A|center|B [--force]
mixer-routing send-pre  --als <path> --send-index <i> --value true|false [--force]
```

#### `track-group set|fold` — Member-Track-Zuweisung + Group-Fold

```bash
track-group set  --als <path> --track <name> --group-id <id> [--force]
track-group fold --als <path> --group-id <id> --value true|false [--force]
```

#### `routing get|set` — Track-I/O-Routing (well-known Targets)

```bash
routing get --als <path> --track <name>
routing set --als <path> --track <name> --kind audio-in|audio-out|midi-in|midi-out \
            --target <well-known-target> [--force]
```

### Modulation + Warp

#### `modulation write|get` — Clip-Modulation-Envelopes (Macro/Send/EQ)

```bash
modulation get   --als <path> --clip <name>
modulation write --als <path> --clip <name> --target <pointee-id> \
                 --breakpoints <beat:value,...> [--force]
```

#### `warp-marker get|set` — Statische WarpMarkers

```bash
warp-marker get|set --als <path> --track <name> --clip <name> \
  --markers <secTime:beatTime,...> [--force]
```

### Arrangement-Zeit + Take-Lanes

#### `shift-time get|set` — Track-Clips-Arrangement-Shift ab Cut-Punkt

```bash
shift-time get --als <path> --track <name>
shift-time set --als <path> --track <name> --from-beat <p> --delta <d> [--force]
```

Verschiebt nur Clips, deren `startBeat >= --from-beat`.

#### `take-lane --lanes-file` — Take-Lane-Inhalt (Expert-Patch)

```bash
take-lane get  --als <path> --track <name>
take-lane set  --als <path> --track <name> --lanes-file <lanes.json> [--force]
```

Take-Lane-Inhalt ist self-contained track-lokal (siehe
`ppal-takelane-recon-clean`-Memory), `--lanes-file`-JSON ist Expert-Spec.

### Export + Group-Creation

#### `midi-export` — MidiClip → Standard-MIDI-File Type 0

```bash
midi-export --als <path> --clip <name> --out <path.mid>
```

#### `group-create --group-spec-file` — Neue GroupTrack-von-Null (Expert-Patch)

```bash
group-create get --als <path>
group-create set --als <path> --group-spec-file <spec.json> [--force]
```

Expert-Spec (`GroupCreateSpec`): `groupTrackId`, `nextPointeeId`, `returnCount`,
`groupName`, `color`, `memberTrackIds[]`, `insertAfterTrackId?`.
Multi-Fixture-belegte deterministische Regel in 3-Fixture-Kampagne (siehe Memory
`ppal-grouptrack-recon-resolved`).

## Architektur-Querverweis

- Window-Guard: `clip-patch-cli.ts` (`isOnlyWindowChanged` mit
  `ReplacementRange[]`-API) + `shared-cli-helpers.ts`
  (`singleRangeReplacement`).
- Geteilter lean track-scoped Pfad: `lean-track-cli.ts` + `lean-locators.ts`
  (`locateTrackLeanBlock`).
- Subcommand-Dispatch: `ppal-write-automation.ts` DISPATCH-Map.
- Byte-Helper: `src/automation/als-*.ts` pro Domäne (get + patch +
  Soll-Berechnung). Reine Funktionen, keine I/O.

## Wartung

- Bei Hinzufügen eines Subcommands:
  1. `src/automation/als-<feature>.ts` Byte-Helper.
  2. `scripts/ppal-write-automation/ppal-<feature>-helpers.ts` CLI-Wrapper.
  3. DISPATCH-Map-Eintrag + Import in `ppal-write-automation.ts`.
  4. Fehlermeldung in `ppal-write-automation.ts` Subcommand-Liste erweitern.
  5. README in diesem File: Eintrag im passenden Bereich.
  6. `tests/ppal-write-automation-<feature>.test.ts` Unit + Sister-Negativ-Test.

- Vor Commit: `npm run check` (PATH-Prefix arm64-Node-v24).
