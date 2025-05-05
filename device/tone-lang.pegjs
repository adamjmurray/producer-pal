// device/tone-lang.pegjs
// ToneLang v1.0 PEG Grammar

// Entry point
start
  = _ elements:elementList _ { return elements; }

elementList
  = head:element tail:(_ element)* {
      return [head, ...tail.map(t => t[1])];
    }

element
  = chord
  / note
  / rest

// Notes
note
  = pitch:pitch velocity:velocity? duration:duration? {
      return { type: "note", pitch, duration: duration ?? 1, velocity: velocity ?? 100 };
    }

// Chords
chord
  = "[" _ notes:noteList _ "]" velocity:velocity? duration:duration? {
      return { type: "chord", notes, velocity: velocity ?? 100, duration: duration ?? 1 };
    }

noteList
  = head:noteInner tail:(_ noteInner)* {
      return [head, ...tail.map(t => t[1])];
    }

noteInner
  = pitch:pitch {
      return { pitch };
    }

// Rest
rest
  = "R" duration:duration? {
      return { type: "rest", duration: duration ?? 1 };
    }

// Pitch: note name + octave
pitch
  = noteName:[A-Ga-g] accidental:accidental? octave:[0-9] {
      return noteName.toUpperCase() + (accidental ?? "") + octave;
    }

accidental
  = "#" / "b"

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

// Velocity: :vNN
velocity
  = ":v" num:[0-9]+ {
      const val = parseInt(num.join(""), 10);
      if (val < 0 || val > 127) {
        throw new Error("Velocity out of range (0–127)");
      }
      return val;
    }

// Whitespace
_ = [ \t\r\n]*

