# Design: ppal-render-export Runbook (Welle 3 Slice 1)

**Datum:** 2026-05-20 **Status:** GO (Computer-Use-Recon verifiziert 2026-05-20)
**Welle:** 3 (Computer-Use-Bridge, Eimer C) **Tool:** neues `ppal-render-export`
(Tool-Kategorie `runbook/`)

## Ziel

Neuer Tool-Typ "Runbook" — ein MCP-Tool, das KEIN Live-API-Call macht, sondern
einen deterministischen Schritt-Plan (JSON) zurueckgibt, den Claude ueber sein
`computer-use` MCP gegen Ableton Live ausfuehrt. Damit erreichen wir den
Render-Export-Workflow ("Audio/Video exportieren") in Live, der weder im LOM
noch in der `.als`-Byte-Struktur erreichbar ist (Eimer C, Render-Engine).

| Aspekt          | Beschreibung                                                              |
| --------------- | ------------------------------------------------------------------------- |
| Eingabe         | Format/Bit-Tiefe/Sample-Rate/Render-Range/Pfad/Optionen                   |
| Ausgabe         | JSON mit `steps[]`, `failModes[]`, `verify{}` und `meta{}`                |
| Ausfuehrungsart | Claude konsumiert das JSON und faehrt es ueber `mcp__computer-use__*` aus |
| Lokalisierung   | Locale-unabhaengig: Tastenkuerzel + Pixel-Positionen, keine UI-Strings    |
| Determinismus   | Step-Generation = pure Funktion (input → output), 100% testbar            |

## Recon (Welle-3-Pattern: Computer-Use-Smoke)

Folgendes wurde mit `mcp__computer-use__*` gegen Ableton Live 12 Suite
(DE-lokalisiert) live verifiziert am 2026-05-20:

### R1 — Dialog-Trigger

- `Cmd+Shift+R` oeffnet den Export-Dialog. Locale-unabhaengig (Hotkey).
- Dialog-Titel DE: "Audio/Video exportieren"; EN: "Export Audio/Video".

### R2 — Dialog-Layout (Pixel-Anker, getroffen auf 1366×860-Backbuffer)

| Feld                   | DE-Label                        | x ≈ | y ≈ | Form          |
| ---------------------- | ------------------------------- | --- | --- | ------------- |
| Gerenderte Spur        | "Gerenderte Spur"               | 745 | 211 | Dropdown      |
| Rendering-Start        | "Rendering-Start"               | 766 | 231 | bar.beat.16th |
| Rendering-Laenge       | "Rendering-Laenge"              | 766 | 251 | bar.beat.16th |
| Returns+Master         | "Mit Return- & Master-Effekten" | 776 | 295 | Toggle An/Aus |
| Als Loop rendern       | "Als Loop rendern"              | 776 | 315 | Toggle An/Aus |
| In Mono konvertieren   | "In Mono konvertieren"          | 776 | 335 | Toggle An/Aus |
| Normalisieren          | "Normalisieren"                 | 776 | 355 | Toggle An/Aus |
| Analyse-Datei erzeugen | "Analyse-Datei erzeugen"        | 776 | 375 | Toggle An/Aus |
| Sampling-Frequenz      | "Sampling-Frequenz"             | 763 | 395 | Dropdown      |
| PCM-Encodierung        | "PCM-Encodierung"               | 776 | 460 | Toggle An/Aus |
| Datei-Typ              | "Datei-Typ"                     | 763 | 480 | Dropdown      |
| Bit-Tiefe              | "Bit-Tiefe"                     | 776 | 499 | Dropdown      |
| Dither-Optionen        | "Dither-Optionen"               | 763 | 519 | Dropdown      |
| MP3-Encodierung        | "MP3-Encodierung (CBR 320)"     | 776 | 563 | Toggle An/Aus |
| Video erzeugen         | "Video erzeugen"                | 776 | 607 | Toggle An/Aus |
| Exportieren            | Button                          | 655 | 683 | Button        |
| Abbrechen              | Button                          | 719 | 683 | Button        |

### R3 — Dropdown-Werte

- **Datei-Typ**: WAV / AIFF / FLAC (PCM-Encodierung muss An sein)
- **Bit-Tiefe**: 16/24/32 (klassische PCM-Tiefen)
- **Sampling-Frequenz**: 44100 / 48000 / 88200 / 96000 / ... (vom Live-Set
  abhaengig; UI zeigt den aktuellen Projekt-Wert mit Hinweistext "Das Projekt
  wird mit XXXXX Hz gerendert.")
- **MP3**: separater Toggle (CBR 320 fixed), schliesst PCM-Encodierung NICHT aus
  (beide gleichzeitig schreibt PCM + MP3 raus).
- **Dither**: Triangular (Default) / weitere Optionen je nach Live-Build.

### R4 — Live-Dropdown-Bedienverhalten (wichtig fuer Recipe!)

Im Render-Dialog bleibt das Datei-Typ-Dropdown **persistent offen**, nachdem es
einmal geklickt wurde. Es schliesst erst, wenn:

- ein Eintrag in der Liste angeklickt wird (= Wert uebernommen)
- ODER der Abbrechen-Button geklickt wird (ein Klick schliesst zuerst nur das
  Dropdown, der zweite den Dialog).

Konsequenz fuers Runbook: Nach Dropdown-Open IMMER explizit ein Listen-Item
klicken (oder Aenderung verwerfen + zweimal Abbrechen). Kein `Escape` oder
Klick-ausserhalb-Schliessen wie bei macOS-Standard-Popups.

### R5 — Save-As-Dialog (nach "Exportieren")

Wurde nicht live durchgefahren (echtes Rendern haette Disk-Schreiben
ausgeloest). Aus dem Playbook §5 sind die Tastenkuerzel bekannt:

- `Cmd+Shift+G` oeffnet "Gehe zu Ordner" → Pfad-Eingabe
- `Cmd+A` + `type` ueberschreibt Dateinamen-Feld
- `Return` bestaetigt
- Live legt Output unter dem gewaehlten Pfad an

## Schema

```ts
{
  format: z.enum(["wav", "aiff", "flac", "mp3"]),
  bitDepth: z.coerce.number().int().optional(),  // 16 | 24 | 32; nur bei PCM
  sampleRate: z.coerce.number().int().optional(), // 44100 etc.; default = Projekt-Wert
  destPath: z.string(),                          // absoluter Pfad inkl. Dateiname
  renderTrack: z.string().optional(),            // "Main" default
  renderStart: z.string().optional(),            // bar.beat.16th; default = current Insert Marker
  renderLength: z.string().optional(),           // bar.beat.16th; default = Loop-Bracket / Selection
  includeReturnsAndMaster: z.boolean().optional(),
  asLoop: z.boolean().optional(),
  mono: z.boolean().optional(),
  normalize: z.boolean().optional(),
  createAnalysisFile: z.boolean().optional(),
  dither: z.enum(["triangular", "rectangular", "pow-r-1", "pow-r-2", "pow-r-3", "none"]).optional(),
}
```

## Output

```ts
{
  steps: Step[];               // atomic action list in execution order
  failModes: FailMode[];       // dokumentierte Fehlerszenarien
  verify: VerifyChecks;        // post-render Checks
  meta: {
    tool: "ppal-render-export";
    version: "1.0.0";
    abletonLocale: "de" | "en" | "unknown";
    estimatedSeconds: number;  // grobe Schaetzung Render + Disk
  };
}

type Step =
  | { action: "key"; text: string }
  | { action: "wait"; duration: number }
  | { action: "left_click"; coordinate: [number, number]; label: string }
  | { action: "type"; text: string; label: string }
  | { action: "screenshot"; label: string };       // optional verification Snapshots

type FailMode = {
  symptom: string;
  detect: string;     // wie Claude den Modus erkennt
  recovery: string;   // empfohlener Recovery-Pfad
};
```

## Step-Plan (kompakt, fuer Default-WAV-24bit-44.1kHz)

1. `key "cmd+shift+r"` → Dialog auf
2. `wait 0.4` Settle
3. `screenshot` Recon-Anker
4. (optional) Datei-Typ klicken (763,480), dann WAV anklicken (~ 763,495)
5. (optional) Bit-Tiefe klicken (776,499), 24 anklicken
6. `left_click (655, 683) Exportieren` → Save-Dialog
7. `wait 0.5`
8. `key "cmd+shift+g"` Pfad-Dialog
9. `type <destPath-dir>`
10. `key "Return"`
11. `key "cmd+a"` Dateiname auswaehlen
12. `type <destFilename>`
13. `key "Return"` → Render startet
14. `wait estimatedSeconds`
15. `screenshot` Render-Done-Beleg

## Fail-Modes (dokumentiert)

| Symptom                        | Detect                                   | Recovery                                    |
| ------------------------------ | ---------------------------------------- | ------------------------------------------- |
| Dialog oeffnet sich nicht      | Screenshot nach Step 2 zeigt keinen      | Live-State pruefen, Producer-Pal Connected? |
|                                | "Audio/Video"-Titel                      | Hat Live Focus? Erneut Cmd+Shift+R          |
| Dropdown bleibt offen          | Screenshot zeigt aufgeklappte Liste      | Listen-Item klicken (kein Escape!)          |
| Save-Dialog kommt nicht        | Kein Standard-macOS-File-Dialog          | Render-Range zu kurz? Setting pruefen       |
| "Datei existiert"-Prompt       | Modaler Sheet                            | Abbrechen + neuer Dateiname                 |
| Live zeigt Beta-Render-Warning | Modal "Bounce engine"                    | User-Decision, NICHT autonom klicken        |
| Render-Range = 0.0.0           | Rendering-Laenge zeigt 0.0.0             | renderLength explizit setzen, sonst no-op   |
| Pfad inexistent                | Save-Dialog zeigt "Pfad existiert nicht" | Cmd+Shift+G erneut, Parent-Dir setzen       |
| macOS-Lokalisierung weicht ab  | Pixel-Anker treffen nicht                | abletonLocale="unknown", User-Pass anbieten |

## Verify

Post-Render:

- `verify.destPath` exists on disk (Bash-Side, nicht durch Tool)
- `verify.size > 0`
- optional `verify.duration` via ffprobe (out-of-band)

## Was das Tool NICHT tut

- Kein Live-API-Call (kein `LiveAPI.from(...)`)
- Keine echte Dateischreibung (Claude faehrt das durch Computer-Use)
- Keine Locale-Erkennung (User waehlt explizit oder default "unknown")
- Keine Verifikation der Render-Ausgabe (das macht Claude/Bash-Side)

## Edge-Cases

- `format: "mp3"` + `bitDepth`: bitDepth ignoriert (mit `console.warn`).
- `format: "wav"` + `dither: "none"`: erlaubt; Dither-Toggle deaktivieren.
- `renderStart > renderLength == 0`: explizit fail-mode emittieren.
- `destPath` ohne Verzeichnis: relative-Pfad erlaubt, Step-Plan nutzt Cwd.

## Tests (Vitest)

Mindestens:

1. Default-WAV-24/44.1: erzeugt korrekte Step-Sequenz
2. AIFF-16: Datei-Typ-Klick + Bit-Tiefe-Klick eingefuegt
3. FLAC: Datei-Typ-Klick auf FLAC
4. MP3: KEIN PCM-Path, nur MP3-Toggle + Save-Dialog
5. Normalize + Mono: Toggles vor Exportieren eingefuegt
6. RenderStart + RenderLength explizit
7. Locale="en": Pixel-Anker bleiben gleich (locale-unabhaengig)
8. Invalid bitDepth (z.B. 8) → throw oder schema-validation-fail
9. failModes-Array immer 8+ Eintraege
10. meta.estimatedSeconds > 0
11. Schema-Validation: missing destPath → fail
12. Step-Order: cmd+shift+r ALWAYS first

## Out-of-Scope

- echte Locale-Erkennung (eigener Recon-Slice)
- Multi-Pass-Render (Stems)
- Render-Queue-Workflow
- Format-Konversion nach Render

## Reaktivierung dieser Recon falls Pixel-Anker driften

Tool-Output `meta.failModes` referenziert den Anchor-Drift-Fall. Erweiterte
Recon kann Welle-3-Update werden.
