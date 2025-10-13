# Stark Notation

Ultra-minimal music notation for weak LLMs. Self-describing, scale-adherent,
minimal syntax.

## Format

```
type: content
```

**Types:**

- Drum names (`kick`, `snare`, `hihat`, etc.) → drums mode
- `bass` → mono mode, octave 1-3
- `melody` → mono mode, octave 3-5
- `chords` → chord mode, octave 3

**Examples:**

```
kick: X x X x
snare: . X . X
bass: C D E F G
melody: E G A / A G E
chords: C F G C
```

## Core Rule: Spacing = Timing

- **Whitespace between tokens** = quarter notes
- **No whitespace** = 16th notes
- Applies to all modes

---

## Drums Mode

### Format

```
drumname: pattern
drumname: pattern
```

### Tokens

- `X` = loud hit (velocity ~100-110)
- `x` = soft hit (velocity ~60-80)
- `^` = accent (velocity ~115-127)
- `-` = sustain
- `.` = rest
- `/` = next bar

### Drums (case-insensitive, GM Standard mapping)

**Essential:**

- `kick` / `bd` → C1 (MIDI 36)
- `snare` / `sd` → D1 (MIDI 38)
- `hihat` / `hh` → F#1 (MIDI 42)
- `open` / `oh` → A#1 (MIDI 46)

**Toms:**

- `tom1` / `ht` → B1 (MIDI 47) - high tom
- `tom2` / `mt` → A1 (MIDI 45) - mid tom
- `tom3` / `lt` → G1 (MIDI 43) - low tom

**Extras:**

- `ride` / `rc` → D#2 (MIDI 51)
- `crash` / `cc` → C#2 (MIDI 49)
- `clap` / `cl` → D#1 (MIDI 39)
- `rimshot` / `rs` → C#1 (MIDI 37)

---

## Mono Mode (Bass/Melody)

### Format

```
bass: C D E F G / G F E D C
```

```
melody: E G A / A G E
```

### Tokens

- `A-G`, `a-g` = note names (case = dynamics)
- `-` = sustain
- `.` = rest
- `/` = next bar

### Scale Adherence

- **Priority**: scale parameter → Live Set global scale → C Major
- Letters auto-apply scale accidentals
- No chromatic notes allowed
- Example in Ab Major: A → Ab, B → Bb, D → Db, E → Eb

### Octave Handling

- **bass**: default octave 2, range 1-3
- **melody**: default octave 4, range 3-5
- **Smart stepping**: notes choose closest interval to previous
  - `B C` → B3→C4 (half step) not B3→C3 (7th down)
  - If closest interval exceeds range, constrain to boundary
- No manual octave control

### Dynamics

- **Uppercase = louder** (velocity ~100-110)
- **Lowercase = quieter** (velocity ~60-80)

---

## Chords Mode

### Format

```
chords: C F G C
chords: C7 d7 G7 C
```

### Tokens

- `A-G`, `a-g` = chord root (case = dynamics)
- Optional `7` suffix = 7th chord
- `/` = next bar
- **Spaces required** between chords

### Scale Adherence

- **Priority**: scale parameter → Live Set global scale → C Major
- Root determines diatonic quality:
- In C Major: C→Cmaj, D→Dmin, E→Emin, F→Fmaj, G→Gmaj, A→Amin, B→Bdim

### Dynamics

- **Uppercase = louder** (velocity ~100-110)
- **Lowercase = quieter** (velocity ~60-80)
- Example: `C d e F` → loud C, quiet D/E, loud F

### 7th Chords

Scale degree determines type:

- I, IV → maj7
- ii, iii, vi → min7
- V → dom7
- vii → ø7 or dim7

### Voicing

- Root position, octave 3 (middle)

---

## Examples

### Quarter notes

```
kick: X x X x
bass: C E G C
chords: C F G C
```

### 16th notes

```
kick: X...x...X...x...
bass: CDEFGABCDEFGABC
melody: xxxxxxxxxxxxxxxx
```

### Mixed

```
kick: X x X x / X.x.X.x.
hihat: x x x x x x x x / xxxxxxxxxxxxxxxx
bass: C E G C / CDEFGABC
```

### Dynamics

```
kick: X x X x          (loud-soft pattern)
melody: C d e F        (accent on C and F)
chords: C f g C        (soft inner chords)
```

### Bar markers

```
kick: X x / X x / X x / X x
bass: C / E / G / C
melody: E G A / A G E / C E G / G E C
```

---

## Design Goals

✓ Minimal syntax for weak LLMs  
✓ Scale adherence removes theory burden  
✓ Consistent dynamics (case = loudness)  
✓ No arithmetic (smart stepping, auto-octaves)  
✓ Self-describing (mode from content)  
✓ One timing rule (spacing = quarters vs 16ths)
