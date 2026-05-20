# Plan: ppal-render-export Runbook (Welle 3 Slice 1)

**Datum:** 2026-05-20 **Spec:** `specs/2026-05-20-ppal-render-export-design.md`
**Branch:** `feature/welle3-slice1-render-export` (von echtem origin/main
c0b887a0)

## Premortem

| #   | Risiko                                                 | Wahrsch. | Schaden | Mitigation                                                        |
| --- | ------------------------------------------------------ | -------- | ------- | ----------------------------------------------------------------- |
| R1  | Pixel-Anker driften zwischen Live-Builds               | Mittel   | Hoch    | failModes mit Anchor-Drift-Detect; meta.abletonLocale             |
| R2  | Tool ohne Live-API-Call passt nicht ins Tool-Framework | Niedrig  | Mittel  | neue Kategorie `runbook/` mit eigenem Pattern, KEIN connect-Check |
| R3  | Coverage faellt unter 95.53% Baseline                  | Niedrig  | Mittel  | Recipe-Returner ist pure Funktion, sehr testbar                   |
| R4  | jscpd schlaegt zu wenn andere Runbook-Tools folgen     | Mittel   | Niedrig | Step-Builder-Helper extrahieren ab T2 (Slice 2/3 reuse)           |
| R5  | Schema-Validation: bitDepth nicht-PCM-format           | Mittel   | Niedrig | `console.warn` + ignore (AGENTS.md update-tool Pattern)           |
| R6  | Smaller-Model-Mode-Config vergessen                    | Niedrig  | Niedrig | smallModelModeConfig mit excludeParams setzen                     |
| R7  | License-Header (SPDX) vergessen → lint-fail            | Mittel   | Niedrig | Header in Template-Snippet, in jeder neuer File                   |

## Task-Liste (T1–T8)

### T1 — Tool-Kategorie `runbook/` anlegen + Schema

- `src/tools/runbook/` neuer Ordner
- `render-export.def.ts` mit Zod-Schema (siehe Spec)
- License-Header + Tool-Framework-Wrap via
  `defineTool("ppal-render-export", ...)`
- annotations: `readOnlyHint: true, destructiveHint: false` — Tool selbst macht
  nichts, gibt nur Recipe zurueck.
- `smallModelModeConfig.excludeParams: ["dither", "createAnalysisFile", "asLoop"]`

### T2 — Step-Builder-Helper

- `src/tools/runbook/helpers/build-render-steps.ts` (oder
  `runbook-step-helpers.ts`)
- pure Funktionen: `dialogOpenStep()`, `setFileTypeSteps()`,
  `setBitDepthSteps()`, `toggleSteps()`, `saveDialogSteps()`,
  `exportButtonStep()`, `mp3ToggleSteps()`
- Klar fuer Reuse in Slice 2/3 (Recording/M4L)

### T3 — Handler `render-export.ts`

- ruft Helpers, baut `RunbookOutput` zusammen
- generiert `failModes` deterministisch (immer gleich, abhaengig von Optionen)
- erstellt `meta` mit Locale-Default "unknown"
- Edge-Case `mp3` + `bitDepth` → warning + ignore
- `console.warn` benutzen (V8-Max Konsole, lt. AGENTS.md)

### T4 — Tool registrieren

- `src/tools/index.ts` oder wo Tools registriert sind (pruefen)
- export der Tool-Def in MCP-Server-Tool-Map

### T5 — Tests `tests/render-export.test.ts`

- 12+ Tests (siehe Spec §Tests)
- Pure Funktions-Test, kein Live-API-Mock noetig
- Test-Helper `expectStep(steps, idx, action, label?)`

### T6 — Skills-Doku in `connect.ts` ergaenzen

- ein Halbsatz zum neuen `ppal-render-export` im Producer-Pal-Skills-String
- Fokus auf "Recipe-Tool, fuehrt nichts aus — Claude faehrt JSON via
  computer-use".

### T7 — `npm run check` Exit 0

- `npm run fix` zuerst
- dann `npm run check`
- Coverage-Check: Branch ≥ 95.53%
- jscpd src ≤ 0.25

### T8 — Stage-1 + Stage-2 Review

- Stage-1: superpowers:requesting-code-review (Claude-Subagent)
- Stage-2: codex:rescue
- NITs adressieren, MINOR-Fixes in einem Polish-Commit

## Verifikation

```bash
# arm64-Node v24 explizit (AGENTS.md/Memory producer-pal-test-runner-arm64-node)
PATH="$HOME/.local/share/mise/installs/node/24.0.0/bin:$PATH" npm run check
```

## Out-of-Scope

- Smoke-Test E2E gegen echtes Live (siehe Spec §Save-As-Dialog R5)
- Locale-Auto-Erkennung
- Render-Output-Verifikation (Bash-Side)

## Deliverable

- PR `feature/welle3-slice1-render-export` → main
- Memory `ppal-welle3-slice1-render-export-shipped.md`
- ABLETON-COMPUTER-USE-PLAYBOOK.md §10 (Welle-3-Recon) ergaenzt (separater
  AIbleton-Repo-Pfad, nicht Teil des PR)
