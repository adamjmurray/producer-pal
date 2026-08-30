// Stark notation grammar.
//
// Stark is a literal, round-trippable notation. Every line is event-based: it
// spells timing with explicit /N durations, not a positional 16th-note grid.
// Line types split along a literal-vs-symbolic axis:
//   melody / bass — LITERAL pitches: single notes and [..] bracket stacks.
//   chords        — SYMBOLIC: chord symbols (Cm7, G7/B) realized into notes.
//   drums         — a melody line whose tokens are drum hits at a fixed pitch.
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
  / ChordsSection
  / MelodyBassSection

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
// absolute pitch name (e.g. C1, Gb2). Named drums carry their fixed GM pitch in
// the grammar; pitch-name headers are captured verbatim and resolved by the
// interpreter's drumHeaderPitch.
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

// A chords line is SYMBOLIC: each token is a chord symbol (Cm7, G7/B, Fmaj9) the
// interpreter realizes into concrete notes. Unlike melody/bass it takes no bare
// single notes or [..] bracket voicings — those belong on a melody/bass line.
ChordsSection
  = "chords"i _h dur:LineDefaultDuration? _h ":" _h content:ChordsContent _ {
      return { type: "chords", defaultDuration: dur, content: content };
    }

// A melody or bass line is LITERAL: single notes and [..] bracket stacks spelled
// exactly. melody and bass differ only in register default (C3=60 vs C1=36).
MelodyBassSection
  = lineType:MelodyBassLineType _h dur:LineDefaultDuration? _h ":" _h content:PitchedContent _ {
      return { type: lineType, defaultDuration: dur, content: content };
    }

// Optional /N in a line header sets the line's default duration.
LineDefaultDuration
  = "/" d:Duration { return d; }

MelodyBassLineType
  = "melody"i { return "melody"; }
  / "bass"i   { return "bass"; }

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
  = velocity:DrumVelocity dur:("/" d:Duration { return d; })? rep:Repeat? {
      return { type: "hit", velocity: velocity, duration: dur, repeat: rep };
    }

DrumVelocity
  = "^" { return "accent"; }
  / "X" { return "normal"; }
  / "x" { return "soft"; }

// --- Pitched content (event-based, whitespace-tokenized) ---
// Whitespace between tokens has no rhythmic meaning.
// Applies to melody and bass lines (chords lines are symbolic — see below).

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
// optional absolute octave + any-order suffix modifiers (octave marks,
// /duration, dynamic).
// The accidental must immediately follow the letter so that `Cb` = C-flat while
// a bare `b` = note B — this is the load-bearing rule that makes accidentals
// unambiguous in a whitespace-tokenized stream.
NoteToken
  = letter:[A-Ga-g] acc:[#b]? oct:AbsoluteOctave? suffixes:NoteTokenSuffix* rep:Repeat? {
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
        octave: oct,
        octaveShift: octaveShift,
        duration: duration,
        dynamic: dynamic,
        repeat: rep
      };
    }

// Absolute octave number on a note token: `C3` = Ableton C3 (MIDI 60), pinning
// the pitch instead of placing it relative to the line register. Unambiguous
// because a digit can otherwise only follow `/` (duration) or `*` (repeat), so
// the slot right after letter+accidental is free. NOT available on a chords line
// — there the digits are chord qualities (`C7`, `C9`), which win.
AbsoluteOctave
  = digits:$("-"? [0-9]+) { return parseInt(digits, 10); }

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
  = "z"i dur:("/" d:Duration { return d; })? rep:Repeat? {
      return { type: "rest", duration: dur, repeat: rep };
    }

// Bracket chord: [<note> <note> ...] with optional /duration and dynamic.
// Notes inside are space-separated; duration and dynamic apply to the whole chord.
ChordToken
  = "[" _h notes:ChordNote+ _h "]" suffixes:ChordSuffix* rep:Repeat? {
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
        dynamic: dynamic,
        repeat: rep
      };
    }

// Individual note inside a bracket chord: letter + optional accidental +
// optional absolute octave + optional octave marks. Trailing _h consumes
// inter-note whitespace inside the bracket.
ChordNote
  = letter:[A-Ga-g] acc:[#b]? oct:AbsoluteOctave? octaves:[',]* _h {
      var shift = 0;
      for (var i = 0; i < octaves.length; i++) {
        shift += octaves[i] === "'" ? 1 : -1;
      }
      return {
        letter: letter.toUpperCase(),
        accidental: acc,
        octave: oct,
        octaveShift: shift
      };
    }

ChordSuffix
  = "/" d:Duration { return { type: "duration", value: d }; }
  / "!"  { return { type: "dynamic", value: "accent" }; }
  / "?"  { return { type: "dynamic", value: "soft" }; }

// --- Chords content (event-based, whitespace-tokenized) ---
// A chords line holds polyphony spelled either way: a bare token is a chord
// SYMBOL the interpreter realizes into notes (`Cm7`, bare = major triad), and a
// [..] bracket is an explicit voicing (voiced in the chord register). The bracket
// disambiguates, so `C` (symbol → C major) and `[C]` (literal single note)
// coexist. Bare single NOTES are not a thing here — a bare token is always a
// symbol; put literal single-note lines on melody/bass.

ChordsContent
  = items:ChordsContentItem* { return items; }

// Leading _h on each item handles the inter-token whitespace.
ChordsContentItem
  = _h item:ChordsItem { return item; }

ChordsItem
  = BarMarker
  / ChordToken
  / RestToken
  / ChordSymbolToken

// A chord symbol: root (letter + optional accidental, bound immediately like a
// note so `Ebm7` = Eb minor 7) + a quality string (`m7`, `maj9`, `7b9`; empty =
// major triad) + optional slash bass (`/B`) + the same octave/duration/dynamic
// suffixes and `*N` repeat as a note. `/`+letter is the slash bass, `/`+digit is
// a duration — disjoint, so `G7/B/2` = G7 over B, half note. The quality class
// stops at any suffix/terminator (`/ ' , ! ? * |`) and whitespace; the
// interpreter (not the grammar) validates the quality against the chord
// vocabulary and rejects unknowns with an error (so `CG` — a missing space —
// can't silently swallow the `G`).
//
// A `trailing` run of any leftover non-separator chars (up to whitespace or a
// `|` bar) is captured last so a malformed chord like `C6/9` or `C-7` — whose
// `/9`/`-7` can't lex as a duration/bass/suffix — is swallowed into ONE token
// the interpreter can name in its error message, rather than being left over to
// fail the parse with a cryptic position-only Peggy error.
// Any well-formed token leaves `trailing` empty, so this can't change valid input.
ChordSymbolToken
  = letter:[A-Ga-g] acc:[#b]? quality:$([A-Za-z0-9#+]*) bass:SlashBass? suffixes:NoteTokenSuffix* rep:Repeat? trailing:$([^ \t\r\n|]*) {
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
        type: "chordSymbol",
        root: letter.toUpperCase() + (acc || ""),
        quality: quality,
        bass: bass,
        octaveShift: octaveShift,
        duration: duration,
        dynamic: dynamic,
        repeat: rep,
        trailing: trailing
      };
    }

// Slash bass: `/` + a pitch letter (+ optional accidental). Distinct from a `/N`
// duration suffix because the char after `/` is a letter, not a digit.
SlashBass
  = "/" letter:[A-Ga-g] acc:[#b]? { return letter.toUpperCase() + (acc || ""); }

// Absolute note value with an optional trailing modifier: /4 = quarter (1 beat),
// /4. = dotted quarter (×1.5 = 1.5 beats), /4t = quarter triplet (×2/3 ≈ 0.667
// beats). At most one modifier — `.` (dotted) and `t` (triplet) are mutually
// exclusive and don't stack. The modifier binds tightly to its /N (no
// whitespace), so the freely ordered `' , ! ?` suffixes stay unambiguous.
// Returns { n, dotted, triplet }.
Duration
  = n:DurationN mod:("." / "t")? {
      return { n: n, dotted: mod === ".", triplet: mod === "t" };
    }

// Absolute note-value denominator: 1=whole, 2=half, 4=quarter, 8=eighth, 16=sixteenth.
// "16" is tried before "1" so the two-digit form is not short-circuited.
DurationN
  = "16" { return 16; }
  / "8"  { return 8; }
  / "4"  { return 4; }
  / "2"  { return 2; }
  / "1"  { return 1; }

// Token repeat: `*N` (N ≥ 1, no leading zero) expands the fully-formed token
// into N copies at interpret time (`X*16` = sixteen X hits, `Eb/8*4` = four
// eighth-note Ebs). Terminal — it follows every other suffix. Single-token only;
// there is no group repeat. Returns the integer count.
Repeat
  = "*" digits:$([1-9] [0-9]*) { return parseInt(digits, 10); }

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
