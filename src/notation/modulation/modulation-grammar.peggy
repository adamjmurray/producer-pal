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
  = _ head:assignment? tail:((_ nl _)+ assignment)* _ {
    const assignments = [head, ...tail.map(t => t[1])].filter(Boolean);
    return assignments;
  }

assignment
  = pitch:pitch? _ timeRange:timeRange? _ parameter:parameter _ operator:operator _ expression:expression {
    return { pitch, timeRange, parameter, operator, expression };
  }

pitch
  = pitchClass:pitchClass octave:signedInt {
    const pitch = (octave + 2) * 12 + pitchClass.value;
    if (pitch >= 0 && pitch <= 127) {
      return pitch;
    }
    throw new Error(`MIDI pitch ${pitch} (${pitchClass.name}${octave}) outside valid range 0-127`);
  }

pitchClass
  = pc:("C#" / "Db" / "D#" / "Eb" / "F#" / "Gb" / "G#" / "Ab" / "A#" / "Bb" /
        "C" / "D" / "E" / "F" / "G" / "A" / "B") {
    return { name: pc, value: PITCH_CLASS_VALUES[pc] };
  }

timeRange
  = startBar:oneOrMoreInt "|" startBeat:oneOrMoreFloat "-" endBar:oneOrMoreInt "|" endBeat:oneOrMoreFloat {
    return {
      startBar,
      startBeat,
      endBar,
      endBeat
    };
  }

operator
  = "=" { return "set"; }
  / "+=" { return "add"; }

parameter
  = "velocity" { return "velocity"; }
  / "timing" { return "timing"; }
  / "duration" { return "duration"; }
  / "probability" { return "probability"; }

expression
  = additive

additive
  = left:multiplicative _ "+" _ right:additive {
    return { type: "add", left, right };
  }
  / left:multiplicative _ "-" _ right:additive {
    return { type: "subtract", left, right };
  }
  / multiplicative

multiplicative
  = left:primary _ "*" _ right:multiplicative {
    return { type: "multiply", left, right };
  }
  / left:primary _ "/" _ right:multiplicative {
    return { type: "divide", left, right };
  }
  / primary

primary
  = functionCall
  / number
  / "(" _ expr:expression _ ")" { return expr; }

functionCall
  = name:functionName "(" _ args:argumentList? _ ")" {
    return { type: "function", name, args: args || [] };
  }

functionName
  = "cos" { return "cos"; }
  / "tri" { return "tri"; }
  / "saw" { return "saw"; }
  / "square" { return "square"; }
  / "noise" { return "noise"; }
  / "ramp" { return "ramp"; }

argumentList
  = head:argument tail:(_ "," _ argument)* {
    return [head, ...tail.map(t => t[3])];
  }

argument
  = period / number

period
  = bars:unsignedInt ":" beats:unsignedFloat "t" {
    return { type: "period", bars, beats };
  }
  / beats:unsignedFloat "t" {
    return { type: "period", bars: 0, beats };
  }

number
  = signedDecimal

oneOrMoreFloat
  = oneOrMoreMixedNumber / oneOrMoreFraction / oneOrMoreDecimal

oneOrMoreMixedNumber
  = wholeNumber:oneOrMoreInt "+" fraction:unsignedFraction {
    return wholeNumber + fraction;
  }

oneOrMoreFraction
  = [1-9] [0-9]* "/" [1-9] [0-9]* {
    const [num, den] = text().split('/');
    const result = Number.parseInt(num) / Number.parseInt(den);
    if (result < 1) {
      throw new Error(`Value must be 1 or greater (got ${text()})`);
    }
    return result;
  }

oneOrMoreDecimal
  = [1-9] [0-9]* ("." [0-9]*)? {
    return Number.parseFloat(text());
  }

unsignedFloat
  = unsignedMixedNumber / unsignedFraction / unsignedDecimal

unsignedMixedNumber
  = wholeNumber:unsignedInt "+" fraction:unsignedFraction {
    return wholeNumber + fraction;
  }

unsignedFraction
  = num:[0-9]* "/" den:[1-9] [0-9]* {
    const parts = text().split('/');
    const numerator = parts[0] === '' ? 1 : Number.parseInt(parts[0]);
    const denominator = Number.parseInt(parts[1]);
    return numerator / denominator;
  }

signedDecimal
  = sign:"-"? value:unsignedDecimal {
    return sign ? -value : value;
  }

unsignedDecimal
  = ([0-9]+ ("." [0-9]*)? / "." [0-9]+) {
    return Number.parseFloat(text());
  }

oneOrMoreInt
  = [1-9] [0-9]* {
    return Number.parseInt(text());
  }

unsignedInt
  = [0-9]+ {
    return Number.parseInt(text());
  }

signedInt
  = sign:"-"? value:unsignedInt {
    return sign ? -value : value;
  }

lineComment
  = "//" [^\r\n]*

hashComment
  = "#" [^\r\n]*

blockComment
  = "/*" (!"*/" .)* "*/"

comment
  = lineComment / hashComment / blockComment

// Whitespace
nl = [\r\n]  // newline
_ = ([ \t] / comment)*  // optional whitespace (no newlines)
