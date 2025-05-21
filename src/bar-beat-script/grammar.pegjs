// src/bar-beat-script/grammar.pegjs
// BarBeatScript - Bar.Beat.Unit absolute position notation

start
  = head:element tail:(WS element)* {
      return [head, ...tail.map(t => t[1])];
    }

element
  = position:position ":" note:note {
      return { ...note, position };
    }

position
  = bar:integer "." beat:integer "." unit:integer {
      return { bar, beat, unit };
    }

note
  = pitch:pitch modifiers:modifiers? {
      return { 
        type: "note", 
        pitch: pitch.pitch,
        name: pitch.name,
        ...modifiers
      };
    }

modifiers
  = mods:modifier+ {
      // disallow duplicates
      const modTypes = new Set();
      for(const mod of mods) {
        const type = Object.keys(mod)[0];
        if(modTypes.has(type)) {
          throw new Error(`Duplicate modifier: ${type}`);
        }
        modTypes.add(type);
      }
      return Object.assign({}, ...mods);
    }

modifier
  = velocityMod
  / durationMod

velocityMod
  = "v" num:[0-9]+ {
      const val = parseInt(num.join(""), 10);
      if (val < 0 || val > 127) {
        throw new Error("Velocity out of range (0–127)");
      }
      return { velocity: val };
    }

durationMod
  = "t" value:decimal? {
      return { duration: value };
    }

pitch
  = pitchClass:pitchClass octave:signedInteger {
      const name = `${pitchClass.name}${octave}`;
      const pitch = (octave + 2) * 12 + pitchClass.value;
      if (pitch < 0 || pitch > 127) throw new Error(`MIDI pitch ${pitch} (${name}) outside valid range 0-127`);
      return {pitch, name};
    }

pitchClass
  = pc:("C#" / "Db" / "D#" / "Eb" / "F#" / "Gb" / "G#" / "Ab" / "A#" / "Bb" / "B#" / "Cb" / 
        "C" / "D" / "E" / "F" / "G" / "A" / "B") {
      const values = {
        "C": 0,
        "C#": 1, "Db": 1,
        "D": 2,
        "D#": 3, "Eb": 3,
        "E": 4, "Fb": 4,
        "F": 5, "E#": 5,
        "F#": 6, "Gb": 6,
        "G": 7,
        "G#": 8, "Ab": 8,
        "A": 9,
        "A#": 10, "Bb": 10,
        "B": 11, "Cb": 11, "B#": 0
      };
      return { name: pc, value: values[pc] };
    }

decimal
  = num:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = num.join("") + (decimal ? decimal[0] + decimal[1].join("") : "");
      return Number.parseFloat(numStr);
    }
  / "." decimal:[0-9]+ {
      return Number.parseFloat("0." + decimal.join(""));
    }

integer
 = [0-9]+ { return Number.parseInt(text()); }

signedInteger
  = "-"? [0-9]+ { return Number.parseInt(text()); }

// Whitespace
WS = [ \t\r\n]+ // required
_ = [ \t\r\n]*  // optional