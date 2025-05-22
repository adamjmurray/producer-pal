// src/notation/barbeat/barbeat-grammar.peggy
// BarBeat - Stateful absolute position notation

{
  let currentTime = { bar: 1, beat: 1 };
  let currentVelocity = 70;
  let currentDuration = 1.0;
}

start
  = _ head:element? tail:(WS+ element)* _ {
      return [head, ...tail.map(t => t[1])].filter(elem => elem != null);
    }

element
  = time / velocity / duration / note

time 
  = bar:([1-9] [0-9]*) ":" beat:beat {
      currentTime = { bar: Number.parseInt(bar.join("")), beat };
      return null;
    }

velocity
  = "v" val:velocityValue {
      currentVelocity = val;
      return null;
    }

duration
  = "t" val:unsignedDecimal {
      currentDuration = val;
      return null;
    }

note
  = pitch:pitch {
      return {
        pitch: pitch.pitch,
        name: pitch.name,
        start: { ...currentTime },
        velocity: currentVelocity,
        duration: currentDuration
      };
    }

velocityValue
  = num:[0-9]+ {
      const val = Number.parseInt(text());
      if (val >= 0 && val <= 127) {
        return val;
      }
      else throw new Error("Velocity out of range (0–127)");
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

beat
  = [1-9] [0-9]* ("." [0-9]+)? {
      return Number.parseFloat(text());
    }

unsignedDecimal
  = value:([0-9]+ ("." [0-9]*)? / "." [0-9]+) {
      return Number.parseFloat(text());
    }

integer
 = [0-9]+ { return Number.parseInt(text()); }

signedInteger
  = "-"? [0-9]+ { return Number.parseInt(text()); }

// Whitespace
WS = [ \t\r\n]+ // required
_ = [ \t\r\n]*  // optional