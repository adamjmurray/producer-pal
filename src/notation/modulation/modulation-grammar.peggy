// src/notation/modulation/modulation-grammar.peggy

start
  = _ head:assignment? tail:((_ nl _)+ assignment)* _ {
    const assignments = [head, ...tail.map(t => t[1])].filter(Boolean);
    return assignments;
  }

assignment
  = parameter:parameter _ ":" _ expression:expression {
    return { parameter, expression };
  }

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

argumentList
  = head:argument tail:(_ "," _ argument)* {
    return [head, ...tail.map(t => t[3])];
  }

argument
  = frequency / number

frequency
  = bars:unsignedInt ":" beats:unsignedFloatOrFraction "t" {
    return { type: "frequency", bars, beats };
  }
  / beats:unsignedFloatOrFraction "t" {
    return { type: "frequency", bars: 0, beats };
  }

number
  = signedFloat

unsignedInt
  = [0-9]+ {
    return Number.parseInt(text());
  }

signedFloat
  = sign:"-"? value:unsignedFloat {
    return sign ? -value : value;
  }

unsignedFloat
  = ([0-9]+ ("." [0-9]*)? / "." [0-9]+) {
    return Number.parseFloat(text());
  }

unsignedFloatOrFraction
  = [0-9]+ "/" [1-9] [0-9]* {
    const [num, den] = text().split('/');
    return Number.parseInt(num) / Number.parseInt(den);
  }
  / unsignedFloat

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
nl = [\r\n]  // newline
_ = ([ \t] / comment)*  // optional whitespace (no newlines)
