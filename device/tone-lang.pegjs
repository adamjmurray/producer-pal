// device/tone-lang.pegjs
// ToneLang v1.0 PEG Grammar

// Entry point
start
  = _ content:multiVoiceOrSingleVoice _ { return content; }

multiVoiceOrSingleVoice
  = voices:voiceList { return voices.length === 1 ? voices[0] : voices; }

voiceList
  = head:voice tail:(_ ";" _ voice)* {
      return [head, ...tail.map(t => t[3])];
    }

voice
  = elements:elementList { return elements; }

elementList
  = head:element tail:(_ element)* {
      return [head, ...tail.map(t => t[1])];
    }

element
  = chord
  / note
  / rest

note
  = pitch:pitch velocity:velocity? duration:duration? {
      return { 
        type: "note", 
        pitch: pitch.pitch,
        name: pitch.name,
        velocity: velocity ?? 70, 
        duration: duration ?? 1 
      };
    }

chord
  = "[" _ notes:noteList _ "]" velocity:velocity? duration:duration? {
      return { type: "chord", notes, velocity: velocity ?? 70, duration: duration ?? 1 };
    }

noteList
  = head:pitch tail:(_ pitch)* {
      return [head, ...tail.map(t => t[1])];
    }

rest
  = "R" duration:duration? {
      return { type: "rest", duration: duration ?? 1 };
    }

pitch
  = pitchClass:pitchClass octave:integer {
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

velocity
  = explicit_velocity
  / shorthand_velocity

explicit_velocity 
  = "v" num:[0-9]+ {
      const val = parseInt(num.join(""), 10);
      if (val < 0 || val > 127) {
        throw new Error("Velocity out of range (0–127)");
      }
      return val;
    }

shorthand_velocity
  = "<<<" { return 127; }
  / "<<" { return 110; }
  / "<" { return 90; }
  / ">>>" { return 10; }
  / ">>" { return 30; }
  / ">" { return 50; }

// Duration: *2 or *1.5 or /2 or /1.5 etc
duration
  = mul:"*" num:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = num.join("") + (decimal ? decimal[0] + decimal[1].join("") : "");
      return parseFloat(numStr) * 1;
    }
  / div:"/" num:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = num.join("") + (decimal ? decimal[0] + decimal[1].join("") : "");
      return 1 / parseFloat(numStr);
    }

integer
  = "-"? [0-9]+ { return parseInt(text(), 10); }

// Whitespace
_ = [ \t\r\n]*
