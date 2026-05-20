# Design + Plan: ppal-record-arrangement Runbook (Welle 3 Slice 2)

**Datum:** 2026-05-20 **Status:** GO (Welle-3-Runbook-Pattern aus Slice 1
etabliert) **Welle:** 3 (Computer-Use-Bridge, Eimer C) **Tool:** neues
`ppal-record-arrangement` **Branch:** `feature/welle3-slice2-recording-bridge`
von echtem origin/main c0b887a0

## Ziel

Zweites Runbook-Tool nach Slice 1. Faehrt Ableton Lives Arrangement-Record-
Workflow ueber computer-use: Setup (Arrangement-View) → Record-Start → optionale
Dauer → Stop → optional Save-Set.

Komposition mit Welle-2-Locator-Nav: der Aufrufer ruft erst
`ppal-playback jump-to-prev-cue` o.ae. um Insert-Marker an die richtige Stelle
zu setzen, dann `ppal-record-arrangement` um Recording-Window zu fahren.

## Recon-Anker (aus Slice-1-Recon-Pass + Live-Standard-Shortcuts)

| Element               | Position / Hotkey       | Notiz                         |
| --------------------- | ----------------------- | ----------------------------- |
| Session ↔ Arrangement | `Tab`                   | locale-unabhaengig            |
| Play / Stop Transport | `space`                 | toggelt; Stop = nochmal space |
| Record-Button Klick   | (621, 63) Transport-Bar | rot wenn aktiv                |
| Home (Insert-Marker)  | `home`                  | setzt Insert auf 1.1.1        |
| Save Set              | `cmd+s`                 | first-time fragt nach Pfad    |
| Save Set As           | `cmd+shift+s`           | immer Save-Dialog             |

**Wichtig:** Live's F9 wuerde Session-Record sein, nicht Arrangement-Record.
Dieses Slice nutzt deshalb explizit **Pixel-Click auf den Record-Button**
(deterministisch, sichtbar) + **Spacebar fuer Transport-Toggle**.

## Schema

```ts
{
  durationSeconds: z.coerce.number().min(0.1).optional(),    // default: Caller stoppt selbst
  view: z.enum(["arrangement", "session"]).optional(),       // ensure right view, default 'arrangement'
  homeBeforeRecord: z.boolean().optional(),                  // press Home first
  saveAfter: z.enum(["none", "save", "save-as"]).optional(), // default 'none'
  savePath: z.string().optional(),                           // required if saveAfter='save-as'
  abletonLocale: z.enum(["de", "en", "unknown"]).optional(),
}
```

## Output (gleiche Form wie Slice 1)

`{ steps, failModes, verify, meta }` mit `verify` jetzt:

- `transportShouldBeStopped: true`
- optional `setDirty: false` wenn `saveAfter !== "none"`

## Fail-Modes

1. Kein armed Track → Recording laeuft, schreibt aber keine neuen Clips (Detect:
   empty arrangement; Recovery: rufe vorher `ppal-update-track { arm: true }`)
2. Click auf Record-Button verfehlt (Pixel-Drift) → Detect: Screenshot zeigt
   Record-Lamp grau; Recovery: erneut klicken
3. Save-Dialog kommt obwohl `saveAfter='save'` (erstes Save) → Recovery: Caller
   faellt auf save-as zurueck
4. Recording laeuft weiter nach Stop → Detect: Record-Lamp noch rot; Recovery:
   zweites Spacebar oder erneut Record-Button-Klick
5. macOS-Lokalisierung verschiebt Pixel-Anker → Recovery: locale-Hint setzen
6. `savePath` fehlt bei `save-as` → Tool wirft Schema-Validation
7. Live ist noch im Session-View → `view='arrangement'`-Schritt schickt Tab
8. Producer-Pal-Watchdog respawned Live nach Save → Recovery aus Playbook §6

## Recipe (Default-Flow)

1. (wenn `view='arrangement'`) `key Tab`
2. (wenn `homeBeforeRecord`) `key home`
3. `left_click Record-Button (621, 63)`
4. `wait 0.15` settle
5. `screenshot` Record-Started-Beleg
6. (wenn `durationSeconds` gesetzt) `wait durationSeconds`
7. `key space` Stop
8. `wait 0.2` settle
9. (wenn `saveAfter='save'`) `key cmd+s`
10. (wenn `saveAfter='save-as'`) `key cmd+shift+s` + Save-Dialog-Pattern (analog
    Slice 1 Save-As)
11. `screenshot` final state

## Tests

10+ Tests:

1. minimaler Flow (keine Optionen): nur Click + Space-Stop + Final-Screenshot
2. `view='arrangement'`: Tab als erster Step
3. `view='session'`: kein Tab
4. `homeBeforeRecord`: Home-Key
5. `durationSeconds=2`: wait-Step mit 2.0 s
6. `saveAfter='save'`: cmd+s
7. `saveAfter='save-as'` ohne savePath: Schema-Validation-Fail (notes)
8. `saveAfter='save-as'` mit savePath: cmd+shift+s + Save-Dialog
9. failModes immer mindestens 8 Eintraege
10. meta.tool/version/abletonLocale konsistent
11. Step-Reihenfolge: Click Record VOR Stop, Stop VOR Save

## Architektur-Pattern (von Slice 1 uebernommen)

- `src/tools/runbook/record-arrangement.def.ts`
- `src/tools/runbook/record-arrangement.ts` (pure)
- `src/tools/runbook/helpers/build-record-steps.ts` (eigene Pixel-Anker-
  Konstanten, Reuse von Slice-1 wo passend)
- Reuse `splitDestPath` aus Slice 1 wenn save-as
- Tool-Registrierung an create-mcp-server + live-api-adapter + tests/create-
  express-app + skills/standard

## Premortem

| Risiko                                      | Mitigation                              |
| ------------------------------------------- | --------------------------------------- |
| Record-Button-Pixel verschoben in Live 12.x | Locale-agnostic, aber UI-Update kann es |
|                                             | drueckhaft brechen → failMode 2         |
| Caller vergisst Track-Arming                | failMode 1 + Skills-Doku                |
| save-as ohne Pfad → leerer Dialog           | Schema-Validation `z.refine` oder       |
|                                             | console.warn + Schritte weglassen       |
| jscpd zwischen Slice 1+2 Save-Helper        | `splitDestPath` aus Slice-1-Helpers     |
|                                             | importieren                             |

## Out-of-Scope

- Track-Arming (existiert als `ppal-update-track arm: true`)
- Punch-In/Punch-Out (Eimer A `.als`-Region)
- Take-Lanes (Welle 1 STOP-Verdict)
- Capture (Retrospective Capture braucht Live-Engine)
