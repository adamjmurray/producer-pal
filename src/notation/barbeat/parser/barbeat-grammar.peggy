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

  // Borrow across bar lines so a `-n` beat offset can pull a position earlier
  // than beat 1 of its bar (e.g. `2|1-n/12` → bar 1, beat 4⅔ in 4/4). The
  // offset already produced a sub-1 `beat`; wrap it up into the previous bar(s)
  // using beatsPerBar. A pull before `1|1` is allowed: the bar goes to 0 /
  // negative and the position resolves to negative time (Live accepts notes
  // before the clip start). Never throws — negative time is a valid result.
  function borrowBars(bar, beat, beatsPerBar) {
    while (beat < 1) {
      beat += beatsPerBar;
      bar -= 1;
    }
    return { bar, beat };
  }

  // Normalize one timePoints entry into a canonical { bar, beat }. The entry is
  // either a plain beat number or a repeat pattern whose `start` may be sub-1;
  // either way the sub-1 value borrows across the bar line.
  function normalizeTimePoint(bar, beat, beatsPerBar) {
    if (typeof beat === "object" && beat !== null) {
      const borrowed = borrowBars(bar, beat.start, beatsPerBar);
      return { bar: borrowed.bar, beat: { ...beat, start: borrowed.beat } };
    }
    const borrowed = borrowBars(bar, beat, beatsPerBar);
    return { bar: borrowed.bar, beat: borrowed.beat };
  }

  // Assemble a pattern bracket from its kind-tagged values, enforcing the
  // "one parameter kind per bracket" rule. Each value is { kind, value }; a
  // bracket mixing kinds (`[v80 C3]`) throws. Returns the flat
  // { stream: { param, values } } AST node — values is the bare per-kind shape
  // (chord[] for pitch, the velocity/duration/probability objects otherwise).
  function buildStream(values) {
    const param = values[0].kind;
    for (const v of values) {
      if (v.kind !== param) {
        throw new Error(
          "a pattern bracket holds one parameter kind (pitch, velocity, duration, or probability), not a mix"
        );
      }
    }
    return { stream: { param, values: values.map(v => v.value) } };
  }
}}

start
  = _ head:element? tail:(WS element)* _ {
    const elements = [head, ...tail.map(t => t[1])].filter(Boolean);
    return elements.flat();
  }

element
  = barCopy / timePoints / stream / probability / velocity / duration / pitch

barCopy "bar copy operation"
  = '@' 'clear' {
    return { clearBuffer: true };
  }
  / '@' dest:barOrRange '=' source:barOrRange? {
    return {
      destination: dest,
      source: source ?? "previous"
    };
  }

barOrRange
  = start:oneOrMoreInt '-' end:oneOrMoreInt {
    return { range: [start, end] };
  }
  / bar:oneOrMoreInt {
    return { bar: bar };
  }

timePoints "time position"
  = bar:oneOrMoreInt "|" beats:beatList {
    const beatsPerBar = options.beatsPerBar ?? 4;
    return beats.map(beat => normalizeTimePoint(bar, beat, beatsPerBar));
  }

beatList "beat list"
  = head:beatSpec tail:("," beatSpec)* {
    return [head, ...tail.map(t => t[1])];
  }

beatSpec "beat specification"
  = start:beatValue "x" times:oneOrMoreInt step:stepInterval? {
      if (step != null && step.fraction === 0 && step.bars === 0) {
        throw new Error("Repeat step size must be greater than 0");
      }
      if (step == null) {
        return { start, times, step: null };
      }
      // step.fraction is a whole-note fraction; step.bars is meter-aware.
      return step.bars > 0
        ? { start, times, step: step.fraction, stepBars: step.bars }
        : { start, times, step: step.fraction };
    }
  / beatValue

// Repeat step: the note-value duration grammar, prefixed by `@`.
//   @n<fraction>  note value (@n/4 = quarter, @n/12 = eighth triplet)
//   @Nbar         meter-aware bars (@1bar = one bar)
//   @Nbar+n<frac> mixed
// Bare beats (@1) and bare fractions (@/4) are rejected — authoring stays
// note-value-only; off-grid bare beats are a length-field concept only.
stepInterval
  = "@" bars:oneOrMoreInt "bar" "s"? frac:durationBarFraction? {
      return { bars, fraction: frac ?? 0 };
    }
  / "@" "n" ([0-9]* "/")? last:$([0-9]+) "bar" "s"? {
      // `n`-prefixed bar step (`@n1bar`, `@n/1bar`, `@n3/4bar`): same category
      // error as the duration sites — bars are the bare `Nbar` form. Placed
      // before the `@n<frac>` branch so it catches the trailing `bar` first.
      throw new Error(`"@${text().slice(1)}" is invalid: bar steps don't use the "n" prefix — write @Nbar (e.g. @${last}bar).`);
    }
  / "@" "n" frac:unsignedFraction {
      return { bars: 0, fraction: frac };
    }
  / "@" bad:badStepValue {
      throw new Error(`step intervals use the note-value form: @n/4 = quarter, @n/8 = eighth, @n/12 = eighth triplet, @1bar = one bar. Got @${bad} — note values need the n prefix (@n/4, not @/4); bars use Nbar (@1bar).`);
    }

// Tail of a mixed duration: "+nA/B" (the note-value fraction wears its own `n`).
durationBarFraction
  = "+" "n" frac:unsignedFraction { return frac; }

// Values that look like a step/duration but use a now-invalid bare form.
// Used only to raise a targeted error — never returns a usable value.
badStepValue
  = unsignedMixedNumber { return text(); }
  / unsignedFraction { return text(); }
  / unsignedDecimal { return text(); }

// Value-range enforcement lives in the interpreter (per-note, recoverable:
// velocity/probability clamp + warn, out-of-range pitch is skipped + warned),
// NOT here. The grammar accepts any numeric value so one bad token never aborts
// the whole clip's notation. Malformed *syntax* still throws (see the bad*
// rules below) — that is unrecoverable and correctly fatal.
probability "probability value"
  = "p" val:unsignedDecimal {
    return { probability: val };
  }

velocity "velocity value"
  = "v" start:unsignedInt "-" end:unsignedInt {
    return {
      velocityMin: Math.min(start, end),
      velocityMax: Math.max(start, end),
    };
  }
  / "v" val:unsignedInt {
    return { velocity: val };
  }

duration "duration value"
  = badBarDuration
  / bars:oneOrMoreInt "bar" "s"? frac:durationBarFraction? {
    // Nbar (e.g. 1bar) or Nbar+nA/B (e.g. 1bar+n3/4). `bar` is meter-aware and
    // never wears an `n`; the interpreter resolves it against beatsPerBar. A
    // plural `bars` (`2bars`) is accepted as a tolerance alias; output stays `bar`.
    return { bars, duration: frac ?? 0 };
  }
  / "n" frac:unsignedFraction {
    return { duration: frac };  // Fraction of a whole note (e.g., 1/4 = quarter)
  }
  / "n" bad:badAbsoluteValue {
    throw new Error(`durations need a denominator: n/4 = quarter, n/8 = eighth, n/12 = eighth triplet, or a bar form like 1bar or 1bar+n/4. Got n${bad}`);
  }

// Matches values that LOOK like a duration/step but lack the required denominator.
// Used only to produce a targeted error message — never returns a value.
badAbsoluteValue
  = unsignedMixedNumber { return text(); }
  / unsignedDecimal { return text(); }

// `n`-prefixed bar duration (`n1bar`, `n/1bar`, `n3/4bar`): a category error —
// the `n` sigil marks a note-value fraction (denominator required); bars are the
// bare `Nbar` form. Matched only to raise a targeted "did you mean Nbar" error.
badBarDuration
  = "n" ([0-9]* "/")? last:$([0-9]+) "bar" "s"? {
      throw new Error(`"${text()}" is invalid: bar durations don't use the "n" prefix — write Nbar (e.g. ${last}bar).`);
    }

pitch "note pitch"
  = pitchClass:pitchClass octave:signedInt {
    // Range is enforced in the interpreter (out-of-range pitch is skipped +
    // warned), so emit whatever the note name computes to.
    return { pitch: (octave + 2) * 12 + pitchClass.value };
  }

pitchClass
  = pc:("C#" / "Db" / "D#" / "Eb" / "F#" / "Gb" / "G#" / "Ab" / "A#" / "Bb" /
        "C" / "D" / "E" / "F" / "G" / "A" / "B") {
  return { name: pc, value: PITCH_CLASS_VALUES[pc] };
}

// Pattern bracket holding a parameter STREAM (AJM-482 pitch, AJM-483 v/n/p): an
// ordered list of one parameter's values, cycled across emitted note-events. The
// stream persists until that parameter is reassigned, so its cursor carries
// across separate time positions (cross-event cursor). The emitter zips it
// against the positions: value at cursor i = values[i mod values.length]; see
// "Pattern Brackets (Streams)" in dev/specs/BarBeat-Spec.md.
//
// One bracket holds ONE parameter kind. Values are kind-tagged so buildStream
// can reject a mix (`[v80 C3]`); homogeneous output keeps the bare per-kind
// shape (chord[] for pitch — a bare pitch is a length-1 chord — and the
// velocity/duration/probability objects otherwise). A nested `[` is not a valid
// streamValue, so `[C3 [D3 E3]]` fails to parse (no rule-sharing/nesting).
// Targeted error messages are a later teach-tier phase.
stream "pattern bracket"
  = "[" _ head:streamValue tail:(WS streamValue)* _ "]" {
    return buildStream([head, ...tail.map(t => t[1])]);
  }

// A single stream value, tagged with its parameter kind. First characters are
// disjoint across kinds — `(`/note-letter (pitch), `v` (velocity), `n`/digit
// (duration), `p` (probability) — so ordered choice never mis-routes; a token
// matching none fails the bracket.
streamValue
  = c:chord { return { kind: "pitch", value: c }; }
  / v:velocity { return { kind: "velocity", value: v }; }
  / d:duration { return { kind: "duration", value: d }; }
  / pr:probability { return { kind: "probability", value: pr }; }
  / p:pitch { return { kind: "pitch", value: [p] }; }

chord "chord"
  = "(" _ head:pitch tail:(WS pitch)* _ ")" {
    return [head, ...tail.map(t => t[1])];
  }

// A beat position: a 1-based grid beat, optionally displaced by an absolute
// note-value offset (`+n/12` = plus an eighth triplet, `-n/24` = minus a
// 32nd-note triplet). The offset is a fraction of a whole note — a note value,
// so it is meter-INVARIANT in absolute time (`n/12` is always an eighth
// triplet, in every meter). `options.timeSigDenominator` only multiplies it
// into musical beats (the grid's unit) so it can be added to the grid beat;
// that factor cancels when musical beats convert to Ableton beats, so the note
// value's musical meaning never depends on the meter. (Contrast `Nbar`, which
// IS meter-relative.) Dyadic sub-beats may use a plain decimal (`1.5`). Bare
// fractions (`4/3`) and bar-relative mixed numbers (`1+1/3`) are intentionally
// rejected so note values always wear the `n` sigil.
//
// A `-n` offset may resolve below beat 1 (e.g. `2|1-n/12`, "just before the
// downbeat"); `timePoints` borrows across the bar line to canonicalize it. A
// pull before `1|1` is allowed and resolves to negative time (a note before the
// clip start). So this rule returns the raw beat even when it is < 1.
beatValue
  = base:oneOrMoreDecimal sign:("+" / "-") "n" frac:unsignedFraction {
      // The offset base is a decimal beat (`1|1.5+n/4`), not just an integer:
      // `oneOrMoreDecimal` subsumes integers, so this is a superset of the old
      // integer-only form. Additive — no existing parse changes.
      const offsetBeats = frac * (options.timeSigDenominator ?? 4);
      return sign === "+" ? base + offsetBeats : base - offsetBeats;
    }
  / oneOrMoreInt sign:("+" / "-") bad:badBeatOffset {
      throw new Error(`beat offsets use the note-value form: 1|1+n/12 = beat 1 + an eighth triplet, 1|2-n/24. Got ${text()} — note-value offsets need the n prefix (write ${sign}n/3, not ${sign}${bad}).`);
    }
  / bad:bareFractionBeat {
      throw new Error(`beat positions are a grid beat with an optional note-value offset (1|1, 1|1+n/12) or a decimal (1|1.5). Got bare fraction ${bad} — write the grid+offset form instead (4/3 → 1+n/12).`);
    }
  / oneOrMoreDecimal

// Old bare-fraction beat (`4/3`); matched only to raise a targeted error.
bareFractionBeat
  = [1-9] [0-9]* "/" [1-9] [0-9]* { return text(); }

// Tail of an old `int+fraction` mixed beat (`1+1/3`); for targeted errors only.
badBeatOffset
  = unsignedMixedNumber { return text(); }
  / unsignedFraction { return text(); }
  / unsignedDecimal { return text(); }

unsignedMixedNumber
  = wholeNumber:unsignedInt "+" fraction:unsignedFraction {
    return wholeNumber + fraction;
  }

unsignedFraction
  = num:([0-9]+ "." [0-9]+ / [0-9]*) "/" den:[1-9] [0-9]* {
    // Numerator may be empty (→ 1), an integer, or a DECIMAL: the off-grid escape
    // `n<beats>/4` (e.g. `n1.9638/4`) the length/duration serializer emits for a
    // sample-derived value with no clean note-value fraction. The denominator
    // stays a no-leading-zero integer. Kept in parity with the TS regexes in
    // barbeat-time.ts by note-value-grammar-parity.test.ts.
    const parts = text().split('/');
    const numerator = parts[0] === '' ? 1 : Number.parseFloat(parts[0]);
    const denominator = Number.parseInt(parts[1]);
    return numerator / denominator;
  }

oneOrMoreDecimal
  = [1-9] [0-9]* ("." [0-9]*)? {
    return Number.parseFloat(text());
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

signedInt
  = sign:"-"? value:unsignedInt {
    return sign ? -value : value;
  }

unsignedInt
  = [0-9]+ {
    return Number.parseInt(text());
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
WS = ([ \t\r\n] / comment)+ // required
_ = ([ \t\r\n] / comment)*  // optional