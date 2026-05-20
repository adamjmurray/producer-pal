# Design: ppal-playback Locator-Sprung-Navigation (Welle 2 Slice 2)

**Datum:** 2026-05-20 **Status:** GO (LOM hart belegt via Binary-Scan +
MIDI-Remote-Scripts) **Welle:** 2 **Tool:** `ppal-playback`

## Ziel

Erweiterung des MCP-Tools `ppal-playback` um drei neue Transport-Aktionen fuer
Locator-Navigation entlang der Arrangement-Timeline:

| Action              | LOM-Bindung                | Funktion                                                               |
| ------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `jump-to-next-cue`  | `Song.jump_to_next_cue()`  | Play-Head auf naechsten Locator nach aktueller Position                |
| `jump-to-prev-cue`  | `Song.jump_to_prev_cue()`  | Play-Head auf vorherigen Locator vor aktueller Position                |
| `set-or-delete-cue` | `Song.set_or_delete_cue()` | Toggle: Locator an Play-Head erstellen oder loeschen wenn exakt darauf |

Use-Case: live-performance Workflow — Producer markiert vorher Locator-Punkte
und navigiert per Hotkey/MCP-Call zwischen Song-Sections, oder setzt spontane
Marker waehrend des Recordings.

## Recon (Welle-2-Pattern)

LOM-Properties belegt aus drei Quellen:

1. **Ableton-Live-12-Binary-String-Scan**: `jump_to_next_cue`,
   `jump_to_prev_cue`, `set_or_delete_cue`, `can_jump_to_next_cue`,
   `can_jump_to_prev_cue` definitiv vorhanden.
2. **MIDI-Remote-Scripts** (Push 1/2/3, Tranzport):
   `add_can_jump_to_next_cue_listener`, `add_can_jump_to_prev_cue_listener`,
   `set_or_delete_cue_button`, `jump_to_next_cue`, `jump_to_prev_cue` aktiv
   genutzt. Diese Properties sind also Industry-Standard fuer Live-Controller.
3. **kb-research-Agent**: Cue-Volume-Familie KB-belegt, `cue_points` als
   Locator-Collection bestaetigt.

Kein empirischer raw-live-api-Recon erforderlich — Properties sind LOM-Standard.

## API-Design

### Action-Enum-Erweiterung

Bestehender `action`-Enum von `ppal-playback`:

```
play-arrangement
update-arrangement
play-scene
play-session-clips
stop-session-clips
stop-all-session-clips
stop
```

Drei neue kebab-case Actions (folgt bestehender Konvention):

```
jump-to-next-cue
jump-to-prev-cue
set-or-delete-cue
```

**Naming-Begruendung:**

- 1:1-Mapping zu LOM-Funktionsnamen (snake_case → kebab-case).
- Symmetrisch (`jump-to-next-cue` / `jump-to-prev-cue`).
- `set-or-delete-cue` reflektiert das Toggle-Verhalten der Live-Funktion
  explizit im Namen (User-Verstaendlichkeit).
- Kein Sammel-Action mit Sub-Param — folgt bestehendem flachen Discriminator-
  Pattern aller anderen `ppal-playback`-Actions.

### Description-Erweiterung

`action`-Description bekommt drei neue Zeilen:

```
jump-to-next-cue: play head -> next locator
jump-to-prev-cue: play head -> previous locator
set-or-delete-cue: toggle locator at play head
```

### Keine neuen Parameter

Alle drei Actions sind no-arg. Keine Erweiterung des `inputSchema` jenseits des
`action`-Enums. Keine `excludeParams`-Aenderung in `smallModelModeConfig`
notwendig (Actions sind im default-Mode wie alle anderen).

## Edge-Cases + Error-Handling

### `jump-to-next-cue` / `jump-to-prev-cue`

Pre-Check via `liveSet.getProperty("can_jump_to_next_cue")` (bzw. `_prev_`).

- `can_jump_to_*_cue === 0`: kein Locator in entsprechender Richtung →
  `throw new Error("playback failed: no next/previous locator available")`.

Begruendung throw (nicht warn-skip): `ppal-playback` ist **Control-Tool**, kein
Update-Tool. Bestehende Errors in `playback.ts` (z.B. `"action is required"`,
`"ids and slots are mutually exclusive"`, `unknown action`) nutzen alle
`throw new Error()`. CLAUDE.md warn-skip-Regel gilt explizit nur fuer update-\*
Tools.

### `set-or-delete-cue`

Kein Pre-Check noetig. Live-Funktion entscheidet selbst (Toggle: PlayHead auf
bestehendem Locator → delete; sonst create). Bei leerem Set: Live erstellt
ersten Locator. Direkter `liveSet.call("set_or_delete_cue")`.

### Loop/Start-Time/Other-Params

Bei locator-nav-Actions sind `startTime`, `startLocator`, `loop*`, `ids`,
`slots`, `sceneIndex` semantisch irrelevant. Bestehender `ppal-playback`-Code
resolved diese Params unabhaengig von der Action am Anfang von `playback()` —
kein Konflikt. Wir validieren sie nicht extra; falls User sie zusaetzlich
uebergibt, werden sie als Live-API- Set-Operations frueh im Pipeline-Flow
appliziert (z.B. `loop` setzen) und dann erst das Action-Switch erreicht.
Konsistent mit existing `play-arrangement`+`loop`-Kombination.

### Result-Objekt

Bestehende `PlaybackResult`-Struktur reicht:

```typescript
{ playing: boolean; currentTime: string; arrangementLoop?: {start,end} }
```

`currentTime` reflektiert nach `jump-to-*-cue` die neue Position (automatisch
via `liveSet.getProperty("current_song_time")` nach Action-Dispatch).

Nach `set-or-delete-cue` aendert sich `currentTime` nicht (PlayHead bleibt),
aber `cue_points` aendert sich. Wir geben nur die existing Result-Felder zurueck
— `cue_points`-Listing ist Domain von `ppal-read-live-set --include locators`,
nicht von playback.

## Implementierungs-Skizze

In `src/tools/control/playback.ts` `handlePlaybackAction`-Switch erweitern um
drei Cases:

```typescript
case "jump-to-next-cue":
  if (!liveSet.getProperty("can_jump_to_next_cue")) {
    throw new Error("playback failed: no next locator available");
  }
  liveSet.call("jump_to_next_cue");
  return state;

case "jump-to-prev-cue":
  if (!liveSet.getProperty("can_jump_to_prev_cue")) {
    throw new Error("playback failed: no previous locator available");
  }
  liveSet.call("jump_to_prev_cue");
  return state;

case "set-or-delete-cue":
  liveSet.call("set_or_delete_cue");
  return state;
```

`PlaybackState` (action-result-Typ) bleibt unveraendert — die drei Actions
veraendern `isPlaying` nicht (Sprung wirkt nur auf `current_song_time`).
Optimistische `currentTimeBeats`-Aktualisierung bei jump-Actions: nach
`liveSet.call(...)` neu lesen via `liveSet.getProperty("current_song_time")`,
damit Result die neue Position widerspiegelt ohne sleep().

## Tests

In `src/tools/control/tests/playback-features.test.ts` neuer describe-Block oder
neue Datei `playback-locator-nav.test.ts` (Konvention: separate Datei wenn 3+
Tests; wir haben 5+).

Test-Faelle (TDD-Reihenfolge):

1. **`jump-to-next-cue` happy path**: `can_jump_to_next_cue = 1` → assert
   `liveSet.call("jump_to_next_cue")` aufgerufen.
2. **`jump-to-next-cue` no-locator**: `can_jump_to_next_cue = 0` → assert
   `throw "no next locator"` + call NICHT aufgerufen.
3. **`jump-to-prev-cue` happy path**: analog 1 spiegelbildlich.
4. **`jump-to-prev-cue` no-locator**: analog 2 spiegelbildlich.
5. **`set-or-delete-cue` always-calls**: ohne pre-check → assert
   `liveSet.call("set_or_delete_cue")` aufgerufen.
6. **`set-or-delete-cue` with non-default state**: optional — sicherstellen dass
   set-or-delete-cue auch bei `is_playing` und/oder bestehenden Locators
   funktioniert (Smoke-Coverage).
7. **`jump-to-next-cue` updates currentTime in result**: assert dass nach Sprung
   die `current_song_time` neu gelesen + im Result reflektiert.

Mock-Setup: existing `setupPlaybackLiveSet`/`setupDefaultTimeSignature` helpers,
plus `liveSet.getProperty` returns fuer
`can_jump_to_next_cue`/`can_jump_to_prev_cue` mocked je Test.

## Coverage-Schaetzung

- Drei neue Cases im switch + drei neue Throw-Pfade = 6 Branches.
- 5-7 neue Tests decken jeden Branch + happy paths.
- Branch-Coverage-Beitrag positiv (alle Pfade beruehrt).
- jscpd src/0.25: drei case-Bodies sind 3-4 Zeilen jeweils, sehr aehnlich fuer
  jump-\*-Actions (Pre-Check-Pattern). Falls jscpd zuschlaegt: helper-Funktion
  `tryJumpCue(liveSet, direction)` extrahieren. Erst abwarten ob jscpd echt
  klagt.

## Constraints-Reminder

- arm64-Node v24 PATH-Prefix (`$HOME/.nvm/versions/node/v24.15.0/bin`)
- `npm run check` muss Exit 0
- Branch-Coverage `>= 95.53%`
- jscpd `src/0.25`, `scripts/0.5`
- Plain `git commit` (kein `--no-verify`)
- Gezielte `git add`-Pfadliste
- Branch `feature/welle2-slice2-playback-locator-nav` von echtem `origin/main`
  (d088cbd9 verifiziert)
- Kein Worktree, current branch
- PR-Ziel: `elchuckobar/producer-pal`

## OUT-of-Scope

- **MIDI/Computer-Keyboard-Mapping** der Actions (Slice-2 ist API-only).
- **Listener-Subscriptions** auf `can_jump_to_*_cue` (read-only state-
  reflection im Result reicht, kein Push-Pattern).
- **`cue_points`-Listing oder Reorder** — bereits via `ppal-update-live-set`
  (locator operations) und `ppal-read-live-set` (`--include locators`)
  abgedeckt.
- **`jump-by` (bar-relative jump)**: separate Function in LOM (`jump_by`),
  separater Slice falls gewuenscht.

## Stage-Reviews

Stage 1 (`superpowers:requesting-code-review`) + Stage 2 (`codex:rescue`,
skeptisch gegenueber Report). Welle 1 Codex-Final-Pass hat 5 IMPORTANT Defekte
gefunden — Codex-Stage ist obligatorisch.

## Verify-Gate

Vor Commit + PR: `verify`-Skill (`npm run check` + `npm test` + lint +
typecheck). Bei rotem Gate: kein PR.

## PR

Gegen `elchuckobar/producer-pal` `main`-Branch. Title: "Welle-2-Slice-2:
Locator-Sprung-Navigation (jump-to-next-cue / jump-to-prev-cue /
set-or-delete-cue)". Body referenziert Spec + STOP-Verdict-Sibling +
Codex-Stage-2-Run-ID.
