# Plan: ppal-playback Locator-Sprung-Navigation (Welle 2 Slice 2)

**Datum:** 2026-05-20 **Spec:**
`docs/superpowers/specs/2026-05-20-ppal-playback-locator-nav-design.md`
**Branch:** `feature/welle2-slice2-playback-locator-nav` (von `origin/main`
d088cbd9) **Status:** ready-for-implementation

## Touchpoints

| Datei                                                  | Aenderung                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/tools/control/playback.def.ts`                    | `action`-Enum + Description um 3 Eintraege erweitern                            |
| `src/tools/control/playback.ts`                        | `handlePlaybackAction`-Switch um 3 cases, currentTime-Re-Read fuer jump-Actions |
| `src/tools/control/tests/playback-locator-nav.test.ts` | NEU: 7 Tests (3 happy + 2 throw + 1 set-or-delete + 1 currentTime-update)       |

Keine neuen Helper-Files (Slice ist klein). Refactor zu Helper nur falls jscpd
nach Implementation klagt (Task 6 Fallback).

## Aufgaben (TDD-Reihenfolge)

### Task 1 — Schema-Erweiterung (`playback.def.ts`)

In `inputSchema.action`-Enum-Block die drei neuen Werte einfuegen:

```typescript
.enum([
  "play-arrangement",
  "update-arrangement",
  "play-scene",
  "play-session-clips",
  "stop-session-clips",
  "stop-all-session-clips",
  "stop",
  "jump-to-next-cue",
  "jump-to-prev-cue",
  "set-or-delete-cue",
])
```

Description um 3 Zeilen erweitern:

```
jump-to-next-cue: play head -> next locator
jump-to-prev-cue: play head -> previous locator
set-or-delete-cue: toggle locator at play head
```

`smallModelModeConfig` unveraendert (drei neue Actions im default-Mode sichtbar;
sie sind no-arg und semantisch verstaendlich).

**Akzeptanz:** Datei kompiliert, MCP-Tool-Definition zeigt neue Actions.

### Task 2 — Tests schreiben (Red-Phase)

Neue Datei `src/tools/control/tests/playback-locator-nav.test.ts`.

Lizenz-Header nach CLAUDE.md
(`Producer Pal / Copyright (C) 2026 ... / AI assistance: Claude (Anthropic) / SPDX-License-Identifier: GPL-3.0-or-later`).

7 Tests:

1. **`jump-to-next-cue` happy path**: Mock `can_jump_to_next_cue = 1`, call
   `playback({ action: "jump-to-next-cue" })`, assert
   `liveSet.call("jump_to_next_cue")` wurde aufgerufen.
2. **`jump-to-next-cue` no-locator throws**: Mock `can_jump_to_next_cue = 0`,
   assert `playback(...)` wirft `"playback failed: no next locator available"`.
3. **`jump-to-prev-cue` happy path**: spiegelbildlich Test 1.
4. **`jump-to-prev-cue` no-locator throws**: spiegelbildlich Test 2.
5. **`set-or-delete-cue` always-calls**: kein Pre-Check, assert
   `liveSet.call("set_or_delete_cue")` aufgerufen unabhaengig von
   `can_jump_*`-Properties.
6. **`set-or-delete-cue` with is_playing**: smoke-Test, kombiniert
   `is_playing=1` und cue-points-Liste vorhanden — call funktioniert.
7. **`jump-to-next-cue` updates currentTime in result**: nach `call()` wird
   `current_song_time` neu aus Mock gelesen; result.currentTime reflektiert die
   neue Position (Mock liefert verschiedene Werte vor/nach).

Mock-Pattern aus `playback-features.test.ts`:

```typescript
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";
...
liveSet = setupPlaybackLiveSet();
liveSet.getProperty.mockImplementation((prop) => {
  if (prop === "can_jump_to_next_cue") return 1;
  if (prop === "current_song_time") return 16;  // after-jump
  return 0;
});
```

**Akzeptanz:** Alle 7 Tests laufen rot (Switch-Default-Case
`throw "unknown action"` schlaegt zu — erwartete Asserts schlagen fehl).

### Task 3 — Implementation (Green-Phase)

In `src/tools/control/playback.ts` `handlePlaybackAction`-Switch 3 cases vor
`default:`:

```typescript
case "jump-to-next-cue": {
  const canJumpNext = liveSet.getProperty("can_jump_to_next_cue") as number;
  if (!(canJumpNext > 0)) {
    throw new Error("playback failed: no next locator available");
  }
  liveSet.call("jump_to_next_cue");
  return state;
}

case "jump-to-prev-cue": {
  const canJumpPrev = liveSet.getProperty("can_jump_to_prev_cue") as number;
  if (!(canJumpPrev > 0)) {
    throw new Error("playback failed: no previous locator available");
  }
  liveSet.call("jump_to_prev_cue");
  return state;
}

case "set-or-delete-cue":
  liveSet.call("set_or_delete_cue");
  return state;
```

**Type-Coercion-Begruendung:** Live-API gibt Boolean-Properties als 0/1 zurueck
(s. `device-state-helpers.ts:99`
`(liveObject.getProperty("solo") as number) > 0`). Wir folgen demselben Pattern
statt direkter Boolean- Coercion.

**License-Header-Update:** Wenn AI-assistance-Zeile in `playback.ts` noch nicht
Claude listet, anhaengen (CLAUDE.md-Regel zu AI-assistance-Header).

**Akzeptanz:** Tests 1-6 laufen gruen.

### Task 4 — currentTime-Re-Read fuer jump-Actions

Nach den 3 neuen cases ist `state.currentTimeBeats` veraltet (jump hat PlayHead
bewegt). Loesungsoptionen:

**Variante A** — in jedem jump-case `state.currentTimeBeats` aus Live-API neu
lesen:

```typescript
case "jump-to-next-cue": {
  ... existing pre-check + call ...
  return {
    isPlaying: state.isPlaying,
    currentTimeBeats: liveSet.getProperty("current_song_time") as number,
  };
}
```

**Variante B** — in der Haupt-`playback()`-Funktion **nach**
`handlePlaybackAction` einmal `current_song_time` neu lesen wenn action
locator-nav ist:

```typescript
const isLocatorJump =
  action === "jump-to-next-cue" || action === "jump-to-prev-cue";
if (isLocatorJump) {
  playbackState.currentTimeBeats = liveSet.getProperty(
    "current_song_time",
  ) as number;
}
```

**Empfehlung: Variante A** (lokal in den case-Bodies). Kleinere
"action-at-a-distance", Test pro case asserted unabhaengig, jscpd-Risk
akzeptabel weil "current_song_time" eh schon im playback.ts referenziert ist (Z.
153).

`set-or-delete-cue`: KEIN Re-Read (PlayHead aendert sich nicht).

**Akzeptanz:** Test 7 (currentTime-Update) gruen.

### Task 5 — Verify-Gate

```bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run fix          # auto-format + auto-lint
npm run check        # lint + typecheck + format check + tests
```

Erwartete Outputs:

- `npm run check` Exit 0.
- Branch-Coverage >= 95.53% (aktuelle Welle-1-Baseline).
- jscpd-Result: src/ unter 0.25, scripts/ unter 0.5.
- Keine neuen lint-suppressions noetig.

**Bei Coverage-Drop:** `coverage/coverage-summary.txt` lesen, ungetestete Branch
in playback.ts identifizieren, fehlenden Test ergaenzen.

### Task 6 — jscpd-Refactor (Fallback)

Falls jscpd bei `src/0.25` zuschlaegt wegen `jump-to-next-cue` /
`jump-to-prev-cue` Pattern-Duplikat:

```typescript
function handleJumpCue(
  liveSet: LiveAPI,
  direction: "next" | "prev",
  state: PlaybackState,
): PlaybackState {
  const canProp = `can_jump_to_${direction}_cue`;
  const callFn = `jump_to_${direction}_cue`;
  const canJump = liveSet.getProperty(canProp) as number;
  if (!(canJump > 0)) {
    throw new Error(
      `playback failed: no ${direction === "next" ? "next" : "previous"} locator available`,
    );
  }
  liveSet.call(callFn);
  return {
    isPlaying: state.isPlaying,
    currentTimeBeats: liveSet.getProperty("current_song_time") as number,
  };
}
```

und switch-cases auf `return handleJumpCue(liveSet, "next", state)` /
`handleJumpCue(liveSet, "prev", state)` reduzieren.

**Akzeptanz:** jscpd gruen, Tests bleiben gruen.

### Task 7 — Commit

Gezielte git add:

```bash
git add \
  src/tools/control/playback.def.ts \
  src/tools/control/playback.ts \
  src/tools/control/tests/playback-locator-nav.test.ts \
  docs/superpowers/specs/2026-05-20-ppal-playback-locator-nav-design.md \
  docs/superpowers/plans/2026-05-20-ppal-playback-locator-nav.md
```

Commit-Message (plain, kein `--no-verify`):

```
Welle-2-Slice-2: Locator-Sprung-Navigation fuer ppal-playback

Drei neue Actions im ppal-playback action-enum:
- jump-to-next-cue   -> Song.jump_to_next_cue()
- jump-to-prev-cue   -> Song.jump_to_prev_cue()
- set-or-delete-cue  -> Song.set_or_delete_cue()

Pre-Check via Song.can_jump_to_next_cue / can_jump_to_prev_cue
(als number > 0), bei false throw new Error mit klarer Message.
set-or-delete-cue ohne Pre-Check (Live regelt Toggle selbst).

LOM-Belegung byte-belegt aus Welle-2-Recon (Binary-String-Scan +
MIDI-Remote-Scripts).

Spec:   docs/superpowers/specs/2026-05-20-ppal-playback-locator-nav-design.md
Plan:   docs/superpowers/plans/2026-05-20-ppal-playback-locator-nav.md
Tests:  src/tools/control/tests/playback-locator-nav.test.ts (7 Tests)
```

### Task 8 — Reviews + PR

- Stage 1: `superpowers:requesting-code-review` Subagent.
- Stage 2: `codex:rescue` Subagent (skeptisch ggue. Report).
- PR gegen `elchuckobar/producer-pal` `main`.

## Reihenfolge + Abhaengigkeiten

```
T1 (def.ts) ──┐
              ├──> T3 (impl) ──> T4 (currentTime) ──> T5 (verify) ──> T6 (jscpd-fallback) ──> T7 (commit) ──> T8 (PR)
T2 (tests) ──┘
```

T1 + T2 parallel moeglich (verschiedene Dateien). Empfohlen sequenziell: T1 ->
T2 -> T3 -> T4 -> T5 -> T6 (falls) -> T7 -> T8.

## Subagent-Eignung

Ein TDD-Subagent (smart-tdd) kann T1-T6 linear abarbeiten ohne Rueckfragen. Kein
Worktree (CLAUDE.md: bei einzeln-File-Edits current branch). Keine
Parallelisierung sinnvoll.

## Premortem-Analyse (automatisch generiert)

### Risiko 1: Pre-Check-Typ-Annahme bei `can_jump_to_*_cue`

- **Impact:** hoch (silent-error-Klasse: Pre-Check schlaegt fehl oder laesst
  falsch durch).
- **Wahrscheinlichkeit:** mittel.
- **Beschreibung:** Plan annimmt `liveSet.getProperty("can_jump_to_next_cue")`
  liefert `0|1 number` (analog `solo`). Falls Live-API stattdessen echtes
  `true|false`-Boolean liefert, wuerde `as number > 0` zu ueberraschenden
  Coercion-Bugs fuehren (`true > 0` ist TS-Type-Error in strict mode, runtime
  moeglich `true` → `1`, aber `false > 0` ist `false` → vermutlich korrekt).
  Klassisches Schwach-Typ-Loch.
- **Mitigation:**
  1. Robuster Pre-Check: `Boolean(liveSet.getProperty("can_jump_to_next_cue"))`
     statt `as number > 0`. Funktioniert fuer beide moeglichen LOM-Return-Typen
     (`0`/`1`, `true`/`false`).
  2. Einen Test mit `=== false` als Mock-Return ergaenzen (Test 2b) fuer
     Boolean-Variante, falls die Mock-Infrastruktur das erlaubt.
- **Frueh-Indikator:** wenn `npm run typecheck` waehrend T3 ueber `as number`
  waarnt oder Test 2 in einer Variante fehlschlaegt.

### Risiko 2: `current_song_time`-Race nach `liveSet.call(...)`

- **Impact:** mittel (falsche `currentTime` im Result, kein Crash).
- **Wahrscheinlichkeit:** niedrig (Live-API ist nominal synchron in Max V8
  bridge).
- **Beschreibung:** Plan T4 liest `current_song_time` direkt nach
  `liveSet.call("jump_to_next_cue")` neu. Falls Lives interne Funktion asynchron
  dispatcht (Listener-Update spaeter), kann der Re-Read den alten Zeitstempel
  zeigen — Result wuerde nicht-jump reflektieren.
- **Mitigation:**
  1. Bestaetigen via Vergleich mit existierendem Code: `play-arrangement` setzt
     `start_time` und liest nicht zurueck (Welt geht weiter, das ist OK).
     `jump-to-*-cue` hat aber Sprung-Sofort-Erwartung.
  2. Falls in Live-runtime asynchron: dokumentieren als "best-effort optimistic
     update, eventual consistency"-Hinweis im Spec-OUT-of- Scope. Keine
     sleep()-Hacks.
  3. e2e-Test mit echtem Live-Set ist gold-standard, aber nicht Slice-2-Scope
     (e2e:mcp nur auf User-Anfrage laut CLAUDE.md).
- **Frueh-Indikator:** Test 7 schlaegt fehl mit "expected newPosition, received
  oldPosition" → Hinweis auf async-Update.

### Risiko 3: jscpd-Treffer durch jump-cases-Duplikat

- **Impact:** niedrig (Build-Fail bei `npm run check`, einfacher Fix-Pfad).
- **Wahrscheinlichkeit:** mittel.
- **Beschreibung:** `jump-to-next-cue` und `jump-to-prev-cue` cases haben fast
  identisches Pattern (Pre-Check + call). 3 zentrale Zeilen in beiden cases sind
  identisch bis auf den Substring `next`/`prev`. jscpd-Threshold `src/0.25` ist
  streng — kann triggern.
- **Mitigation:**
  1. Task 6 Fallback bereits geplant:
     `handleJumpCue(liveSet, "next"| "prev", state)`-Helper extrahieren.
  2. Frueh-Refactor optional: wenn TDD-Subagent waehrend T3 jscpd proaktiv
     laufen laesst, Helper sofort einfuehren.
- **Frueh-Indikator:** `npm run check` rotes jscpd-Resultat in Task 5.

### Gesamtrisiko

**NIEDRIG.** Slice ist mechanisch klein, alle drei Risiken haben klare
Mitigations und Frueh-Indikatoren. Empfehlung: weiter wie geplant, Mitigation-1
(Boolean-Coercion statt `as number > 0`) **in T3 direkt adopten** statt zu
warten.
