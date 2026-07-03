// Stark notation grammar.
//
// Stark is a literal, round-trippable notation. Both section types are
// event-based: pitched (bass/melody/chords) lines and drum lines each spell
// timing with explicit /N durations (drums are a melody line whose tokens are
// drum hits at a fixed pitch), not a positional 16th-note grid.
//
// Durations are absolute note values (/4 = quarter note, /8 = eighth, etc.),
// with an optional trailing dot for a dotted (×1.5) value (/4. = dotted quarter,
// = 3 eighths). At most one dot; double-dots are not supported.
// In every line type here `/` introduces a duration and `|` is a visual barline
// (the inverse of legacy stark, where `/` was the bar marker).
//
// Generated into generated-stark-parser.js by `npm run parser:build`.
// Types for the produced AST live in generated-stark-parser.d.ts.

Start
  = _ sections:Section+ _ { return sections; }

Section
  = DrumSection
  / PitchedSection

// --- Section headers ---

// Event-based drum line. Mirrors PitchedSection: an optional header /N sets the
// line default duration; each token is a hit or rest with an optional glued
// inline /N override. Length is the sum of token durations (NOT bar-locked).
DrumSection
  = head:DrumHeader _h dur:LineDefaultDuration? _h ":" _h content:DrumContent _ {
      return {
        type: head.type,
        midi: head.midi,
        noteName: head.noteName,
        defaultDuration: dur,
        content: content
      };
    }

// A drum line is headed by either a fixed drum name (kick/snare/…) or an
// absolute pitch name (e.g. C1, Gb2). Named drums carry their fixed GM pitch
// in the grammar; pitch-name headers defer MIDI resolution to the interpreter
// (via pitch.ts, the single source of truth) so noteName is captured verbatim.
// Drum names are tried first so the named vocabulary wins when both could match.
DrumHeader
  = d:DrumName     { return { type: d.name, midi: d.midi, noteName: null }; }
  / n:DrumPitchName { return { type: n,     midi: null,   noteName: n }; }

// Absolute pitch name: letter + optional accidental + (optionally negative)
// octave number, e.g. C1, F#2, Gb-1. Ableton convention (C3 = MIDI 60) is
// applied by the interpreter/serializer, NOT here. Unambiguous against pitched
// lines (melody/bass/chords are keyword-led) and against drum aliases (those
// are two letters with no trailing digit).
DrumPitchName "drum pitch name"
  = $([A-Ga-g] [#b]? "-"? [0-9]+)

PitchedSection
  = lineType:PitchedLineType _h dur:LineDefaultDuration? _h ":" _h content:PitchedContent _ {
      return { type: lineType, defaultDuration: dur, content: content };
    }

// Optional /N in a line header sets the line's default duration.
LineDefaultDuration
  = "/" d:Duration { return d; }

PitchedLineType
  = "melody"i { return "melody"; }
  / "bass"i   { return "bass"; }
  / "chords"i { return "chords"; }

// --- Drum content (event-based, whitespace-tokenized) ---
// Whitespace between tokens has no rhythmic meaning. A token is a hit (^/X/x)
// or a rest (z); each may carry a glued /N; the line default applies otherwise.

DrumContent
  = items:DrumContentItem* { return items; }

// Leading _h on each item handles the inter-token whitespace.
DrumContentItem
  = _h item:DrumItem { return item; }

DrumItem
  = BarMarker
  / DrumToken
  / RestToken

// A drum hit at the line's fixed pitch. Velocity buckets match StarkDynamic so
// velocityFor() applies. Optional glued /N (like a pitched NoteToken) overrides
// the line default for this one hit.
DrumToken
  = velocity:DrumVelocity dur:("/" d:Duration { return d; })? {
      return { type: "hit", velocity: velocity, duration: dur };
    }

DrumVelocity
  = "^" { return "accent"; }
  / "X" { return "normal"; }
  / "x" { return "soft"; }

// --- Pitched content (event-based, whitespace-tokenized) ---
// Whitespace between tokens has no rhythmic meaning.
// Applies to bass, melody, and chords lines.

PitchedContent
  = items:PitchedContentItem* { return items; }

// Leading _h on each item handles the inter-token whitespace.
PitchedContentItem
  = _h item:PitchedItem { return item; }

PitchedItem
  = BarMarker
  / ChordToken
  / NoteToken
  / RestToken

// Pitched note token: letter + optional accidental (immediately after) +
// any-order suffix modifiers (octave marks, /duration, dynamic).
// The accidental must immediately follow the letter so that `Cb` = C-flat while
// a bare `b` = note B — this is the load-bearing rule that makes accidentals
// unambiguous in a whitespace-tokenized stream.
NoteToken
  = letter:[A-Ga-g] acc:[#b]? suffixes:NoteTokenSuffix* {
      var octaveShift = 0;
      var duration = null;
      var dynamic = "normal";
      for (var i = 0; i < suffixes.length; i++) {
        var s = suffixes[i];
        if (s.type === "octave")         octaveShift += s.value;
        else if (s.type === "duration")  duration = s.value;
        else if (s.type === "dynamic")   dynamic = s.value;
      }
      return {
        type: "note",
        letter: letter.toUpperCase(),
        accidental: acc,
        octaveShift: octaveShift,
        duration: duration,
        dynamic: dynamic
      };
    }

// Suffix modifiers: glyph classes are disjoint (' , vs /N vs ! ?),
// so any ordering is unambiguous — Eb''/8!, Eb/8''!, Eb!/8'' all parse identically.
NoteTokenSuffix
  = "'"  { return { type: "octave",    value:  1 }; }
  / ","  { return { type: "octave",    value: -1 }; }
  / "/" d:Duration { return { type: "duration", value: d }; }
  / "!"  { return { type: "dynamic",   value: "accent" }; }
  / "?"  { return { type: "dynamic",   value: "soft" }; }

// Rest token: z (case-insensitive) with optional /N duration.
RestToken
  = "z"i dur:("/" d:Duration { return d; })? {
      return { type: "rest", duration: dur };
    }

// Bracket chord: [<note> <note> ...] with optional /duration and dynamic.
// Notes inside are space-separated; duration and dynamic apply to the whole chord.
ChordToken
  = "[" _h notes:ChordNote+ _h "]" suffixes:ChordSuffix* {
      var duration = null;
      var dynamic = "normal";
      for (var i = 0; i < suffixes.length; i++) {
        var s = suffixes[i];
        if (s.type === "duration")  duration = s.value;
        else if (s.type === "dynamic")  dynamic = s.value;
      }
      return {
        type: "chord",
        notes: notes,
        duration: duration,
        dynamic: dynamic
      };
    }

// Individual note inside a bracket chord: letter + optional accidental + optional
// octave marks. Trailing _h consumes inter-note whitespace inside the bracket.
ChordNote
  = letter:[A-Ga-g] acc:[#b]? octaves:[',]* _h {
      var shift = 0;
      for (var i = 0; i < octaves.length; i++) {
        shift += octaves[i] === "'" ? 1 : -1;
      }
      return {
        letter: letter.toUpperCase(),
        accidental: acc,
        octaveShift: shift
      };
    }

ChordSuffix
  = "/" d:Duration { return { type: "duration", value: d }; }
  / "!"  { return { type: "dynamic", value: "accent" }; }
  / "?"  { return { type: "dynamic", value: "soft" }; }

// Absolute note value with an optional trailing dot: /4 = quarter (1 beat),
// /4. = dotted quarter (×1.5 = 1.5 beats). At most one dot — double-dots are not
// supported. The dot binds tightly to its /N (no whitespace), so the freely
// ordered `' , ! ?` suffixes stay unambiguous. Returns { n, dotted }.
Duration
  = n:DurationN dot:"."? { return { n: n, dotted: dot != null }; }

// Absolute note-value denominator: 1=whole, 2=half, 4=quarter, 8=eighth, 16=sixteenth.
// "16" is tried before "1" so the two-digit form is not short-circuited.
DurationN
  = "16" { return 16; }
  / "8"  { return 8; }
  / "4"  { return 4; }
  / "2"  { return 2; }
  / "1"  { return 1; }

// Visual/checking only — does not advance time in any line type.
BarMarker
  = "|" { return { barMarker: true }; }

// "snare2" is tried before "snare" so the longer name is not short-circuited by
// its prefix. tom1/2/3/4 run high→low (tom4 = GM Low Floor Tom, the lowest).
DrumName
  = ("kick"i    / "bd"i)  { return { name: "kick",    midi: 36 }; }
  / ("snare2"i  / "s2"i)  { return { name: "snare2",  midi: 40 }; }
  / ("snare"i   / "sd"i)  { return { name: "snare",   midi: 38 }; }
  / ("hihat"i   / "hh"i)  { return { name: "hihat",   midi: 42 }; }
  / ("pedal"i   / "ph"i)  { return { name: "pedal",   midi: 44 }; }
  / ("open"i    / "oh"i)  { return { name: "open",    midi: 46 }; }
  / ("tom1"i    / "ht"i)  { return { name: "tom1",    midi: 47 }; }
  / ("tom2"i    / "mt"i)  { return { name: "tom2",    midi: 45 }; }
  / ("tom3"i    / "lt"i)  { return { name: "tom3",    midi: 43 }; }
  / ("tom4"i    / "ft"i)  { return { name: "tom4",    midi: 41 }; }
  / ("ride"i    / "rc"i)  { return { name: "ride",    midi: 51 }; }
  / ("crash"i   / "cc"i)  { return { name: "crash",   midi: 49 }; }
  / ("clap"i    / "cl"i)  { return { name: "clap",    midi: 39 }; }
  / ("rimshot"i / "rs"i)  { return { name: "rimshot", midi: 37 }; }
  / ("perc1"i   / "p1"i)  { return { name: "perc1",   midi: 48 }; }
  / ("perc2"i   / "p2"i)  { return { name: "perc2",   midi: 50 }; }

_h "horizontal whitespace"
  = [ \t]*

_ "whitespace"
  = [ \t\n\r]*
