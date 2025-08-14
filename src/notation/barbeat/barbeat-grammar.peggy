// src/notation/barbeat/barbeat-grammar.peggy
{{
  const PITCH_CLASS_VALUES = {
    "C": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11,
  };
}}

start
  = _ head:element? tail:(WS+ element)* _ {
    return [head, ...tail.map(t => t[1])].filter(Boolean);
  }

element
  = time / probability / velocity / duration / note

time
  = bar:positiveInt "|" beat:positiveFloat {
    return { bar, beat };
  }
  / "|" beat:positiveFloat {
    return { bar: null, beat };
  }

probability
  = "p" val:unsignedFloat {
    if (val >= 0.0 && val <= 1.0) {
      return { probability: val };
    }
    else throw new Error(`Note probability ${val} outside valid range 0.0-1.0`);
  }

velocity
  = "v" start:unsignedInt "-" end:unsignedInt {
    if (start >= 0 && start <= 127 && end >= 0 && end <= 127) {
      return { 
        velocityMin: Math.min(start, end), 
        velocityMax: Math.max(start, end),
      };
    }
    else throw new Error(`Invalid velocity range ${start}-${end}`);
  }
  / "v" val:unsignedInt {
    if (val >= 0 && val <= 127) {
      return { velocity: val };
    }
    else throw new Error(`MIDI velocity ${val} outside valid range 0-127`);
  }

duration
  = "t" val:unsignedFloat {
    return { duration: val };
  }

note
  = pitchClass:pitchClass octave:signedInt {
    const name = `${pitchClass.name}${octave}`;
    const pitch = (octave + 2) * 12 + pitchClass.value;
    if (pitch >= 0 && pitch <= 127) {
      return { pitch };
    }
    else throw new Error(`MIDI pitch ${pitch} (${name}) outside valid range 0-127`);    
  }

pitchClass
  = pc:("C#" / "Db" / "D#" / "Eb" / "F#" / "Gb" / "G#" / "Ab" / "A#" / "Bb" /
        "C" / "D" / "E" / "F" / "G" / "A" / "B") {
  return { name: pc, value: PITCH_CLASS_VALUES[pc] };
}


unsignedInt
  = [0-9]+ { 
    return Number.parseInt(text()); 
  }

positiveInt
  = [1-9] [0-9]* { 
    return Number.parseInt(text()); 
  }

signedInt
  = sign:"-"? value:unsignedInt {
    return sign ? -value : value;
  }

unsignedFloat
  = ([0-9]+ ("." [0-9]*)? / "." [0-9]+) {
    return Number.parseFloat(text());
  }

positiveFloat
  = [1-9] [0-9]* ("." [0-9]*)? {
    return Number.parseFloat(text());
  }

signedFloat
  = sign:"-"? value:unsignedFloat {
    return sign ? -value : value;
  } 

// Comments
lineComment
  = "//" [^\r\n]*

hashComment
  = "#" [^\r\n]*

blockComment
  = "/*" (!"*/" .)* "*/"

comment
  = lineComment / hashComment / blockComment

// Whitespace
WS = ([ \t\r\n] / comment)+ // required
_ = ([ \t\r\n] / comment)*  // optional