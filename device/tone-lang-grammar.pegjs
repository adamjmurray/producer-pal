// device/tone-lang-grammar.pegjs
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
  = elements:sequence { return elements; }

sequence
  = head:element tail:(WS element)* {
      return [head, ...tail.map(t => t[1])];
    }

element
  = chord
  / note
  / rest

note
  = pitch:pitch velocity:velocity? duration:duration? timeUntilNext:timeUntilNext? {
      return { 
        type: "note", 
        pitch: pitch.pitch,
        name: pitch.name,
        velocity, 
        duration,
        timeUntilNext,
      };
    }

chord
  = "[" _ head:note tail:(WS note)* _ "]" velocity:velocity? duration:duration? timeUntilNext:timeUntilNext? {
      return { 
        type: "chord", 
        notes: [head, ...tail.map(t => t[1])], 
        velocity,
        duration,
        timeUntilNext,
      };
    }

rest
  = "R" duration:absoluteDuration? {
      return { 
        type: "rest", 
        duration: duration,
      };
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
  = "v" num:[0-9]+ {
      const val = parseInt(num.join(""), 10);
      if (val < 0 || val > 127) {
        throw new Error("Velocity out of range (0–127)");
      }
      return val;
    }

absoluteDuration
  = num:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = num.join("") + (decimal ? decimal[0] + decimal[1].join("") : "");
      return parseFloat(numStr);
    }
  / "." decimal:[0-9]+ {
      return parseFloat("0." + decimal.join(""));
    }

duration
  = "n" duration:absoluteDuration? {
      return duration;
    }

timeUntilNext
  = "t" duration:absoluteDuration? {
      return duration;
    }

integer
  = "-"? [0-9]+ { return parseInt(text(), 10); }

// Whitespace
WS = [ \t\r\n]+ // required
_ = [ \t\r\n]*  // optional