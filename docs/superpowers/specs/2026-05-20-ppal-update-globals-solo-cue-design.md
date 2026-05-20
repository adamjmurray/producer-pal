# Design: ppal-update-globals Solo/Cue-Mode-Toggle (Welle 2 Slice 1)

**Datum:** 2026-05-20
**Status:** STOP (siehe `2026-05-20-ppal-update-globals-solo-cue-STOP-verdict.md`)
**Welle:** 2 (MCP-Tool-Erweiterung via LOM-Live-API)
**Tool:** `ppal-update-live-set` (im Goal konzeptuell "ppal-update-globals")

## Ziel

Erweiterung des MCP-Tools `ppal-update-live-set` um einen Parameter, der den
globalen Master-Section-Toggle "Solo" vs "Cue" steuert. Dieser Toggle bestimmt
in Ableton Lives Mixer-Logik, ob die Solo-Buttons der Tracks

- **Modus "Solo"** (in-place): den selektierten Track exklusiv hoerbar machen
  (andere Tracks werden gemutet), oder
- **Modus "Cue"** (PFL / Pre-Listen): den selektierten Track zusaetzlich auf
  den Cue-Output (separater Headphone-Bus) routen, ohne den Main-Output zu
  beeintraechtigen.

GUI-Position: kleiner Wahlschalter rechts neben dem Master-Track im Session-
und Arrangement-View, beschriftet "Cue" / "Solo".

## Angedachtes API-Design (rein hypothetisch, siehe STOP-Verdict)

```typescript
// In src/tools/live-set/update-live-set.def.ts inputSchema:
soloMode: z
  .enum(["solo", "cue"])
  .optional()
  .describe(
    'Solo button behavior: "solo" = in-place (mute others), ' +
    '"cue" = PFL via cue out (pre-listen)',
  ),
```

Enum statt Boolean: zwei symmetrische Modi, keine "wahre" Default-Richtung.
Lesbarkeit erhoeht ggue. `cueOut: true/false`.

## Recon-Pattern (Welle 2)

Anders als Welle 1 (`.als`-Byte-Diff via Computer-Use-Fixtures) ist das
Recon-Pattern hier **Live-Object-Model-Introspection** gegen ein geoeffnetes
Set via `scripts/ppal-client.ts` REST-Aufruf an `ppal-raw-live-api`. Property
existiert oder existiert nicht.

## Vorab-Konstanten

- `arm64-Node-v24` PATH-Prefix
  (`$HOME/.nvm/versions/node/v24.15.0/bin`)
- `npm run check` muss Exit 0
- Branch-Coverage `>= 95.53%`
- jscpd `src/0.25`, `scripts/0.5`
- Plain `git commit` (kein `--no-verify`)
- Gezielte `git add`-Pfadliste
- Feature-Branch von echtem `origin/main`
  (d088cbd9 verifiziert via `git ls-remote`)
- Kein Worktree, current branch
- PR-Ziel: `elchuckobar/producer-pal`

## Vorab-Recon vor Implementierung

Vor jedem Spec-Commit ist zu pruefen, ob die LOM-Property tatsaechlich
existiert. Spekulationsverbot (analog Welle 1).

## Ergebnis

Recon ergab: **Property existiert nicht in der LOM.** Slice geht in
STOP-Verdict. Siehe `2026-05-20-ppal-update-globals-solo-cue-STOP-verdict.md`.
