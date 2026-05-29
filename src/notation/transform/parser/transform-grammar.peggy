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

  // Maps a multiplicative operator character to its AST node type.
  const MULTIPLICATIVE_OP_TYPES = { "*": "multiply", "/": "divide", "%": "modulo" };

  // Targeted error for the removed synced-period syntax (Nt, N:Nt).
  function oldPeriodError(matched) {
    return `Period syntax "${matched}" is no longer supported. Use a note-value period with the "sync" keyword, e.g. sin(n/4, sync) for a quarter-note cycle, or cos(clip.barDuration, sync) for a bar-length cycle.`;
  }

  // Desugars a shorthand additive op (v±N, p±N) to the same shape the full form
  // produces in assignmentBody: subtract becomes add-of-negation, add stays add.
  function shorthandAdditive(parameter, operator, value) {
    if (operator === "subtract") {
      return { parameter, operator: "add", expression: { type: "subtract", left: 0, right: value } };
    }
    return { parameter, operator, expression: value };
  }

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
  = __ head:assignment? tail:((_ nl _)+ assignment)* __ {
    const assignments = [head, ...tail.map(t => t[1])].filter(Boolean);
    return assignments;
  }

rangeSelector "range selector"
  = pitchRange:pitchRange _ timeRange:timeRange? { return { pitchRange, timeRange: timeRange ?? null }; }
  / timeRange:timeRange _ pitchRange:pitchRange? { return { pitchRange: pitchRange ?? null, timeRange }; }

assignment "parameter assignment"
  = ranges:(rangeSelector _ ":" _)? body:assignmentBody {
    const pitchRange = ranges?.[0]?.pitchRange ?? null;
    const timeRange = ranges?.[0]?.timeRange ?? null;
    return { pitchRange, timeRange, ...body };
  }

// The right-hand side of an assignment, after any optional range selector.
// Full form: `parameter operator expression`. Shorthand: bar|beat-style tokens
// (v/p/n + bare-pitch) that desugar to the same { parameter, operator, expression }.
assignmentBody
  = parameter:parameter _ operator:operator _ expression:expression {
      if (operator === "subtract") {
        return { parameter, operator: "add", expression: { type: "subtract", left: 0, right: expression } };
      }
      if (operator === "multiply" || operator === "divide") {
        const varInfo = PARAM_TO_VARIABLE[parameter];
        const currentValue = { type: "variable", namespace: varInfo.namespace, name: varInfo.name };
        return { parameter, operator: "set", expression: { type: operator, left: currentValue, right: expression } };
      }
      return { parameter, operator, expression };
    }
  / shorthand

// Shorthand assignment sugar reusing bar|beat property tokens. Each desugars to
// the same { parameter, operator, expression } shape as the full forms; single
// change per line. velocity/probability also accept additive ops (v±N, p±N) —
// safe because both domains are non-negative, so a leading sign is unambiguous.
shorthand "shorthand assignment"
  = "v" operator:shorthandAddOp value:unsignedInt {
      return shorthandAdditive("velocity", operator, value);
    }
  / "v" value:unsignedInt {
      return { parameter: "velocity", operator: "set", expression: value };
    }
  / "p" operator:shorthandAddOp value:unsignedDecimal {
      return shorthandAdditive("probability", operator, value);
    }
  / "p" value:unsignedDecimal {
      return { parameter: "probability", operator: "set", expression: value };
    }
  / expression:nDuration {
      return { parameter: "duration", operator: "set", expression };
    }
  / pitch:pitchLiteral {
      return { parameter: "pitch", operator: "set", expression: pitch };
    }

shorthandAddOp
  = "+" { return "add"; }
  / "-" { return "subtract"; }

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

// Left-associative: fold a head term with a list of (op, term) tails so
// `8/4/2` parses as `(8/4)/2`, not `8/(4/2)`. Matters for the non-associative
// ops (`-`, `/`, `%`); `+`/`*` give the same value either way.
additive
  = head:multiplicative tail:(_ op:[+\-] _ right:multiplicative { return { op, right }; })* {
    return tail.reduce(
      (left, { op, right }) => ({ type: op === "+" ? "add" : "subtract", left, right }),
      head,
    );
  }

multiplicative
  = head:primary tail:(_ op:[*/%] _ right:primary { return { op, right }; })* {
    return tail.reduce(
      (left, { op, right }) => ({ type: MULTIPLICATIVE_OP_TYPES[op], left, right }),
      head,
    );
  }

primary
  = functionCall
  / variable
  / nDuration
  / pitchLiteral
  / badPeriod
  / number
  / "(" _ expr:expression _ ")" { return expr; }

nDuration "absolute duration value"
  = "n" frac:unsignedFraction {
    return { type: "nDuration", wholeNoteFraction: frac };
  }
  / "n" bad:badAbsoluteValue {
    throw new Error(`durations need a denominator: n/4 = quarter, n/8 = eighth, n/12 = eighth triplet. Got n${bad}`);
  }

// Matches values that LOOK like a duration but lack the required denominator.
// Used only to produce a targeted error message — never returns a value.
badAbsoluteValue
  = unsignedMixedNumber { return text(); }
  / unsignedDecimal { return text(); }

// Matches the removed synced-period syntax (Nt, N:Nt) to throw a targeted error.
// Synced periods are now note-value expressions gated by the `sync` keyword.
badPeriod
  = unsignedInt ":" unsignedFloat "t" { throw new Error(oldPeriodError(text())); }
  / unsignedFloat "t" { throw new Error(oldPeriodError(text())); }

variable
  = "audio." name:audioPropertyName {
    return { type: "variable", namespace: "audio", name };
  }
  / "clip." name:clipPropertyName {
    return { type: "variable", namespace: "clip", name };
  }
  / "next." name:nextPropertyName {
    return { type: "variable", namespace: "next", name };
  }
  / "note." name:notePropertyName {
    return { type: "variable", namespace: "note", name };
  }

nextPropertyName
  = "deviation" { return "deviation"; }
  / "velocity" { return "velocity"; }
  / "probability" { return "probability"; }
  / "duration" { return "duration"; }
  / "pitch" { return "pitch"; }
  / "start" { return "start"; }

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
    return { type: "function", name, args: args?.args ?? [], sync: args?.sync ?? false, raw: false };
  }
  / "swing" "(" _ args:swingArgumentList _ ")" {
    return { type: "function", name: "swing", args: args.args, sync: false, raw: args.raw };
  }
  / name:otherFunctionName "(" _ args:argumentList? _ ")" {
    return { type: "function", name, args: args || [], sync: false, raw: false };
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
  / "clipseq" { return "clipseq"; }
  / "seq" { return "seq"; }
  / "choose" { return "choose"; }
  / "ramp" { return "ramp"; }
  / "curve" { return "curve"; }
  / "quant" { return "quant"; }
  / "snap" { return "snap"; }
  / "step" { return "step"; }
  / "wrap" { return "wrap"; }
  / "reflect" { return "reflect"; }
  / "legato" { return "legato"; }

swingArgumentList
  = head:argument _ "," _ second:argument _ "," _ "raw" {
    return { args: [head, second], raw: true };
  }
  / head:argument _ "," _ "raw" {
    return { args: [head], raw: true };
  }
  / head:argument _ "," _ second:argument {
    return { args: [head, second], raw: false };
  }
  / head:argument {
    return { args: [head], raw: false };
  }

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
  = expression

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
__ = ([ \t\r\n] / comment)*  // optional whitespace including newlines
