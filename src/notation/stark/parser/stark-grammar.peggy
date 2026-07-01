// Stark notation grammar — ultra-minimal music notation for small-model mode.
// Generated into generated-stark-parser.js by `npm run parser:build`.
// Types for the produced AST live in generated-stark-parser.d.ts.

Start
  = DrumLines
  / BassLine
  / MelodyLine
  / ChordLine

DrumLines
  = first:DrumLine rest:([\n\r]+ DrumLine)* _ {
      return [first, ...rest.map((r) => r[1])];
    }

DrumLine
  = _ type:DrumName _ ":" _ content:DrumContent {
      return {
        type: type.name,
        midi: type.midi,
        content: content,
      };
    }

BassLine
  = _ "bass"i _ ":" _ content:NoteContent _ {
      return { type: "bass", content: content };
    }

MelodyLine
  = _ "melody"i _ ":" _ content:NoteContent _ {
      return { type: "melody", content: content };
    }

ChordLine
  = _ "chords"i _ ":" _ content:ChordContent _ {
      return { type: "chords", content: content };
    }

DrumContent
  = items:DrumContentItem+ { return items; }

DrumContentItem
  = BarMarker
  / token:DrumToken [ \t]+ { return { ...token, duration: "quarter" }; }
  / token:DrumToken { return { ...token, duration: "sixteenth" }; }

NoteContent
  = items:NoteContentItem+ { return items; }

NoteContentItem
  = BarMarker
  / token:NoteToken [ \t]+ { return { ...token, duration: "quarter" }; }
  / token:NoteToken { return { ...token, duration: "sixteenth" }; }

ChordContent
  = items:ChordContentItem+ { return items; }

ChordContentItem
  = BarMarker
  / token:ChordToken [ \t]+ { return { ...token, duration: "quarter" }; }
  / token:ChordToken { return { ...token, duration: "sixteenth" }; }

DrumToken
  = char:[Xx^.\-] {
      if (char === ".") return { type: "rest" };
      if (char === "-") return { type: "sustain" };
      const velocity = char === "^" ? "accent" : char === "X" ? "loud" : "soft";
      return { type: "hit", velocity };
    }

NoteToken
  = char:[A-Ga-g.\-] {
      if (char === ".") return { type: "rest" };
      if (char === "-") return { type: "sustain" };
      const note = char.toUpperCase();
      const velocity = char >= "A" && char <= "G" ? "loud" : "soft";
      return { type: "note", note, velocity };
    }

ChordToken
  = root:[A-Ga-g] seventh:"7"? {
      const note = root.toUpperCase();
      const velocity = root >= "A" && root <= "G" ? "loud" : "soft";
      return { type: "chord", root: note, velocity, hasSeventh: !!seventh };
    }
  / "." { return { type: "rest" }; }
  / "-" { return { type: "sustain" }; }

// Kept in sync with abstark's DrumName rule (the twin notation). "snare2" is
// tried before "snare" so the longer name is not short-circuited by its prefix.
// tom1/2/3/4 run high→low (tom4 = GM Low Floor Tom, the lowest).
DrumName
  = ("kick"i / "bd"i) { return { name: "kick", midi: 36 }; }
  / ("snare2"i / "s2"i) { return { name: "snare2", midi: 40 }; }
  / ("snare"i / "sd"i) { return { name: "snare", midi: 38 }; }
  / ("hihat"i / "hh"i) { return { name: "hihat", midi: 42 }; }
  / ("pedal"i / "ph"i) { return { name: "pedal", midi: 44 }; }
  / ("open"i / "oh"i) { return { name: "open", midi: 46 }; }
  / ("tom1"i / "ht"i) { return { name: "tom1", midi: 47 }; }
  / ("tom2"i / "mt"i) { return { name: "tom2", midi: 45 }; }
  / ("tom3"i / "lt"i) { return { name: "tom3", midi: 43 }; }
  / ("tom4"i / "ft"i) { return { name: "tom4", midi: 41 }; }
  / ("ride"i / "rc"i) { return { name: "ride", midi: 51 }; }
  / ("crash"i / "cc"i) { return { name: "crash", midi: 49 }; }
  / ("clap"i / "cl"i) { return { name: "clap", midi: 39 }; }
  / ("rimshot"i / "rs"i) { return { name: "rimshot", midi: 37 }; }
  / ("perc1"i / "p1"i) { return { name: "perc1", midi: 48 }; }
  / ("perc2"i / "p2"i) { return { name: "perc2", midi: 50 }; }

BarMarker
  = "/" [ \t]* { return { barMarker: true }; }

_ "whitespace"
  = [ \t\n\r]*
