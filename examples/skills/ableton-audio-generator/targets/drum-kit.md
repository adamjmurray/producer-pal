# Target: drum kit

A set of one-shots mapped across Drum Rack pads, playable immediately. This is
`simpler-sample.md` repeated — read that first; every format rule there applies
to every voice here. What this doc adds is the pad mapping and the one-call rack
build.

Fully automated. Each pad's Simpler is auto-created and loaded in a single
`ppal-create-device` call.

## Format

Per voice, exactly as in `simpler-sample.md`: **mono, `int16`, normalized,
declicked with no fade-in.** Nothing about being in a rack changes that.

What is different is that the voices are heard **against each other**:

- Normalize to a **shared scheme**, not blindly to the same peak. A kick and a
  closed hat both at 0.9 puts the hat absurdly forward. Normalize each to a
  sensible ceiling, then apply per-voice trims so the kit balances.
- Keep decays **proportional**. Closed hat shorter than open hat, tom longer
  than rim. These relationships are what make a kit sound like a kit.
- Vary the noise. If every voice draws from the same `Math.random()` character,
  the kit sounds like one instrument. Filter differently per voice.

## Pad mapping

Pad names are note names, Ableton's `C1` = MIDI 36. General MIDI convention for
the bottom rows of a default Drum Rack:

| Pad   | MIDI | Conventional voice |
| ----- | ---- | ------------------ |
| `C1`  | 36   | kick               |
| `C#1` | 37   | rim / side-stick   |
| `D1`  | 38   | snare              |
| `D#1` | 39   | clap               |
| `F1`  | 41   | low tom            |
| `F#1` | 42   | closed hat         |
| `G#1` | 44   | pedal hat          |
| `A1`  | 45   | high tom           |
| `A#1` | 46   | open hat           |

Follow it when the kit is conventional — drummers and MIDI clips expect it.
Break it freely when the kit isn't (a kit of eight found-object hits owes GM
nothing), and say so, so the user knows what to play.

## Landing it in Live

One call builds the rack and every pad. The `pNOTE/d0/sample` param name
addresses the device at slot `d0` inside pad `NOTE`, auto-creating that pad's
Simpler:

```bash
node ../producer-pal/ppal.mjs ppal-create-device \
  '{"deviceName":"Drum Rack","path":"t0","params":[
     {"name":"pC1/d0/sample","value":"/abs/path/kick.wav"},
     {"name":"pD1/d0/sample","value":"/abs/path/snare.wav"},
     {"name":"pF#1/d0/sample","value":"/abs/path/hat-closed.wav"}]}'
```

`path` must be a **MIDI** track. A generator script that prints exactly this
object on stdout can be piped straight through — see `examples/example-kit.mjs`
for that shape, and note the status messages go to stderr so stdout stays clean
JSON.

## Working method

Do not render sixteen voices and hand over a rack. Kits are where
generate-once-and-declare-victory hurts most, because a kit is judged as a whole
and a single wrong hat ruins it.

Better: render the kick and snare first, land them, let the user hear those two
against their track, then build outward. The corrections you get on the first
two voices ("less click", "shorter tail") almost always apply to the rest, and
getting them early saves re-rendering everything.

## Gotchas

- **MIDI track required** — a Drum Rack is an instrument.
- **`#` in pad names is fine** in the param name (`pF#1/d0/sample`), but keep it
  out of filenames.
- **Re-running overwrites** the `.wav` files in the output directory. Use a new
  kit folder per variation, or you will silently replace samples the user
  already approved and the rack will change under them.
- **A pad with no sample is not an error** — it just doesn't sound. If a voice
  is missing, check the filename you passed, not the rack.
