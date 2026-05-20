# Plan: ppal-cv-routing (Welle 1 Item 1/6)

**Datum:** 2026-05-20 **Spec:**
`docs/superpowers/specs/2026-05-20-ppal-cv-routing-design.md` **Status:**
Pre-Recon — wartet auf Fixture-Lieferung vom User **Branch (vorab geplant):**
`feat/ppal-cv-routing` von `origin/main`

## 1. Voraussetzungen (vor Code-Start)

| Schritt                                                      | Status  | Bemerkung                                                                  |
| ------------------------------------------------------------ | ------- | -------------------------------------------------------------------------- |
| Spec geschrieben                                             | DONE    | siehe Spec-Dokument                                                        |
| Recon-Diff-Tool gebaut                                       | DONE    | `scripts/recon-cv-routing-diff.mjs` (AIbleton-Root, nicht in producer-pal) |
| Fixtures `cv-fixture/{A,B,C[,D]}.als` geliefert              | PENDING | User-Geste in Live 12                                                      |
| Diff-Tool ausgewertet                                        | PENDING | nach Lieferung; entscheidet GO vs STOP                                     |
| `git ls-remote origin main` + `git reset --hard origin/main` | PENDING | vor Branch-Erstellung                                                      |

## 2. Recon-Auswertung (sofort nach Fixture-Lieferung)

```bash
node /Users/macuser/Desktop/AIbleton/scripts/recon-cv-routing-diff.mjs <fixture-dir>
```

Tool-Output entscheidet:

- **GO** wenn: gemeinsamer Upper, Target+Lower indizieren Channel, kein Leak in
  D
- **STOP** wenn: Upper enthaelt Interface-Display-Name oder Lower
  nicht-numerisch
- **AMBIVALENT** wenn: zusaetzliche Fixtures noetig → User-Frage

## 3. GO-Pfad — Code-Aenderungen (minimal-invasiv)

**Datei A: `src/automation/als-routing.ts`** (heute 236 Zeilen, +N
Vocabulary-Eintraege; keine Strukturaenderung).

Eintrag pro neuem Key in `ROUTING_TARGETS["audio-out"]`:

```ts
"ext-mono-3": {
  target: "<aus Fixture B>",
  upper: "<aus Fixture B>",
  lower: "<aus Fixture B>",
},
"ext-mono-4": {
  target: "<aus Fixture C>",
  upper: "<aus Fixture C>",
  lower: "<aus Fixture C>",
},
// ggf. weitere Channels falls Recon mehr abdeckt
```

**Datei B: `src/automation/tests/als-routing.test.ts`** Zeile 37 ("enthaelt
exakt die Recon-Tripel"): hardcoded Tabellen-Assertion mit den gleichen neuen
Eintraegen erweitern. **WICHTIG (Premortem R2)**: beide Tabellen muessen
byte-identisch synchron sein.

**KEIN Helper-File-Edit, KEIN CLI-Dispatch-Edit.** Test-Infrastruktur greift
automatisch:

- `describe.each` ueber alle Tripel im Roundtrip-Test
- "andere 3 Routings byte-unveraendert" Voll-XML-Diff
- kind↔key-Konsistenz-Throw bestehend

## 4. STOP-Pfad — Doku statt Code

- `docs/superpowers/specs/2026-05-20-ppal-cv-routing-STOP-verdict.md` schreiben
  (analog `…-crossfade-expert-STOP-verdict.md`).
- Inhalt: Recon-Bytes-Auszug, Leak-Beweis, Begruendung warum closed vocabulary
  nicht moeglich.
- Memory-Eintrag `ppal-cv-routing-stop-verdict.md`.
- NEXT-GOAL.md aktualisieren: Item 1/6 als STOP entschieden.

## 5. Subagent-TDD-Prompt (GO-Pfad, vorformuliert)

> Slice: ppal-cv-routing (Vocabulary-Erweiterung). Branch: feat/ppal-cv-
> routing. Erweitere `src/automation/als-routing.ts`
> `ROUTING_TARGETS ["audio-out"]` um genau folgende Eintraege (byte-belegt aus
> Recon- Fixtures):
>
> [INSERT-RECON-BYTE-TRIPEL-HIER]
>
> Spiegele dieselben Eintraege in der Hard-Coded-Assertion in
> `src/automation/tests/als-routing.test.ts` Block "enthaelt exakt die
> Recon-Tripel". WICHTIG: beide Tabellen muessen identisch sein, sonst
> Test-Fail.
>
> KEINE anderen Datei-Aenderungen. KEIN Helper-Code, KEIN Dispatch, KEINE
> Schema-Aenderung. Vor Commit: `npm run fix && npm run check` mit
> arm64-Node-v24:
> `export PATH=/Users/macuser/.nvm/versions/node/v24.15.0/bin:$PATH`. Branch-Cov
> muss ≥ 95.53% bleiben (Vocabulary-Eintraege addieren keine Branches, also
> stabil). Plain `git commit` (kein --no-verify), gezielte `git add` Pfadliste.

## 6. Stage-1-Review (eigenes)

`superpowers:requesting-code-review` — Fokus:

- Tripel-Werte byte-genau gegen Fixtures B/C verifiziert?
- Test-Assertion-Tabelle synchron zu ROUTING_TARGETS?
- npm run check Exit 0, Cov-Threshold gehalten?
- Voll-XML-Diff bei Roundtrip leer ausserhalb des Routing-Blocks?

## 7. Stage-2-Review via codex:rescue (PFLICHT)

`codex:rescue` mit dem PR-Branch. Nicht report-glaeubig — jeden Finding selbst
verifizieren. Bekannte Defekt-Klassen die Codex schon mal in diesem Repo fand:
ungebundene Regex, Silent-Mis-Target, kind-Verwechslung,
Display-String-Inkonsistenz mit Target.

## 8. Verify-Gate

```bash
export PATH=/Users/macuser/.nvm/versions/node/v24.15.0/bin:$PATH
npm run fix && npm run check
# erwartet: Exit 0, branch-cov >= 95.53%
```

## 9. PR + Merge

- Branch: `feat/ppal-cv-routing` von echtem `origin/main` (`git ls-remote` +
  `reset --hard` + `rev-parse` verify).
- PR-Titel (GO):
  `ppal-cv-routing: CV-Out Vocabulary-Erweiterung (N Channels byte-belegt)`.
- PR-Titel (STOP):
  `ppal-cv-routing: STOP-Verdict (Item 1/6 dokumentierte Grenze)`.
- Merge: bei User-Wort oder bei Mandat autonom.

## 10. Memory + NEXT-GOAL

- Memory `ppal-cv-routing-shipped.md` (GO) ODER
  `ppal-cv-routing-stop-verdict.md` (STOP).
- NEXT-GOAL.md aktualisieren: Item 1/6 entschieden, Item 2 in_progress.
- TaskUpdate #1 -> completed, #2 -> in_progress.

## Premortem-Analyse

```
Risiko 1: Interface-Display-Name-Leak in Fixtures (STOP-Trigger)
  Impact: HOCH
  Wahrscheinlichkeit: HOCH
  Beschreibung: Lives UpperDisplayString koennte Hardware-Device-Name
    enthalten ("MOTU UltraLite Out 3", "ES-8 Out 1") — closed
    vocabulary nicht haltbar, STOP statt GO.
  Mitigation: STOP-Pfad ist legitimer Slice-Abschluss laut Goal-Spec
    ("gemergt ODER STOP-Verdict"). Recon-Diff-Tool detektiert Leak
    via generics-Whitelist. D-Fixture (anderes Device) bestaetigt.
  Frueh-Indikator: Diff-Tool Output meldet `upperGeneric=false` oder
    `[LEAK?]`.

Risiko 2: Hard-Coded-Test-Assertion-Drift (silent-broken)
  Impact: MITTEL
  Wahrscheinlichkeit: MITTEL
  Beschreibung: `als-routing.test.ts` Z37 "enthaelt exakt die Recon-
    Tripel" ist eine deepEqual-Tabelle gegen ROUTING_TARGETS. Wird
    nur eine Seite (Modul oder Test) erweitert, Test-Fail. Subagent
    koennte fix mit haendischer Synchronisation ohne semantisches
    Verstaendnis.
  Mitigation: Subagent-Prompt EXPLIZIT auf beide Seiten + byte-Identitaet
    zu Fixtures. Stage-1-Review-Punkt: "ist Test-Tabelle == ROUTING_
    TARGETS == Fixture-Bytes?".
  Frueh-Indikator: Test-Fail "expected length X, got Y" oder "deepEqual
    diff".

Risiko 3: Naming-Konvention 0-based Target vs 1-based GUI/Lower
  Impact: MITTEL
  Wahrscheinlichkeit: NIEDRIG
  Beschreibung: Heute existiert `ext-mono` mit `target: "AudioOut/
    External/M0"` = Channel 1 (0-based Target, 1-based GUI). Bei
    neuen Channels (M2 = GUI 3, M3 = GUI 4) entsteht Verwirrungsgefahr
    fuer CLI-User: ist `ext-mono-3` der GUI-Name oder der Target-Index?
  Mitigation: Naming SPIEGELT GUI-Display ("ext-mono-3" matched "Mono
    Out 3" in Lives GUI). PR-Beschreibung erklaert die Konvention
    explizit. Hard-Coded ueber alle neuen Eintraege konsistent.
  Frueh-Indikator: Recon zeigt Lower="3" + Target="…/M2" → 1/0-Schema
    bestaetigt.

Gesamtrisiko: MITTEL
Empfehlung: Weiter wie geplant. Fixtures abwarten, Recon-Tool ausfuehren,
  dann GO/STOP entscheiden. R1 ist nicht abwendbar (Lives Verhalten),
  aber STOP ist akzeptabler Abschluss. R2/R3 sind handhabbar.
```
