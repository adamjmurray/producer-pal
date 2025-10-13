// src/notation/stark/stark-grammar.peggy
// Ultra-minimal music notation for weak LLMs

Start
  = DrumLines
  / BassLine
  / MelodyLine
  / ChordLine

DrumLines
  = first:DrumLine rest:([\n\r]+ DrumLine)* _ {
      return [first, ...rest.map(r => r[1])];
    }

DrumLine
  = _ type:DrumName _ ":" _ content:DrumContent {
      return {
        type: type.name,
        midi: type.midi,
        content: content
      };
    }

BassLine
  = _ "bass"i _ ":" _ content:NoteContent _ {
      return {
        type: 'bass',
        content: content
      };
    }

MelodyLine
  = _ "melody"i _ ":" _ content:NoteContent _ {
      return {
        type: 'melody',
        content: content
      };
    }

ChordLine
  = _ "chords"i _ ":" _ content:ChordContent _ {
      return {
        type: 'chords',
        content: content
      };
    }

DrumContent
  = items:DrumContentItem+ { return items; }

DrumContentItem
  = BarMarker
  / token:DrumToken [ \t]+ {
      return { ...token, duration: 'quarter' };
    }
  / token:DrumToken {
      return { ...token, duration: 'sixteenth' };
    }

NoteContent
  = items:NoteContentItem+ { return items; }

NoteContentItem
  = BarMarker
  / token:NoteToken [ \t]+ {
      return { ...token, duration: 'quarter' };
    }
  / token:NoteToken {
      return { ...token, duration: 'sixteenth' };
    }

ChordContent
  = items:ChordContentItem+ { return items; }

ChordContentItem
  = BarMarker
  / token:ChordToken [ \t]+ {
      return { ...token, duration: 'quarter' };
    }
  / token:ChordToken {
      return { ...token, duration: 'sixteenth' };
    }

DrumToken
  = char:[Xx^.\-] {
      if (char === '.') return { type: 'rest' };
      if (char === '-') return { type: 'sustain' };

      const velocity = char === '^' ? 'accent'
                     : char === 'X' ? 'loud'
                     : 'soft';
      return { type: 'hit', velocity };
    }

NoteToken
  = char:[A-Ga-g.\-] {
      if (char === '.') return { type: 'rest' };
      if (char === '-') return { type: 'sustain' };

      const note = char.toUpperCase();
      const velocity = (char >= 'A' && char <= 'G') ? 'loud' : 'soft';
      return { type: 'note', note, velocity };
    }

ChordToken
  = root:[A-Ga-g] seventh:"7"? {
      const note = root.toUpperCase();
      const velocity = (root >= 'A' && root <= 'G') ? 'loud' : 'soft';
      return {
        type: 'chord',
        root: note,
        velocity,
        hasSeventh: !!seventh
      };
    }

DrumName
  = ("kick"i / "bd"i) { return { name: 'kick', midi: 36 }; }
  / ("snare"i / "sd"i) { return { name: 'snare', midi: 38 }; }
  / ("hihat"i / "hh"i) { return { name: 'hihat', midi: 42 }; }
  / ("open"i / "oh"i) { return { name: 'open', midi: 46 }; }
  / ("tom1"i / "ht"i) { return { name: 'tom1', midi: 47 }; }
  / ("tom2"i / "mt"i) { return { name: 'tom2', midi: 45 }; }
  / ("tom3"i / "lt"i) { return { name: 'tom3', midi: 43 }; }
  / ("ride"i / "rc"i) { return { name: 'ride', midi: 51 }; }
  / ("crash"i / "cc"i) { return { name: 'crash', midi: 49 }; }
  / ("clap"i / "cl"i) { return { name: 'clap', midi: 39 }; }
  / ("rimshot"i / "rs"i) { return { name: 'rimshot', midi: 37 }; }

BarMarker
  = "/" [ \t]* { return { barMarker: true }; }

_ "whitespace"
  = [ \t\n\r]*
