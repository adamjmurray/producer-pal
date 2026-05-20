# Design + Plan: ppal-load-m4l-device Runbook (Welle 3 Slice 3)

**Datum:** 2026-05-20 **Status:** GO (Drag-Drop-Pattern aus Playbook §2
etabliert, Browser-Kategorie verifiziert) **Welle:** 3 (Computer-Use-Bridge,
Eimer C) **Tool:** neues `ppal-load-m4l-device` **Branch:**
`feature/welle3-slice3-m4l-loading` von echtem origin/main c0b887a0

## Ziel

Drittes Runbook-Tool. Faehrt das Laden eines Max-for-Live-Devices (.amxd) aus
Lives Browser via Drag-and-Drop auf einen Track. Die Live-API kann nur
**native** Devices per Name instanziieren (`ppal-create-device`) - .amxd's
brauchen den Browser-Workflow, deshalb Eimer C / Computer-Use.

## Recon (live verifiziert 2026-05-20)

- Browser-Kategorie "Max for Live" sichtbar im linken Browser-Bereich
  (Pixel-Anker ca. y=298 fuer das Kategorie-Label)
- Browser zeigt Max Audio Effect / Max Instrument / Max MIDI Effect +
  User-Library-Devices in der gewaehlten Kategorie
- Cmd+F oeffnet das Browser-Suchfeld → tippe Name → erste Treffer-Zeile ist
  drop-bereit
- Drag-Drop-Pattern aus `ABLETON-COMPUTER-USE-PLAYBOOK.md` §2 (Settle-Timing mit
  Down/Wait 0.5-0.6 s/Move/Wait 0.3-0.4 s/Up) ist verifiziert fuer
  Browser→Track-Lane Drops.

## Schema

```ts
{
  deviceName: z.string().min(1),       // exact Name as listed in browser, e.g. "Max Audio Effect"
  category: z.enum(["max-audio-effect", "max-instrument", "max-midi-effect", "user"]),
  dropTarget: z.object({               // explicit pixel because track positions are set-dependent
    x: z.coerce.number().int(),
    y: z.coerce.number().int(),
  }).optional(),
  useArrangementView: z.boolean().optional(),     // default: stay in current view
  abletonLocale: z.enum(["de", "en", "unknown"]).optional(),
}
```

Note: Zod restricts nested objects in tool input schemas (AGENTS.md "primitives
only"). We flatten dropTarget into `dropX` + `dropY` top-level optional params
instead.

## Output

`{ steps, failModes, verify, meta }`

`verify` carries:

- `deviceShouldExist: true` (call `ppal-read-track` afterwards to confirm)
- `expectedDeviceName: string`

## Step-Plan

1. (optional) Tab → Arrangement view if `useArrangementView`
2. `left_click` on Max for Live category in browser (locale-agnostic anchor)
3. `wait 0.3` + screenshot - browser pane settled
4. `key cmd+f` open browser search
5. `type deviceName` filter
6. `wait 0.3` + screenshot - first match should highlight at row anchor
7. `left_mouse_down` at first browser row (set-known anchor or supplied)
8. `wait 0.55` settle drag pickup (mandatory, Playbook §2)
9. `mouse_move` to mid-screen intermediate point (helps drop registration)
10. `mouse_move` to `dropTarget` (caller-supplied or default first-track header)
11. `wait 0.35` settle drop position
12. `left_mouse_up`
13. `wait 0.5` settle drop, give Live time to instantiate
14. `screenshot` device-should-now-exist anchor
15. `key Escape` close any browser search overlay

## Fail-Modes

1. Browser pane closed → `cmd+alt+b` shortcut to toggle (Recovery hint)
2. Category click misses → category labels shift with scroll position (Recovery:
   scroll category list to top first)
3. Drag releases on empty timeline area instead of track → track header pixel
   wrong (Recovery: supply explicit `dropX`/`dropY`)
4. .amxd not found in user library → category mismatch (Recovery: switch
   category, e.g. `user` if it's in User Library)
5. Live shows .amxd compilation modal → wait + dismiss (Recovery: surface to
   user, NEVER auto-dismiss)
6. Macro defaults differ from baseline → out of scope, ppal-update-device for
   runtime macro tweaks after load
7. Drop on wrong track index → `dropX`/`dropY` were aligned to a different track
   lane; rerun with corrected target
8. macOS locale shifts browser pane width → reduces all anchor positions
   (Recovery: locale=unknown, caller re-targets via vision)

## Tests

10+ Tests:

1. Default recipe (no dropTarget): default-anchor first-track sequence
2. With explicit `dropX`/`dropY`: drop coordinate matches input
3. `useArrangementView=true`: Tab as first step
4. `category='max-audio-effect'`: clicks the max-audio-effect entry
5. `category='user'`: switches to user-library category click
6. failModes has 8+ entries
7. meta carries tool/version/locale default
8. Step-order: category-click BEFORE search, search BEFORE drag, drag-up BEFORE
   final screenshot
9. Drag-pattern has down + wait + move + wait + up (Playbook §2 timing)
10. Escape step always emitted at end (closes browser search overlay)
11. deviceName surfaces verbatim in `type` step label

## Pre-Existing Composition

- Caller calls `ppal-load-m4l-device` to load the device
- Caller calls `ppal-read-track {include: ["devices"]}` to confirm load
- Caller calls `ppal-update-device {paramByName}` to set macros/parameters AFTER
  load (native LOM path, post-instantiation)

## Premortem

| Risiko                                                   | Mitigation                         |
| -------------------------------------------------------- | ---------------------------------- |
| Browser pane scrolled away from M4L category             | failMode 2 + caller scroll first   |
| Track positions set-dependent, default-drop hits nothing | dropX/dropY override + failMode 3  |
| User .amxd has same name as built-in                     | category param disambiguates       |
| jscpd with Slice 1/2 drag-drop helpers                   | Stacked branches share helpers via |
|                                                          | rebase post-merge                  |

## Out-of-Scope

- Macro-name introspection after load (native LOM via ppal-read-device)
- Snapshot-comparison of device state (Welle 4+)
- Multi-device chain loading (single-device-at-a-time)
- Plugin loading (.fxp/.aupreset) - separate runbook in Welle 4
