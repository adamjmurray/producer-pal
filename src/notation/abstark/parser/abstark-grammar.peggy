// Abstark notation grammar.
//
// Durations are absolute note values (/4 = quarter note, /8 = eighth, etc.),
// NOT an ABC-style multiplier of a unit length.
//
// Two timing models coexist by line type — do not carry grid-thinking into a
// melody line:
//   Drums:              positional — every non-whitespace non-barline character
//                       is one 16th-note step; whitespace is visual grouping only.
//   Bass / melody / chords: event-based — duration is explicit (/N); whitespace
//                       between tokens has NO rhythmic meaning.
//
// Generated into generated-abstark-parser.js by `npm run parser:build`.
// Types for the produced AST live in generated-abstark-parser.d.ts.

Start
  = _ sections:Section+ _ { return sections; }

Section
  = DrumSection
  / PitchedSection

// --- Section headers ---

DrumSection
  = name:DrumName _h ":" _h content:DrumContent _ {
      return { type: name.name, midi: name.midi, content: content };
    }

PitchedSection
  = lineType:PitchedLineType _h dur:LineDefaultDuration? _h ":" _h content:PitchedContent _ {
      return { type: lineType, defaultDuration: dur, content: content };
    }

// Optional /N in the pitched-line header sets the line's default duration.
LineDefaultDuration
  = "/" n:DurationN { return n; }

PitchedLineType
  = "melody"i { return "melody"; }
  / "bass"i   { return "bass"; }
  / "chords"i { return "chords"; }

// --- Drum content (positional, 16th-note grid) ---
// Each DrumToken character advances one 16th step.
// Whitespace and barlines do NOT advance time.

DrumContent
  = items:(DrumToken / BarMarker / [ \t]+ { return null; })* {
      return items.filter(function(item) { return item !== null; });
    }

DrumToken
  = "^" { return { type: "hit", velocity: "accent" }; }
  / "X" { return { type: "hit", velocity: "normal" }; }
  / "x" { return { type: "hit", velocity: "soft" }; }
  / "." { return { type: "rest" }; }

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
  / "/" n:DurationN { return { type: "duration", value: n }; }
  / "!"  { return { type: "dynamic",   value: "accent" }; }
  / "?"  { return { type: "dynamic",   value: "soft" }; }

// Rest token: z (case-insensitive) with optional /N duration.
RestToken
  = "z"i dur:("/" n:DurationN { return n; })? {
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
  = "/" n:DurationN { return { type: "duration", value: n }; }
  / "!"  { return { type: "dynamic", value: "accent" }; }
  / "?"  { return { type: "dynamic", value: "soft" }; }

// Absolute note value: 1=whole, 2=half, 4=quarter, 8=eighth, 16=sixteenth.
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

DrumName
  = ("kick"i    / "bd"i)  { return { name: "kick",    midi: 36 }; }
  / ("snare"i   / "sd"i)  { return { name: "snare",   midi: 38 }; }
  / ("hihat"i   / "hh"i)  { return { name: "hihat",   midi: 42 }; }
  / ("open"i    / "oh"i)  { return { name: "open",    midi: 46 }; }
  / ("tom1"i    / "ht"i)  { return { name: "tom1",    midi: 47 }; }
  / ("tom2"i    / "mt"i)  { return { name: "tom2",    midi: 45 }; }
  / ("tom3"i    / "lt"i)  { return { name: "tom3",    midi: 43 }; }
  / ("ride"i    / "rc"i)  { return { name: "ride",    midi: 51 }; }
  / ("crash"i   / "cc"i)  { return { name: "crash",   midi: 49 }; }
  / ("clap"i    / "cl"i)  { return { name: "clap",    midi: 39 }; }
  / ("rimshot"i / "rs"i)  { return { name: "rimshot", midi: 37 }; }

_h "horizontal whitespace"
  = [ \t]*

_ "whitespace"
  = [ \t\n\r]*
