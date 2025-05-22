// src/tonelang/grammar.pegjs
// ToneLang PEG Grammar

start
  = _ head:sequence tail:(_ ";" _ sequence)* _ {
      return [head, ...tail.map(t => t[3])];
    }

sequence
  = head:element tail:(WS element)* {
      return [head, ...tail.map(t => t[1])];
    }

element
  = grouping
  / chord
  / note
  / rest

grouping
  = "(" _ elements:sequence _ ")" modifiers:modifiers? repeater:repeater? {
      const grouping = { 
        type: "grouping", 
        content: elements,
        ...modifiers
      };      
      return repeater 
        ? { 
            type: "repetition", 
            content: [grouping],
            repeat: repeater
          }
        : grouping;
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
  / timeUntilNextMod

velocityMod
  = "v" num:[0-9]+ {
      const val = parseInt(num.join(""), 10);
      if (val < 0 || val > 127) {
        throw new Error("Velocity out of range (0–127)");
      }
      return { velocity: val };
    }

durationMod
  = "n" value:unsignedDecimal? {
      return { duration: value };
    }

timeUntilNextMod
  = "t" value:unsignedDecimal? {
      return { timeUntilNext: value };
    }

repeater
  = "*" count:unsignedInteger {
      return count;
    }

note
  = pitch:pitch modifiers:modifiers? repeater:repeater? {
      const noteObj = { 
        type: "note", 
        pitch: pitch.pitch,
        name: pitch.name,
        ...modifiers
      };      
      return repeater 
        ? { 
            type: "repetition", 
            content: [noteObj],
            repeat: repeater
          }
        : noteObj;
    }

chord
  = "[" _ head:note tail:(WS note)* _ "]" modifiers:modifiers? repeater:repeater? {
      const chord = { 
        type: "chord", 
        notes: [head, ...tail.map(t => t[1])], 
        ...modifiers
      };      
      return repeater 
        ? { 
            type: "repetition", 
            content: [chord],
            repeat: repeater
          }
        : chord;
    }

rest
  = "R" value:unsignedDecimal? repeater:repeater? {
      const rest = { 
        type: "rest", 
        duration: value
      };    
      return repeater 
        ? { 
            type: "repetition", 
            content: [rest],
            repeat: repeater
          }
        : rest;
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
        "B": 11
      };
      return { name: pc, value: values[pc] };
    }

unsignedDecimal
  = num:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = num.join("") + (decimal ? decimal[0] + decimal[1].join("") : "");
      return Number.parseFloat(numStr);
    }
  / "." decimal:[0-9]+ {
      return Number.parseFloat("0." + decimal.join(""));
    }

unsignedInteger
 = [0-9]+ { return Number.parseInt(text()); }

signedInteger
  = "-"? [0-9]+ { return Number.parseInt(text()); }

// Whitespace
WS = [ \t\r\n]+ // required
_ = [ \t\r\n]*  // optional