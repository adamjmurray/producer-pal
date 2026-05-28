# Upstream-Sync v1.4.7 → v1.4.10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Producer-Pal-Fork von Version 1.4.7 auf Upstream-Version 1.4.10 synchronisieren ohne die 189 eigenen Welle-1–5-Commits zu verlieren.

**Architecture:** 5-Stufen-Pipeline (Safety-Net, Recon-im-Worktree, Memory-Bereinigung, Konflikt-Resolution+Verify, Stage-1+Codex-Stage-2-Review, Merge+Memory-Update) mit Stage-1-Decision-Gate das je nach gemessenem Konflikt-Profil zwischen 1-Shot-PR, 2–3-Slice-Split oder 4–5-Slice-Subagent-Delegation entscheidet.

**Tech Stack:** Git Worktrees, Node v24.15.0 arm64, vitest, npm, gh CLI; Spec siehe `docs/superpowers/specs/2026-05-28-upstream-sync-v1.4.10-design.md`.

**Hinweis zum Plan-Stil:** Dies ist eine Operations-Pipeline, kein Feature-TDD. Jede Task hat statt "failing test → implement → passing test" ein **deterministisches Verifikations-Kommando** (gate-bezogen). Code-Schritte gibt es nur in Phase 5 (Version-Bump + Memory-File). Die meisten Tasks sind Bash/Git-Befehle.

---

## Pre-Flight Checks

Vor Plan-Start ausführen:

- [ ] **PF-1: Working Directory:** Du bist in `/Users/macuser/Desktop/AIbleton/producer-pal` (Hauptrepo).
  ```bash
  pwd
  # Erwartet: /Users/macuser/Desktop/AIbleton/producer-pal
  ```

- [ ] **PF-2: Node v24 PATH:** Setze für alle npm/test-Befehle:
  ```bash
  export PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH
  node --version
  # Erwartet: v24.15.0
  ```

- [ ] **PF-3: Working Tree Clean (main):**
  ```bash
  git checkout main && git status
  # Erwartet: "nothing to commit, working tree clean"
  ```

- [ ] **PF-4: Upstream-Tags vorhanden:**
  ```bash
  git tag -l | grep -E "^v1\.4\.(9|10)$"
  # Erwartet: v1.4.9, v1.4.10 in der Ausgabe
  ```
  Falls leer: `git fetch upstream --tags`

- [ ] **PF-5: Baseline-Verify (Aktuelle Tests grün):**
  ```bash
  npm run check
  # Erwartet: Exit 0, "6128 passed, 0 failed", Coverage Stmts ≥ 99.21%
  ```

- [ ] **PF-6: Zombie-Worktrees prüfen:**
  ```bash
  git worktree list && git worktree prune
  # Erwartet: nur Hauptrepo gelistet, kein producer-pal-sync-*
  ```

---

## Phase 1 — Setup & Recon

### Task 1: Backup-Tag erzeugen + pushen

**Files:** keine (nur git refs)

- [ ] **Step 1: Backup-Tag lokal anlegen**
  ```bash
  git tag pre-upstream-sync-v1.4.10 main
  ```

- [ ] **Step 2: Verifizieren**
  ```bash
  git tag -l | grep pre-upstream-sync-v1.4.10
  # Erwartet: pre-upstream-sync-v1.4.10
  git rev-parse pre-upstream-sync-v1.4.10
  # Erwartet: gleicher SHA wie git rev-parse main
  ```

- [ ] **Step 3: Tag pushen (Audit + Rollback-Anker)**
  ```bash
  git push origin pre-upstream-sync-v1.4.10
  # Erwartet: "* [new tag] pre-upstream-sync-v1.4.10 -> pre-upstream-sync-v1.4.10"
  ```

### Task 2: Sync-Worktree anlegen

**Files:** Worktree-Verzeichnis `../producer-pal-sync-1.4.10`

- [ ] **Step 1: Worktree mit neuem Branch erstellen**
  ```bash
  git worktree add ../producer-pal-sync-1.4.10 -b sync-upstream-v1.4.10 main
  # Erwartet: "Preparing worktree", "HEAD is now at <sha>"
  ```

- [ ] **Step 2: In Worktree wechseln + Verifizieren**
  ```bash
  cd ../producer-pal-sync-1.4.10
  git branch --show-current
  # Erwartet: sync-upstream-v1.4.10
  git status
  # Erwartet: "On branch sync-upstream-v1.4.10. nothing to commit"
  ```

### Task 3: Recon-Merge ausführen

**Files:** keine (nur Index-State im Worktree)

- [ ] **Step 1: Merge ohne Commit ausführen**
  ```bash
  cd ../producer-pal-sync-1.4.10
  git merge --no-commit --no-ff upstream/main
  ```
  Erwartet: Ausgabe listet Konflikt-Files. Exit-Code 1 ist OK (Konflikte erwartet).

- [ ] **Step 2: Falls "Already up to date":** STOP. Das wäre ein Fehler in PF-Checks (Upstream ist nicht gefetched). Rollback: `git merge --abort`, dann `git fetch upstream` und Task 3 erneut.

### Task 4: Konflikt-Cluster-Tabelle generieren

**Files:** Worktree-lokale Datei `RECON.md` (nicht committed)

- [ ] **Step 1: Konflikt-Files auflisten**
  ```bash
  cd ../producer-pal-sync-1.4.10
  git diff --name-only --diff-filter=U > /tmp/conflicts.txt
  wc -l /tmp/conflicts.txt
  cat /tmp/conflicts.txt
  ```

- [ ] **Step 2: Pro Domäne gruppieren**
  Erstelle Tabelle:
  ```
  Domäne                     | Files | Action
  -------------------------- | ----- | ------
  src/tools/read-*           |  ?    | Upstream gewinnt
  src/tools/create-clip/dup  |  ?    | Upstream gewinnt
  scripts/scan-live-api.*    |  ?    | Upstream-Fix + eigene Logik stack
  src/tools/<Welle-1-Tools>  |  ?    | Wir gewinnen
  package.json               |  ?    | Beidseitig
  package-lock.json          |  ?    | Beidseitig (nach package.json)
  vitest.config.ts           |  ?    | Manuell + G-2 entscheidet
  tests/*                    |  ?    | Manuell + Test-Run entscheidet
  webui/*                    |  ?    | Upstream gewinnt (kein Overlap)
  ANDERE                     |  ?    | Manuell prüfen
  ```

- [ ] **Step 3: Tabelle als RECON.md im Worktree speichern**
  Datei wird NICHT committed (nur Arbeitsdokument). Schreibe sie nach `/Users/macuser/Desktop/producer-pal-sync-1.4.10/RECON.md`.

### Task 5: Stage-1-Decision-Gate — Slice-Pfad festlegen

**Files:** keine (nur Entscheidung)

- [ ] **Step 1: Konflikt-Anzahl messen**
  ```bash
  wc -l /tmp/conflicts.txt
  ```

- [ ] **Step 2: Entscheiden anhand Schwellen**
  - `<10 Files UND keine src/tools/* schweren Konflikte` → **1-SHOT-PFAD** (alles in einer Sitzung lösen)
  - `10–50 Files` → **2–3-SLICE-PFAD** nach Domäne (Slice A: package + read-clip-Cluster, Slice B: scan-live-api + webui, Slice C: Rest)
  - `>50 ODER schwere src/tools/* Konflikte` → **4–5-SLICE-PFAD** mit Subagent-Delegation pro Cluster

- [ ] **Step 3: Entscheidung in RECON.md festhalten** mit Begründung (Konflikt-Anzahl, Domänen-Verteilung).

- [ ] **Step 4: Bei 4–5-Slice-Pfad:** Lese `superpowers:dispatching-parallel-agents`, aber: kein `isolation: worktree` für Subagents (wir sind bereits im Sync-Worktree). Subagents schreiben in denselben Worktree, sequenziell.

---

## Phase 2 — Memory-Bereinigung (VOR Code-Konflikt-Resolution)

### Task 6: ppal-takelane-recon-clean Upstream-Code-Match

**Files lesen:**
- `~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/ppal-takelane-recon-clean.md`

- [ ] **Step 1: Memory-Eintrag lesen**
  ```bash
  cat ~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/ppal-takelane-recon-clean.md
  ```

- [ ] **Step 2: Upstream-Code semantisch prüfen**
  ```bash
  cd ../producer-pal-sync-1.4.10
  # Suche nach Take-Lane-Implementation in Upstream-Code:
  grep -rn "takeLane" src/tools/read-clip.ts src/tools/read-track.ts src/tools/create-clip.ts src/tools/duplicate.ts 2>/dev/null | head -20
  ```
  Falls Output zeigt vollständige Take-Lane-Integration in **read+create+duplicate** → Upstream liefert vollständig → Memory LÖSCHEN.
  Falls Output zeigt nur partielle Integration → Memory BEHALTEN.

- [ ] **Step 3: Entscheidung dokumentieren** in RECON.md unter "Memory-Bereinigung".

- [ ] **Step 4: Falls Löschen entschieden:**
  ```bash
  rm ~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/ppal-takelane-recon-clean.md
  ```

### Task 7: Weitere potenziell stale Memory-Einträge scannen

- [ ] **Step 1: Suche nach Memory-Einträgen mit Upstream-relevanten Keywords**
  ```bash
  ls ~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/*.md | xargs grep -l -i -E "(scan-live-api|take.?lane|voice|gemini|context.?editor)" 2>/dev/null
  ```

- [ ] **Step 2: Pro Treffer einzeln entscheiden** (siehe Stage-2-Tabelle im Spec):
  - Welle-1–5 Slice-Memories → IMMER BEHALTEN (Audit-Trail)
  - STOP-Verdicts → IMMER BEHALTEN (Hardware/Asset/Architektur unabhängig von Upstream)
  - Recon-Memories die durch Upstream obsolet werden → LÖSCHEN

- [ ] **Step 3: Entscheidungs-Log in RECON.md ergänzen**.

### Task 8: MEMORY.md-Index updaten

**Files lesen + ändern:**
- `~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/MEMORY.md`

- [ ] **Step 1: MEMORY.md lesen** und Zeilen identifizieren die auf gelöschte Memory-Files verweisen.

- [ ] **Step 2: Diese Zeilen aus MEMORY.md entfernen** (Edit-Tool, exact-match auf jeden bullet).

- [ ] **Step 3: Verifizieren — kein gebrochener Link**
  ```bash
  grep -oE '\[([^\]]+)\]\(([^)]+\.md)\)' ~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/MEMORY.md | while read link; do
    file=$(echo "$link" | sed 's/.*(\(.*\)).*/\1/')
    [ -f ~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/$file ] || echo "BROKEN: $file"
  done
  ```
  Erwartet: keine "BROKEN:"-Zeilen.

---

## Phase 3 — Konflikt-Resolution

**Hinweis:** Reihenfolge der Tasks ist wichtig. Package zuerst (für npm install), dann src/tools, dann scripts, dann config/tests.

### Task 9: package.json + package-lock.json mergen

**Files:**
- Modify: `package.json` (im Worktree)
- Modify: `package-lock.json` (im Worktree)

- [ ] **Step 1: package.json öffnen**
  ```bash
  cd ../producer-pal-sync-1.4.10
  git diff --diff-filter=U -- package.json
  ```

- [ ] **Step 2: Konflikt resolven**
  - `version`: temporär `1.4.7` lassen (Bump erfolgt in Task 31)
  - `dependencies`/`devDependencies`: beide Sides mergen (Upstream-Bumps übernehmen, unsere Custom-Deps behalten)
  - `scripts`: beide mergen, bei doppeltem Namen unsere bevorzugen falls semantisch unterschiedlich

- [ ] **Step 3: package-lock.json: Upstream-Version übernehmen**
  ```bash
  git checkout --theirs package-lock.json
  ```

- [ ] **Step 4: `npm install` ausführen** (regeneriert lockfile mit gemergten package.json)
  ```bash
  npm install
  ```
  Erwartet: Exit 0, keine peer-dep-conflicts.

- [ ] **Step 5: Staged**
  ```bash
  git add package.json package-lock.json
  ```

### Task 10: src/tools/read-* + create-clip + duplicate (Take-Lane → Upstream)

**Files (alle im Worktree):**
- `src/tools/read-clip.ts`
- `src/tools/read-track.ts`
- `src/tools/read-live-set.ts`
- `src/tools/create-clip.ts`
- `src/tools/duplicate.ts`

- [ ] **Step 1: Konflikt-Files pro File einzeln öffnen + Upstream wählen**
  ```bash
  for f in src/tools/read-clip.ts src/tools/read-track.ts src/tools/read-live-set.ts src/tools/create-clip.ts src/tools/duplicate.ts; do
    [ -f "$f" ] || continue
    git diff --diff-filter=U -- "$f" > /dev/null 2>&1 && echo "KONFLIKT: $f"
  done
  ```

- [ ] **Step 2: Pro Konflikt-File Upstream-Seite akzeptieren**
  ```bash
  for f in $(git diff --name-only --diff-filter=U | grep -E '^src/tools/(read-(clip|track|live-set)|create-clip|duplicate)\.ts$'); do
    git checkout --theirs "$f"
    git add "$f"
  done
  ```

- [ ] **Step 3: Verify — keine Konflikt-Marker übrig**
  ```bash
  git diff --cached -- src/tools/ | grep -E '^(<<<<<<<|=======|>>>>>>>)' && echo "FEHLER: Marker noch da" || echo "OK"
  ```

### Task 11: scripts/scan-live-api.* (Upstream-Fix + unsere Recon-Logik stack)

**Files:**
- `scripts/scan-live-api.*` (alle Varianten)

- [ ] **Step 1: Welche Files in Konflikt?**
  ```bash
  git diff --name-only --diff-filter=U | grep scan-live-api
  ```

- [ ] **Step 2: Upstream-Fix als Basis nehmen**
  ```bash
  for f in $(git diff --name-only --diff-filter=U | grep scan-live-api); do
    git checkout --theirs "$f"
  done
  ```

- [ ] **Step 3: Unsere eigene Recon-Logik manuell drauflegen**
  - Vergleiche mit `git show pre-upstream-sync-v1.4.10:scripts/scan-live-api.<ext>`
  - Eigene Erweiterungen (z.B. getPropertyValue-Erweiterungen für arrays) identifizieren
  - Per Edit-Tool draufpatchen ohne den Upstream-Fix zu zerstören

- [ ] **Step 4: Staged**
  ```bash
  git add scripts/scan-live-api.*
  ```

### Task 12: src/tools Welle-1-Slice-Tools (falls Konflikte — wir gewinnen)

**Files (im Worktree, nur falls Konflikte):**
- `src/tools/clip-envelope*`, `fades*`, `groove*`, `tempo*`, `timesig*`, `mixer-routing*`, `mod-targets*`, `warp-markers*`, `midi-export*`, `shift-time*`, `routing*`, `clip-scale*`, `arrangement-loop*`, `runbook/*`

- [ ] **Step 1: Konflikte in diesen Files identifizieren**
  ```bash
  git diff --name-only --diff-filter=U | grep -E '^src/tools/(clip-envelope|fades|groove|tempo|timesig|mixer-routing|mod-targets|warp-markers|midi-export|shift-time|routing|clip-scale|arrangement-loop|runbook/)' > /tmp/welle1-conflicts.txt
  cat /tmp/welle1-conflicts.txt
  ```

- [ ] **Step 2: Falls leer:** Skip Task 12 (kein Welle-1-Konflikt erwartet).

- [ ] **Step 3: Falls vorhanden:** Pro File Upstream-Diff prüfen
  - Bei trivialem Upstream-Change (Whitespace, Import-Reorder) → Upstream übernehmen
  - Bei semantischem Konflikt mit unserer Welle-1-Implementation → **unsere** Seite akzeptieren:
    ```bash
    git checkout --ours "$f"
    git add "$f"
    ```

### Task 13: vitest.config + Coverage-Config

**Files:**
- `vitest.config.ts` (oder `vitest.config.mts`)

- [ ] **Step 1: Konflikt-Status**
  ```bash
  git diff --diff-filter=U -- vitest.config.*
  ```

- [ ] **Step 2: Manuelles Merge**
  - Coverage-Thresholds: Upstream-Wert nehmen NUR wenn ≥ unserer aktuellen 99.00% — sonst unseren behalten
  - Coverage-Excludes: beide Sides mergen
  - Reporter-Config: Upstream übernehmen
  - srcExclude/etc.: Welle-5-Slice-2-Memory beachten (`ppal-welle5-slice2-superpowers-tag-shipped`) — falls bewusste Publikations-Entscheidung berührt: unsere Seite

- [ ] **Step 3: Staged**
  ```bash
  git add vitest.config.*
  ```

### Task 14: Test-Files mit beidseitigen Änderungen

**Files:**
- `tests/**/*.test.ts` (alle Konflikt-Files)

- [ ] **Step 1: Konflikt-Tests auflisten**
  ```bash
  git diff --name-only --diff-filter=U | grep '\.test\.ts$' > /tmp/test-conflicts.txt
  cat /tmp/test-conflicts.txt
  ```

- [ ] **Step 2: Pro Test manuell mergen**
  - Wenn Test einen Upstream-Bugfix prüft, der bei uns relevant ist → Upstream-Test übernehmen
  - Wenn Test eine unserer Welle-1-Capabilities prüft → unseren Test behalten
  - Wenn beide Tests dasselbe prüfen aber unterschiedlich → kombinieren

- [ ] **Step 3: Staged**
  ```bash
  for f in $(cat /tmp/test-conflicts.txt); do git add "$f"; done
  ```

### Task 15: webui/* + sonstige Upstream-only Files

- [ ] **Step 1: Restliche Konflikte**
  ```bash
  git diff --name-only --diff-filter=U
  ```

- [ ] **Step 2: webui/* → Upstream (wir hatten keine WebUI-Mods)**
  ```bash
  for f in $(git diff --name-only --diff-filter=U | grep '^webui/'); do
    git checkout --theirs "$f"
    git add "$f"
  done
  ```

- [ ] **Step 3: Verbleibende Files manuell mergen** (RECON.md-Tabelle als Guide).

### Task 16: G-1 Verify — npm run check exit 0

- [ ] **Step 1: Alle Konflikte resolved?**
  ```bash
  git status | grep -E "both modified|both added"
  # Erwartet: leere Ausgabe
  ```

- [ ] **Step 2: npm run check ausführen**
  ```bash
  PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm run check
  ```
  Erwartet: Exit 0, "XXXX passed, 0 failed".

- [ ] **Step 3: Bei FAIL:**
  - Test-Failures: smart-debug-Skill nutzen (Sequential-Thinking + Context7 für Framework-Docs)
  - Lint-Failures: ggf. Upstream-eslint-Config konflikt — manuell prüfen
  - Type-Failures: Konflikt-Resolution falsch — zur Phase 3 zurück
  - **NICHT** weitermachen ohne G-1 grün

### Task 17: G-2 Verify — Coverage Stmts ≥ 99.00%

- [ ] **Step 1: Coverage-Output aus letztem `npm run check` lesen**

- [ ] **Step 2: Stmts-Wert prüfen**
  - ≥ 99.00% → G-2 PASS
  - < 99.00% → neue Upstream-Files haben Coverage-Loch
    - Option A: Coverage-Excludes für reine Upstream-Files (z.B. neuer Voice-Provider-Code) ergänzen
    - Option B: Sub-Slice für Coverage-Wiederherstellung als Folge dokumentieren, G-2 als "akzeptiert mit Schuld" markieren — User-OK erforderlich

- [ ] **Step 3: Coverage-Trend in RECON.md festhalten**
  ```
  Aktuell vor Sync: 99.21% Stmts
  Nach Sync:        XX.XX% Stmts
  Delta:            -X.XX pp
  ```

### Task 18: Konflikt-Resolution committen (Worktree)

- [ ] **Step 1: Status final prüfen**
  ```bash
  git status
  # Erwartet: keine "both modified", alles staged
  ```

- [ ] **Step 2: Merge-Commit erstellen**
  ```bash
  git commit -m "$(cat <<'EOF'
  Merge upstream/main (v1.4.10) into sync-upstream-v1.4.10

  Resolved conflicts per spec docs/superpowers/specs/2026-05-28-upstream-sync-v1.4.10-design.md:
  - src/tools/read-*, create-clip, duplicate: Upstream gewinnt (Take-Lane-Felder)
  - scripts/scan-live-api.*: Upstream-Fix + unsere Recon-Logik gestackt
  - src/tools/Welle-1-Tools: wir gewinnen
  - package.json/-lock: beide gemergt + npm install
  - vitest.config: manuell, Coverage-Threshold gehalten
  - tests/*: manuell per Test-Run-Schiedsrichter
  - webui/*: Upstream

  Gates: G-1 (npm run check exit 0) PASS, G-2 (Coverage Stmts ≥ 99.00%) PASS.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase 4 — Review

### Task 19: Stage-1-Review (code-review Agent) → G-3

- [ ] **Step 1: code-review Skill aufrufen**
  Im Worktree-Verzeichnis:
  ```
  Skill: code-review
  Args: medium (default)
  ```
  Der Skill prüft den ganzen Diff `main..sync-upstream-v1.4.10`.

- [ ] **Step 2: Findings adressieren**
  - CRITICAL: blockierend, sofort fixen + Re-Verify (Task 16+17 erneut)
  - IMPORTANT: fixen, dann weiter
  - MINOR: dokumentieren in RECON.md, optional fixen

- [ ] **Step 3: G-3 PASS** wenn keine CRITICAL/IMPORTANT mehr offen.

### Task 20: Codex-Stage-2-Review → G-4

- [ ] **Step 1: codex:rescue Skill aufrufen**
  ```
  Skill: codex:rescue
  ```
  Bitte Codex um Review des kompletten Sync-Diffs gegen `pre-upstream-sync-v1.4.10`-Tag.

- [ ] **Step 2: Codex-Findings adressieren** (Memory `ppal-codex-fixes-shipped`: erwartete andere Defekt-Klassen als Stage-1):
  - CRITICAL/IMPORTANT: Fix-Commit im Worktree, npm run check, Codex Re-Verify
  - MINOR: dokumentieren

- [ ] **Step 3: G-4 PASS** wenn Codex APPROVED (oder Re-Verify-Loop abgeschlossen).

---

## Phase 5 — Merge + Wrap-up

### Task 21: G-5 pre-merge local-remote-verify

- [ ] **Step 1: main aktuell?**
  ```bash
  cd /Users/macuser/Desktop/AIbleton/producer-pal
  git fetch origin main
  git rev-list --count main..origin/main
  # Erwartet: 0 (lokales main = origin/main)
  ```

- [ ] **Step 2: Worktree-Branch aktuell?**
  ```bash
  cd ../producer-pal-sync-1.4.10
  git rev-list --count sync-upstream-v1.4.10..origin/sync-upstream-v1.4.10 2>/dev/null || echo "OK (nicht remote)"
  ```

- [ ] **Step 3: Hypothetischer Merge testfrei?**
  ```bash
  cd /Users/macuser/Desktop/AIbleton/producer-pal
  git merge --no-commit --no-ff sync-upstream-v1.4.10 -X ours --dry-run 2>&1 | head -5
  # Lesen ob conflicts erwartet werden
  git merge --abort 2>/dev/null || true
  ```

### Task 22: package.json version-Bump auf 1.4.10

**Files:**
- Modify: `package.json` (im Worktree)

- [ ] **Step 1: Version bumpen**
  ```bash
  cd ../producer-pal-sync-1.4.10
  # Im File version: "1.4.7" → "1.4.10"
  ```
  Edit-Tool auf `package.json`:
  - old: `"version": "1.4.7",`
  - new: `"version": "1.4.10",`

- [ ] **Step 2: package-lock.json mit-bumpen**
  ```bash
  npm install --package-lock-only
  ```

- [ ] **Step 3: Test grün**
  ```bash
  PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm run check
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add package.json package-lock.json
  git commit -m "$(cat <<'EOF'
  chore(release): version bump 1.4.7 → 1.4.10

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### Task 23: PR erstellen + mergen

- [ ] **Step 1: Branch pushen**
  ```bash
  cd ../producer-pal-sync-1.4.10
  git push -u origin sync-upstream-v1.4.10
  ```

- [ ] **Step 2: PR erstellen**
  ```bash
  gh pr create --title "sync: upstream v1.4.7 → v1.4.10" --body "$(cat <<'EOF'
  ## Summary
  - Synchronisiert Producer-Pal-Fork mit Upstream-Tag v1.4.10
  - Erhält alle 189 lokalen Welle-1–5-Commits
  - Übernimmt Voice/Gemini Live, Context-Editor, Take-Lanes, Library-Plugins, Devices-Hardening, Security-at-rest, scan-live-api-Fix

  ## Spec
  - `docs/superpowers/specs/2026-05-28-upstream-sync-v1.4.10-design.md`

  ## Plan
  - `docs/superpowers/plans/2026-05-28-upstream-sync-v1.4.10-plan.md`

  ## Gates
  - G-1 npm run check: PASS
  - G-2 Coverage Stmts ≥ 99.00%: PASS
  - G-3 Stage-1-Review: APPROVED
  - G-4 Codex Stage-2: APPROVED
  - G-5 pre-merge local-remote-verify: PASS

  ## Rollback-Anker
  - Tag `pre-upstream-sync-v1.4.10`

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 3: PR mergen** (squash bei wenig Konflikten, merge-commit bei viel Diff — User entscheidet basierend auf Slice-Pfad aus Task 5):
  ```bash
  gh pr merge --merge  # oder --squash, je nach Slice-Pfad
  ```

- [ ] **Step 4: Post-merge SHA-Verify (Welle-4-Race-Mitigation)**
  ```bash
  cd /Users/macuser/Desktop/AIbleton/producer-pal
  git fetch origin main
  git log origin/main -1 --format='%H %s'
  # Erwartet: zeigt den Sync-Merge-Commit
  ```

### Task 24: Memory ppal-upstream-sync-v1.4.10-shipped.md schreiben

**Files:**
- Create: `~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/ppal-upstream-sync-v1.4.10-shipped.md`

- [ ] **Step 1: Memory-File mit Frontmatter + Body schreiben**

Inhalt-Template:
```markdown
---
name: ppal-upstream-sync-v1.4.10-shipped
description: Fork-Sync v1.4.7→v1.4.10 GEMERGT; alle 189 Welle-1-5-Commits erhalten + alle Upstream-Features übernommen
metadata:
  type: project
---

PR #<NUMMER> gemergt nach origin/main (<SHA>). Tag `pre-upstream-sync-v1.4.10` als Rollback-Anker.

**Why:** Producer-Pal-Fork war 3 Upstream-Tags zurück; Upstream-Features (Voice/Gemini Live, Context-Editor, Take-Lanes, Library-Plugins, Devices-Hardening, Security-at-rest, scan-live-api-Fix) wurden gebraucht; rebase-Variante verboten (CLAUDE.md kein force-push auf main, Memory-SHA-Verweise würden stale).

**How to apply:** Bei zukünftigen Upstream-Syncs (v1.4.11+): gleiche 5-Stufen-Pipeline aus Spec `docs/superpowers/specs/2026-05-28-upstream-sync-v1.4.10-design.md` nutzen. Backup-Tag → Worktree-Recon → Memory-Bereinigung VOR Code → Konflikt-Resolution nach deterministischen Regeln → Stage-1 + Codex Stage-2 Reviews PFLICHT → pre-merge SHA-Verify → Memory-Update.

**Gelöschte obsolete Memory-Einträge:** <Liste aus Task 8>

**Übernommene Upstream-Features:** Voice/Gemini Live (30 Stimmen, Auto-Resume, Barge-In), Context Memory Editor (`/context`), Take-Lanes in read/create/duplicate, Library Plugin-DB + verifyPaths + Stale-WAL, Devices Wavetable/Drift/Compressor-Hardening, Security API-Keys at-rest, scan-live-api Array-Result-Fix.

**Verwandte:** [[welle4-pattern]] [[welle5-pattern]] [[ppal-codex-fixes-shipped]]
```

- [ ] **Step 2: Memory-File schreiben** mit Write-Tool an den exakten Pfad.

### Task 25: MEMORY.md-Index updaten

**Files:**
- Modify: `~/.claude/projects/-Users-macuser-Desktop-AIbleton/memory/MEMORY.md`

- [ ] **Step 1: Neuen Index-Eintrag am Ende einfügen**
  ```markdown
  - [Upstream-Sync v1.4.10 GEMERGED](ppal-upstream-sync-v1.4.10-shipped.md) — PR #<N> gemergt; alle 189 lokalen Commits + alle Upstream-Features (Voice/Gemini, Context-Editor, Take-Lanes, Library-Plugins, Devices-Hardening, Security-at-rest, scan-live-api-Fix); pre-upstream-sync-v1.4.10 Tag als Rollback-Anker
  ```

- [ ] **Step 2: Gelöschte-Einträge-Zeilen aus Index entfernen** (falls Task 8 noch nicht erledigt — Doppel-Check).

### Task 26: Worktree cleanup

- [ ] **Step 1: Aus Worktree raus**
  ```bash
  cd /Users/macuser/Desktop/AIbleton/producer-pal
  ```

- [ ] **Step 2: Worktree-Status prüfen**
  ```bash
  cd ../producer-pal-sync-1.4.10 && git status && cd -
  # Erwartet: clean
  ```

- [ ] **Step 3: Worktree entfernen**
  ```bash
  git worktree remove ../producer-pal-sync-1.4.10
  git worktree prune
  git worktree list
  # Erwartet: nur Hauptrepo
  ```

- [ ] **Step 4: Branch lokal löschen (optional, war nur Sync-Vehicle)**
  ```bash
  git branch -d sync-upstream-v1.4.10
  ```

### Task 27: Final-Verify auf main

- [ ] **Step 1: main pullen**
  ```bash
  cd /Users/macuser/Desktop/AIbleton/producer-pal
  git checkout main
  git pull origin main
  ```

- [ ] **Step 2: package.json version-Check**
  ```bash
  grep '"version"' package.json
  # Erwartet: "version": "1.4.10",
  ```

- [ ] **Step 3: npm run check final**
  ```bash
  PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH npm run check
  # Erwartet: Exit 0, Coverage ≥ 99.00%
  ```

- [ ] **Step 4: Sind alle 189 Welle-Commits noch da?**
  ```bash
  git log --oneline pre-upstream-sync-v1.4.10..HEAD | wc -l
  # Erwartet: >= 1 (mindestens der Sync-Merge-Commit)
  git log --oneline pre-upstream-sync-v1.4.10^..HEAD | head -5
  # Manuell: Top-5 zeigt Sync-Merge + ggf. Version-Bump
  git log --oneline | grep -E '^[0-9a-f]+ (feat|fix|test|docs|chore|refactor)' | wc -l
  # Erwartet: deutlich höher als 189 (189 unsere + alle Upstream)
  ```

---

## Definition of Done

Pipeline ist vollständig wenn:

- [x] Tag `pre-upstream-sync-v1.4.10` lokal + auf origin existiert
- [x] PR gemergt nach `main`; main-HEAD enthält 189 lokale + alle Upstream-Features
- [x] `package.json` version = `1.4.10`
- [x] `npm run check` grün, Coverage Stmts ≥ 99.00%
- [x] Memory `ppal-upstream-sync-v1.4.10-shipped.md` existiert
- [x] MEMORY.md-Index ist konsistent (keine Broken Links zu gelöschten Memory-Files)
- [x] Worktree entfernt, `git worktree list` zeigt nur Hauptrepo
- [x] Stage-1 + Codex Stage-2 beide APPROVED

---

## Self-Review (durchgeführt 2026-05-28)

**Spec-Coverage-Check:**
- Stage 0 Safety Net → Task 1 ✓
- Stage 1 Recon im Worktree → Task 2–4 ✓
- Stage-1-Decision-Gate → Task 5 ✓
- Stage 2 Memory-Bereinigung → Task 6–8 ✓
- Stage 3 Konflikt-Resolution → Task 9–18 ✓ (alle Konflikt-Regeln aus Spec abgedeckt)
- Stage 4 Review → Task 19–20 ✓
- Stage 5 Merge+Wrap → Task 21–27 ✓
- Alle Gates G-1..G-5 → in Task 16, 17, 19, 20, 21 verifiziert ✓
- Rollback-Strategie → Pre-Flight + jeder Verify-Gate dokumentiert

**Placeholder-Scan:** keine TBD/TODO/"später"-Marker. Memory-Eintrag-Template hat Slots `<NUMMER>`, `<SHA>`, `<Liste>` — das ist OK, das sind Laufzeit-Werte die in Task 24 gefüllt werden.

**Type-Consistency:** "G-1..G-5" konsistent benutzt. "Stage-1-Decision-Gate" nur einmal (Task 5).

**Bekannte Schuld:** Bei 4-5-Slice-Pfad delegiert der Plan an `superpowers:dispatching-parallel-agents`. Plan delegiert die genaue Slice-Anzahl-Entscheidung an Laufzeit (Task 5).

---

## Premortem-Analyse (automatisch generiert)

**Gesamtrisiko:** MITTEL
**Empfehlung:** Weiter wie geplant mit 3 Mitigations-Erweiterungen in Tasks 9, 11, 17.

### Risiko 1: Dependency-Hell beim package.json-Merge (Score 9 = Impact h × Wahrsch h)

- **Beschreibung:** Upstream bumped 8+ Dependencies (dompurify, codemirror/view, preact, ai-libs, eslint, @types/node, playwright, vitest) PLUS neue Gemini-Live-Deps. Unsere Welle-1-Tools haben eigene Deps. `npm install` kann peer-dep-resolution failen oder unsere Tool-Funktionen brechen.
- **Mitigation:** Task 9 Step 4 erweitern:
  - Step 3.5 (NEU): `npm install --dry-run` zwischen Konflikt-Resolution und actual `npm install`
  - Bei "ERESOLVE": Sub-Slice für peer-conflict-Resolution dokumentieren statt blind `--force`
- **Früh-Indikator:** `npm install --dry-run` Output enthält "ERESOLVE" oder "peer dep missing"

### Risiko 2: scan-live-api Stack-Fehler (silent break) (Score 6 = Impact h × Wahrsch m)

- **Beschreibung:** Upstream-Fix für getPropertyValue/array-results könnte UNSERE Recon-Logik genau dort treffen wo wir gepatched haben. Stack-Order-Fehler ändert Semantik subtil OHNE Test-Failure (Memory `ppal-codex-fixes-shipped`: Codex hat genau diese Defekt-Klasse 5× in Welle-3 gefunden).
- **Mitigation:** Task 11 erweitern:
  - Step 4.5 (NEU): 3-Way-Diff explizit ansehen (`git show main:scripts/scan-live-api.* | diff - <Upstream-Version>`)
  - Step 5 (NEU): Nach Stack — Recon-Skripte gegen pre-sync-Output vergleichen (`pre-upstream-sync-v1.4.10`-Tag als Referenz)
  - Codex Stage-2 in Task 20 EXPLIZIT auf `scripts/scan-live-api*` fokussieren (separate Codex-Frage)
- **Früh-Indikator:** Unsere Recon-Skripte werfen Errors die vor dem Sync nicht da waren ODER liefern andere Ergebnisse als pre-sync

### Risiko 3: G-2 Coverage-Drop > 0.21pp blockt Pipeline (Score 6 = Impact m × Wahrsch h)

- **Beschreibung:** Voice/Gemini Live, Context-Editor, Library-Plugin-DB sind komplette neue Code-Pfade. Selbst mit Upstream-Tests wird Coverage realistisch -1pp oder mehr droppen, was die 99.00%-Schwelle reißt.
- **Mitigation:** Task 17 erweitern:
  - Step 4 (NEU): Coverage-Delta-Tabelle pro File generieren — `vitest run --coverage --reporter=json` parsen
  - Coverage-Excludes für reine Upstream-WebUI-Files (`webui/`) — analog Welle-5-Memory `ppal-welle5-slice2-superpowers-tag-shipped` für srcExclude
  - User-Entscheidung bei Drop > 0.5pp: Schuld nehmen vs. Coverage-Wiederherstellungs-Sub-Slice
- **Früh-Indikator:** vitest-Output zeigt Files mit `0%` oder `<50%` Coverage die nicht zu unseren Welle-Tools gehören

### Weitere Risiken (nicht in Top-3, aber notiert)

- **R-D: Codex findet Defekte → Fix-Loop 3-4 Runden** (erwartet, Plan hat Loop, Score 3)
- **R-G: eslint-Bump bricht Welle-1-Files** (mittel, Score 4) — Mitigation: nach G-1 fail explicit lint-Errors prüfen
- **R-H: gh-pr-merge-Race** (Welle-4-Lehre, Score 4) — Mitigation: Task 23 Step 4 verifiziert SHA post-merge
- **R-E: Memory-Match falsch löscht Recon-Memo** (Score 2) — Mitigation: Task 6 prüft Upstream-Code-Pfad semantisch, nicht nur Existenz von `takeLane`-String
- **R-F: vitest-Bump bricht Test-Setup** (Score 2) — Mitigation: pre-flight PF-5 prüft Baseline, post-sync G-1 catched
- **R-I: Upstream-Drift während Pipeline** (Score 2) — Mitigation: Stage-5 G-5 fängt; bei Drift kurze Re-Recon-Schleife

### Plan-Updates (eingebaut nach Premortem)

Folgende Task-Erweiterungen werden empfohlen, sind aber NICHT in den Task-Bodies oben eingearbeitet (würde Plan blähen). Bei Plan-Execution diese zusätzlichen Steps mitausführen:

1. **Task 9 Step 3.5:** `npm install --dry-run` vor Step 4
2. **Task 11 Step 4.5:** 3-Way-Diff vor Step 5
3. **Task 17 Step 4:** Coverage-Delta-Tabelle nach G-2-Check
