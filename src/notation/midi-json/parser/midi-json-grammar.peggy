// MIDI JSON notation grammar — a compact array of note objects.
//
// The canonical serialized form is a JS object-literal with unquoted short keys
// and defaults omitted, e.g. `[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]`.
// The grammar is deliberately tolerant on the interpret (parse) side so that
// whatever an LLM emits still parses: keys may be quoted (valid JSON) or bare,
// and may use either the short forms (p/t/d/v/vd/c) or the long forms
// (pitch/start/duration/velocity/deviation/velocityDeviation/probability). Key
// normalization and range clamping happen in the TS layer, not here — this
// grammar only turns the string into an array of `{ key: number }` objects.
//
// Generated into generated-midi-json-parser.js by `npm run parser:build`.
// Types for the produced AST live in generated-midi-json-parser.d.ts.

Start
  = _ arr:NoteArray _ { return arr; }

NoteArray
  = "[" _ notes:NoteList? _ "]" { return notes ?? []; }

NoteList
  = head:NoteObject tail:(_ "," _ NoteObject)* {
      return [head, ...tail.map((t) => t[3])];
    }

NoteObject
  = "{" _ props:PropList? _ "}" {
      const obj = {};
      for (const [key, value] of props ?? []) obj[key] = value;
      return obj;
    }

PropList
  = head:Prop tail:(_ "," _ Prop)* {
      return [head, ...tail.map((t) => t[3])];
    }

Prop
  = _ key:Key _ ":" _ value:Number { return [key, value]; }

Key
  = '"' k:KeyName '"' { return k; }
  / "'" k:KeyName "'" { return k; }
  / KeyName

KeyName
  = $([A-Za-z][A-Za-z0-9]*)

// Tolerant numeric literal. Accepts a leading-dot decimal (`.5`, `-.75`) — a
// common LLM habit of dropping the leading zero — as well as leading zeros
// (`007`); parseFloat normalizes both. A whole-array parse error would abort the
// entire clip op, so the grammar errs toward accepting whatever an LLM emits.
Number
  = n:$("-"? ([0-9]+ ("." [0-9]+)? / "." [0-9]+) ([eE] [+-]? [0-9]+)?) {
      return parseFloat(n);
    }

_ "whitespace"
  = [ \t\n\r]*
