# Upstream-Sync v1.4.7 → v1.4.10 — Design-Spec

**Datum:** 2026-05-28
**Autor:** Claude Code (Opus 4.7) + User
**Status:** APPROVED (durch User in Brainstorming-Session am 2026-05-28)

## Ziel

Producer-Pal-Fork (lokal `v1.4.7`, 189 eigene Commits über Welle 1–5) auf Upstream `adamjmurray/producer-pal v1.4.10` synchronisieren.

**Erfolgs-Kriterium:** `main`-HEAD enthält
- alle 189 lokalen Commits (Audit-Trail bleibt),
- alle Features aus Upstream-`v1.4.7..v1.4.10` (Voice/Gemini Live, Context Editor, Take-Lanes, Library-Plugins, Devices-Hardening, Security-at-rest),
- `npm run check` exit 0 mit Coverage Stmts ≥ 99.00%.

## Ausgangslage (Stand 2026-05-28)

| Datum | Lokal | Upstream | Divergenz |
|---|---|---|---|
| package.json `version` | `1.4.7` | `1.4.10` | 3 Tags |
| Commits über Gemeinsamer Basis | 189 (origin/main) | 382 (upstream/main) | beidseitig aktiv |
| Diff v1.4.7..v1.4.10 (nur Upstream-Pfad) | – | – | 478 Files, +55956/−6855 |

**Aktuelle Test-Basis:** 6128 Tests passing, Coverage 99.21% Stmts / 95.79% Branches / 100% Funcs / 99.42% Lines. Node v24.15.0 arm64 PFLICHT (siehe `.nvmrc` und `package.json` engines).

## Upstream-Neuerungen (v1.4.7→v1.4.10 Highlights)

- **Voice:** Google Gemini Live als 2. Provider, 30 Stimmen, Auto-Resume, Barge-In, Output-Volume-Slider
- **Context Memory:** Markdown-Editor `/context`-Route, In-App Project-Context-Viewer, Auto-Save-Retry
- **Take-Lanes:** `read-clip` / `read-track` / `read-live-set` / `create-clip` / `duplicate` mit Take-Lane-Targeting
- **Library:** Plugin-DB-Listing, MIDI-Live-Clips, `inFolder`-Filter, `verifyPaths`, Stale-WAL-Tag
- **Devices:** Wavetable/Drift-Hardening, Compressor sidechainChannels, Read-Device Category-Catalogs, Unit-Words in Param-Parsing
- **Security:** API-Keys at-rest verschlüsselt
- **Scripts:** `scan-live-api`-Fix für Array-Results
- **Misc:** Take-Lane-Limit-Dokumentation, Pluggo-Dependency-Marker

## Entscheidungen (Brainstorming-Session)

| Frage | Entscheidung |
|---|---|
| Ziel-Version | **v1.4.10** (nicht v1.4.9) — Sync nur einmal machen |
| Strategie | **Recon-First-Hybrid** — Stufe-1 misst Konflikt-Profil, Gate-A wählt Slice-Anzahl |
| Memory-Mode | **Aggressiv löschen** — stale Memory wird entfernt, MEMORY.md-Index bereinigt |
| Rebase-Variante | **VERBOTEN** (CLAUDE.md: kein force-push auf main, Memory-SHA-Verweise würden stale) |

## Architektur — 5-Stufen-Pipeline

### Stage 0 — Safety Net (5 min)
- `git tag pre-upstream-sync-v1.4.10 main`
- `git push origin pre-upstream-sync-v1.4.10` (Audit-Trail + Rollback-Anker)

### Stage 1 — Recon im Worktree (30 min, fixture-frei)
- `git worktree add ../producer-pal-sync-1.4.10 -b sync-upstream-v1.4.10 main`
- In Worktree: `git merge --no-commit --no-ff upstream/main`
- Konflikt-Cluster messen:
  - `git status | grep "both modified"`
  - `git diff --name-only --diff-filter=U`
  - Cluster nach Domäne gruppieren (read-clip, mixer, devices, package-lock, etc.)
- **Output:** Konflikt-Tabelle pro Domäne mit File-Anzahl

### Stage-1-Decision-Gate — Slice-Anzahl entscheiden
| Konflikt-Profil | Vorgehen |
|---|---|
| <10 Files, keine src/tools/* | **1-Shot-PR** im Recon-Worktree |
| 10–50 Files | **2–3-Slice-Split** nach Domäne |
| >50 oder schwere src/tools/* Konflikte | **4–5-Slice-Split** + Subagent-Delegation pro Cluster |

### Stage 2 — Memory-Bereinigung (30 min, VOR Code-Merge)

**Pflicht-Prüfung pro Eintrag** — semantischer Match gegen Upstream-Code (nicht nur Commit-Subject):

| Memory-Eintrag | Action |
|---|---|
| `ppal-takelane-recon-clean` | LÖSCHEN wenn Upstream `feat(clip): add take lane targeting` + `feat(read-clip): surface 1-based takeLane` vollständig liefert |
| `ppal-grouptrack-recon-resolved` | BEHALTEN (Upstream v1.4.7..v1.4.10 hat nichts dazu) |
| `ppal-crossfade-not-isolable` | BEHALTEN (STOP-Verdict, geometrie-intrinsisch unabhängig) |
| Welle-1–5 Slice-Memories (alle gemergten) | BEHALTEN als Audit-Trail |
| Alle STOP-Verdicts (cv-routing, ext-instrument, midi-map, tuning, insert-delete-time, cut-paste-time, update-globals-solo-cue) | BEHALTEN (Hardware/Asset/Architektur-Limits, nicht Upstream-betroffen) |

**Index-Bereinigung:** `MEMORY.md` reflektiert den gelöschten/aktualisierten Stand. Memory-Bringschuld (Welle-5-Lehre) wird strukturell erfüllt.

### Stage 3 — Konflikt-Resolution + Verify (2–8 h je nach Profil)

**Resolution-Regeln (deterministisch):**

| Konflikt-Bereich | Gewinner |
|---|---|
| `src/tools/read-clip.ts`, `read-track.ts`, `read-live-set.ts` — Take-Lane-Felder | **Upstream** (wir hatten nur Recon-Memory, keine Implementation) |
| `src/tools/create-clip.ts`, `duplicate.ts` — Take-Lane-Targeting | **Upstream** |
| `scripts/scan-live-api.*` — Array-Result-Bug-Fix | **Upstream** (übernehmen, eigene Recon-Logik daraufstacken) |
| Welle-1-Slice-Tools (clip-envelope, fades, groove, tempo, timesig, mixer-routing, mod-targets, warp-markers, midi-export, shift-time, routing, clip-scale, arrangement-loop) | **wir** (Upstream hat dort nichts) |
| `package.json` / `package-lock.json` | **beide mergen**, dann `npm install` + verify |
| `vitest.config.ts` / Coverage-Config | manuell entscheiden, Coverage-Gate (G-B) ist Schiedsrichter |
| Test-Files mit beidseitigen Änderungen | manuell, Test-Run entscheidet |

**Subagent-Delegation (nur bei 4–5-Slice-Split):**
- Pro Konflikt-Cluster ein `general-purpose` oder `code-simplifier`-Agent
- KEIN `isolation: worktree` (wir sind schon im Sync-Worktree, kein Nesting)
- Agent löst NUR seinen Cluster, npm-Check global durch Hauptlauf

**Gates:**
- **G-1:** `PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm run check` → Exit 0, alle 6128+ Tests grün
- **G-2:** Coverage Stmts ≥ 99.00% (aktuell 99.21% — kleine Drop-Toleranz für neue Upstream-Files ohne sofortige Coverage-Adaption)

### Stage 4 — Stage-1 + Codex-Stage-2 Review (1–2 h)

- **Stage-1 Review:** Code-Review-Agent prüft Konflikt-Resolution semantisch (nicht nur Syntax-Merge-OK)
- **Codex Stage-2 Review:** PFLICHT bei diesem Diff-Volumen (Memory `ppal-codex-fixes-shipped`: Codex findet andere Defekt-Klassen als interne Reviews)
- **Gates:**
  - **G-3:** Stage-1 APPROVED (Konflikt-Resolution semantisch korrekt)
  - **G-4:** Codex Stage-2 APPROVED (oder Fix-Commits + Re-Verify + Re-Review bis APPROVED)

### Stage 5 — Merge + Memory-Update (15 min)

- **G-5 pre-merge local-remote-verify:**
  - lokaler Branch-SHA == origin-Remote-Branch-SHA
  - main lokal frisch gepullt
  - keine Konflikte beim hypothetischen `git merge --no-ff sync-upstream-v1.4.10`
- PR(s) gemergt nach `main` (squash bei Multi-Slice, merge-commit bei 1-Shot)
- `package.json` version-Bump auf `1.4.10` (separate Atomic-Commit, gehört zum Sync-Merge)
- Memory-Eintrag schreiben: `ppal-upstream-sync-v1.4.10-shipped.md` mit
  - Datum
  - Liste der gelöschten obsoleten Memory-Einträge
  - Liste der neuen Upstream-Tools/-Features
  - Sync-Commit-SHA(s)
- `MEMORY.md`-Index updaten
- Worktree-Cleanup: `git worktree remove ../producer-pal-sync-1.4.10` + `git worktree prune`

## Rollback-Strategie

| Stage | Failure-Mode | Recovery |
|---|---|---|
| 0 | Tag-Push schlägt fehl | Permissions/Network prüfen, retry |
| 1 | Merge schlägt mit Tool-Fehler ab | Worktree verwerfen, main unangetastet |
| 2 | Memory-Match unsicher (Upstream-Code-Pfad nicht klar) | Eintrag BEHALTEN, Konservativ-Markieren statt Löschen |
| 3 | Konflikt-Resolution-Gate G-1 oder G-2 fail | Cluster-by-Cluster fixen, kein Merge ohne Grün |
| 4 | Codex-Findings | Fix-Commit, Re-Verify, Re-Review |
| 5 | pre-merge-verify zeigt remote-divergence | Pull + Re-Test, Worktree muss aktuell sein |
| post-merge worst-case | irreparable Regression | `git reset --hard pre-upstream-sync-v1.4.10` (USER-Authorisierung) + Force-Push (USER-Authorisierung) |

## Bekannte Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Konflikt-Resolution wählt falsche Seite bei subtilen Semantik-Konflikten | mittel | Stage-1 + Codex Stage-2 = Doppel-Lens |
| Coverage-Drop durch neue Upstream-Files ohne Coverage-Adaption | mittel | Gate G-B blockiert, `vitest.config` ggfs. ergänzen als Teil des Sync |
| Take-Lane-Memory-Löschung war voreilig — Upstream liefert nur partiell | niedrig | Stage 2 prüft Upstream-Code semantisch bevor Löschung |
| Worktree-Zombie bei Abbruch | niedrig | `git worktree remove` in jedem Stage-Exit-Block + CLAUDE.md-Hook prüft |
| Upstream ändert sich während Sync-Pipeline läuft | niedrig | Pipeline-Dauer ~1 Tag, akzeptabel; sonst v1.4.11-Sync als Folge-Slice |
| Welle-1-Slice-Memory-SHA-Verweise stale wenn squash-merge die History komprimiert | niedrig | Squash NICHT auf Welle-1-Commits anwenden, nur auf Sync-PR-Commits |

## Artefakte (Definition-of-Done)

1. `git tag pre-upstream-sync-v1.4.10` lokal + auf `origin`
2. Sync-PR(s) gemergt nach `main`; HEAD enthält 189 alte + alle Upstream-Features
3. `package.json` version = `1.4.10`
4. `docs/superpowers/specs/2026-05-28-upstream-sync-v1.4.10-design.md` (diese Datei)
5. Memory-Eintrag `ppal-upstream-sync-v1.4.10-shipped.md` + Index-Update
6. Worktree entfernt, `git worktree list` zeigt keine Zombies
7. `npm run check` grün, Coverage ≥ 99.00% Stmts

## Out-of-Scope

- v1.4.11 oder spätere Upstream-Versionen (Folge-Slice)
- Re-Ingest der KB in NotebookLM (separate Pflicht falls Upstream-Features die KB-Capability-Liste berühren — `sync-capability-kb.mjs` deckt das ab)
- `.nvmrc`-Commit (separater Trivial-Commit, nicht Teil des Sync)
- Roadmap-File aus Upstream-cf22e37f übernehmen (Upstream-spezifisch, evtl. obsolet für Fork)

## Verwandte Memory-Einträge

- `producer-pal-test-runner-arm64-node` — Node-v24-PFLICHT
- `ppal-takelane-recon-clean` — Stage 2 prüft auf Löschung
- `welle4-pattern` — pre-merge-verify-Lehre
- `welle5-pattern` — Memory-Aktualitäts-Bringschuld
- `ppal-codex-fixes-shipped` — Codex Stage-2 PFLICHT-Begründung
- `ppal-welle4-slice4-nlm-kb-shipped` — KB-Sync-Trigger falls Capability-Liste tangiert
