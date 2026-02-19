{{
  // Canonical source: src/shared/pitch.js
  // This inline copy is required because Peggy cannot import JS modules.
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

  // Maps transform parameters to their note/audio variable for *= and /= desugaring.
  // timing uses note.start (absolute position) since there is no note.timing offset variable.
  const PARAM_TO_VARIABLE = {
    "velocity":    { namespace: "note",  name: "velocity"    },
    "timing":      { namespace: "note",  name: "start"       },
    "duration":    { namespace: "note",  name: "duration"    },
    "probability": { namespace: "note",  name: "probability" },
    "deviation":   { namespace: "note",  name: "deviation"   },
    "pitch":       { namespace: "note",  name: "pitch"       },
    "gain":        { namespace: "audio", name: "gain"        },
    "pitchShift":  { namespace: "audio", name: "pitchShift"  },
  };
}}

start
  = _ head:assignment? tail:((_ nl _)+ assignment)* _ {
    const assignments = [head, ...tail.map(t => t[1])].filter(Boolean);
    return assignments;
  }

rangeSelector "range selector"
  = pitchRange:pitchRange _ timeRange:timeRange? { return { pitchRange, timeRange: timeRange ?? null }; }
  / timeRange:timeRange _ pitchRange:pitchRange? { return { pitchRange: pitchRange ?? null, timeRange }; }

assignment "parameter assignment"
  = ranges:(rangeSelector _ ":" _)? parameter:parameter _ operator:operator _ expression:expression {
    const pitchRange = ranges?.[0]?.pitchRange ?? null;
    const timeRange = ranges?.[0]?.timeRange ?? null;
    if (operator === "subtract") {
      return { pitchRange, timeRange, parameter, operator: "add", expression: { type: "subtract", left: 0, right: expression } };
    }
    if (operator === "multiply" || operator === "divide") {
      const varInfo = PARAM_TO_VARIABLE[parameter];
      const currentValue = { type: "variable", namespace: varInfo.namespace, name: varInfo.name };
      return { pitchRange, timeRange, parameter, operator: "set", expression: { type: operator, left: currentValue, right: expression } };
    }
    return { pitchRange, timeRange, parameter, operator, expression };
  }

pitchRange "pitch range"
  = startPitch:pitch "-" endPitch:pitch {
    if (endPitch < startPitch) {
      throw new Error(`Invalid pitch range: end pitch ${endPitch} is lower than start pitch ${startPitch}`);
    }
    return { startPitch, endPitch };
  }
  / singlePitch:pitch {
    return { startPitch: singlePitch, endPitch: singlePitch };
  }

pitch
  = pitchClass:pitchClass octave:signedInt {
    const pitch = (octave + 2) * 12 + pitchClass.value;
    if (pitch >= 0 && pitch <= 127) {
      return pitch;
    }
    throw new Error(`MIDI pitch ${pitch} (${pitchClass.name}${octave}) outside valid range 0-127`);
  }

pitchLiteral
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

timeRange "time range"
  = startBar:oneOrMoreInt "|" startBeat:oneOrMoreFloat "-" endBar:oneOrMoreInt "|" endBeat:oneOrMoreFloat {
    return {
      startBar,
      startBeat,
      endBar,
      endBeat
    };
  }

operator
  = "*=" { return "multiply"; }
  / "/=" { return "divide"; }
  / "-=" { return "subtract"; }
  / "+=" { return "add"; }
  / "=" { return "set"; }

parameter "parameter name"
  = "pitchShift" { return "pitchShift"; }
  / "pitch" { return "pitch"; }
  / "velocity" { return "velocity"; }
  / "timing" { return "timing"; }
  / "duration" { return "duration"; }
  / "probability" { return "probability"; }
  / "deviation" { return "deviation"; }
  / "gain" { return "gain"; }

expression "expression"
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
  / left:primary _ "%" _ right:multiplicative {
    return { type: "modulo", left, right };
  }
  / primary

primary
  = functionCall
  / variable
  / pitchLiteral
  / number
  / "(" _ expr:expression _ ")" { return expr; }

variable
  = "audio." name:audioPropertyName {
    return { type: "variable", namespace: "audio", name };
  }
  / "clip." name:clipPropertyName {
    return { type: "variable", namespace: "clip", name };
  }
  / "note." name:notePropertyName {
    return { type: "variable", namespace: "note", name };
  }

notePropertyName
  = "deviation" { return "deviation"; }
  / "velocity" { return "velocity"; }
  / "probability" { return "probability"; }
  / "duration" { return "duration"; }
  / "index" { return "index"; }
  / "pitch" { return "pitch"; }
  / "start" { return "start"; }
  / "count" { return "count"; }

audioPropertyName
  = "gain" { return "gain"; }
  / "pitchShift" { return "pitchShift"; }

clipPropertyName
  = "barDuration" { return "barDuration"; }
  / "position" { return "position"; }
  / "duration" { return "duration"; }
  / "index" { return "index"; }
  / "count" { return "count"; }

functionCall
  = name:cyclicalFunctionName "(" _ args:syncArgumentList? _ ")" {
    return { type: "function", name, args: args?.args ?? [], sync: args?.sync ?? false };
  }
  / name:otherFunctionName "(" _ args:argumentList? _ ")" {
    return { type: "function", name, args: args || [], sync: false };
  }

cyclicalFunctionName
  = "cos" { return "cos"; }
  / "saw" { return "saw"; }
  / "sin" { return "sin"; }
  / "square" { return "square"; }
  / "tri" { return "tri"; }

otherFunctionName
  = "round" { return "round"; }
  / "floor" { return "floor"; }
  / "ceil" { return "ceil"; }
  / "abs" { return "abs"; }
  / "clamp" { return "clamp"; }
  / "pow" { return "pow"; }
  / "min" { return "min"; }
  / "max" { return "max"; }
  / "rand" { return "rand"; }
  / "choose" { return "choose"; }
  / "ramp" { return "ramp"; }
  / "curve" { return "curve"; }
  / "quant" { return "quant"; }

syncArgumentList
  = head:argument tail:(_ "," _ argument)* _ "," _ "sync" {
    return { args: [head, ...tail.map(t => t[3])], sync: true };
  }
  / "sync" {
    return { args: [], sync: true };
  }
  / head:argument tail:(_ "," _ argument)* {
    return { args: [head, ...tail.map(t => t[3])], sync: false };
  }

argumentList
  = head:argument tail:(_ "," _ argument)* {
    return [head, ...tail.map(t => t[3])];
  }

argument
  = period / expression

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
