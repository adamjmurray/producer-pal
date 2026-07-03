{{
  // Pitch-class semitones. Canonical source: src/shared/pitch.ts; this is an
  // inline copy because Peggy cannot import modules. Only the seven naturals are
  // tabulated — accidentals shift by ±1 in pitchClassFromParts, and the
  // enharmonic octave edges need no special case: B# resolves to 12 (the next
  // octave's C) and Cb to -1 (the previous octave's B), and the
  // (octave+2)*12+value formula carries that across the octave on its own.
  const NATURAL_PITCH_CLASS_VALUES = {
    c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
  };

  // Resolve a { name, value } pitch class from a note letter and optional
  // accidental. Case-insensitive (LLMs lowercase note names); accepts ASCII
  // `#`/`b`, the Unicode ♯ (U+266F) / ♭ (U+266D) glyphs, and an uppercase `B`
  // as a flat (so an all-caps `GB3` still reads as Gb3). Enharmonic spellings
  // (E#, B#, Cb, Fb) fall out for free. `name` is the normalized ASCII spelling,
  // used only in error text — downstream consumes the numeric value.
  function pitchClassFromParts(letter, accidental) {
    const upper = letter.toUpperCase();
    const value = NATURAL_PITCH_CLASS_VALUES[letter.toLowerCase()];
    if (accidental === "#" || accidental === "♯") {
      return { name: upper + "#", value: value + 1 };
    }
    if (accidental === "b" || accidental === "B" || accidental === "♭") {
      return { name: upper + "b", value: value - 1 };
    }
    return { name: upper, value };
  }

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

  // Fold a comma beat-list with "sticky bars". Each item is { bar, beat }: an
  // explicit `bar|` (item.bar != null) updates the running bar; a bare item
  // inherits the most-recent bar. `firstBar` seeds the running bar from the
  // leading `bar|` that every list opens with, so a plain list (`1|1,2,3`) is
  // unchanged and `1|1,2|3` / sticky `1|1,2|1,3` (→ 1|1 2|1 2|3) just work.
  function resolveStickyBars(firstBar, items, beatsPerBar) {
    let curBar = firstBar;
    return items.map(item => {
      if (item.bar != null) curBar = item.bar;
      return normalizeTimePoint(curBar, item.beat, beatsPerBar);
    });
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
  = _ head:element? tail:(elementSep element)* _ {
    const elements = [head, ...tail.map(t => t[1])].filter(Boolean);
    return elements.flat();
  }

// Top-level elements are whitespace-separated, EXCEPT a self-delimiting pattern
// bracket may abut the previous element with no space (`[C3 E3][v80 v100]`): a
// leading `[` is an unambiguous element boundary, so the separator collapses to
// a zero-width lookahead when the NEXT element opens a bracket. The lookahead
// only fires before `[`, so a bracket followed by a non-bracket (`[C3 E3]1|1`)
// still needs whitespace, and genuinely ambiguous runs (`C3E3`, `v80v100`) stay
// rejected. Mirrors the comma-space / sticky-bar input tolerances.
elementSep
  = WS
  / &"["

element
  = barCopy / timePoints / stream / probability / velocity / duration / pitch / badNumericToken

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
    return resolveStickyBars(bar, beats, beatsPerBar);
  }

// A comma list of beat positions sharing the leading bar. Items after the first
// may restate their own `bar|` (sticky-bar: `8|2,8|2.5`, cross-bar `1|1,2|3`);
// bare items inherit the running bar. Horizontal space is tolerated around the
// commas (`1|1, 2, 3`) and a single trailing comma is ignored (`1|1,2,`) — both
// forgiving-parser niceties. The head has no bar of its own (the `bar|` prefix
// in `timePoints` supplies it), so it is tagged `{ bar: null }`.
beatList "beat list"
  = head:beatSpec tail:(hs "," hs beatItem)* (hs ",")? {
    return [{ bar: null, beat: head }, ...tail.map(t => t[3])];
  }

// One comma-list item: an explicit `bar|beatSpec` (updates the sticky bar) or a
// bare `beatSpec` (inherits it). Explicit-bar branch is ordered first so a
// digit run followed by `|` is read as a new bar, not a bare beat.
beatItem
  = bar:oneOrMoreInt "|" beat:beatSpec { return { bar, beat }; }
  / beat:beatSpec { return { bar: null, beat }; }

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
//   @n<fraction>   note value (@n/4 = quarter, @n/12 = eighth triplet)
//   @Nbar          meter-aware bars (@1bar = one bar)
//   @Nbar±n<frac>  mixed (@1bar-n/16 = almost a full bar)
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

// Tail of a mixed duration: "±nA/B" (the note-value fraction wears its own `n`).
// The sign is part of the tail so `1bar-n/16` reads as "a bar minus a 16th"
// (meter-aware "almost a full bar"); the fraction is returned SIGNED and the
// callers (`duration`, `stepInterval`) add it to the bar component, so a minus
// tail simply subtracts. Shared by both sites — `@1bar-n/4` rides along for free.
durationBarFraction
  = sign:("+" / "-") "n" frac:unsignedFraction {
      return sign === "-" ? -frac : frac;
    }

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
    // Velocity range = humanized random velocity (base velocity + deviation).
    // Reject a 0 lower bound: `vA-B` desugars to base velocity = min(start,end),
    // and base velocity 0 is the delete sentinel (applyV0Deletions), so a
    // `v0-N` / `vN-0` / `v0-0` range would silently delete every note it touches.
    // The single `min === 0` check covers both orderings and v0-0. Deliberate
    // exception to the "values clamp+warn in the interpreter; the grammar never
    // throws on a velocity value" rule above: this is not an out-of-range value
    // (0 is valid) but a contradictory token whose delete-vs-humanize meaning is
    // intrinsic, with no per-note recovery. Mirrored byte-for-byte in
    // transform-grammar.peggy; pinned by velocity-range-parity.test.ts.
    if (Math.min(start, end) === 0) {
      throw new Error(`"${text()}" is invalid: velocity ranges must start at 1 or higher — v0 is the delete sentinel, not a range floor. Use v1-N for a low humanization floor, or a bare v0 to delete.`);
    }
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
    // Nbar (e.g. 1bar) or Nbar±nA/B (e.g. 1bar+n3/4, 1bar-n/16). `bar` is
    // meter-aware and never wears an `n`; the interpreter resolves it against
    // beatsPerBar. `frac` is signed (the minus tail subtracts), so `1bar-n/16`
    // is "almost a full bar". A plural `bars` (`2bars`) is an accepted tolerance
    // alias; output stays `bar`.
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
  = letter:[A-Ga-g] accidental:pitchAccidental? {
      return pitchClassFromParts(letter, accidental);
    }

pitchAccidental
  = "#" / "b" / "B" / "♯" / "♭"

// Pattern bracket holding a parameter STREAM (pitch, v/n/p): an
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
  / rangeAsBeat
  / oneOrMoreDecimal sign:("+" / "-") bad:badBeatOffset {
      // Decimal base (`1|1.5+2`) gets the same targeted steer as the integer
      // base (`1|1+2`); `oneOrMoreDecimal` subsumes integers, and the valid
      // `oneOrMoreDecimal sign "n" frac` branch above (plus `rangeAsBeat` for a
      // `-bar|` span) is tried first, so a real `1.5+n/4` / `1.5-2|1` still wins.
      throw new Error(`beat offsets use the note-value form: 1|1+n/12 = beat 1 + an eighth triplet, 1|2-n/24. Got ${text()} — note-value offsets need the n prefix (write ${sign}n/3, not ${sign}${bad}).`);
    }
  / bad:bareFractionBeat {
      throw new Error(`beat positions are a grid beat with an optional note-value offset (1|1, 1|1+n/12) or a decimal (1|1.5). Got bare fraction ${bad} — write the grid+offset form instead (4/3 → 1+n/12).`);
    }
  / badZeroBeat
  / oneOrMoreDecimal

// Old bare-fraction beat (`4/3`); matched only to raise a targeted error.
bareFractionBeat
  = [1-9] [0-9]* "/" [1-9] [0-9]* { return text(); }

// Tail of an old `int+fraction` mixed beat (`1+1/3`); for targeted errors only.
badBeatOffset
  = unsignedMixedNumber { return text(); }
  / unsignedFraction { return text(); }
  / unsignedDecimal { return text(); }

// A position written as a range (`1|1-2|1`): not a bar|beat concept — positions
// are single points; a span belongs in a transform time filter. Ordered after
// the valid `-n` offset (so a real offset wins) and before the bad-offset error
// (which would otherwise mislabel this "beat offsets use the note-value form").
// Matches only `beat - bar|`; raises a targeted error, never returns a value.
rangeAsBeat
  = oneOrMoreDecimal "-" oneOrMoreInt "|" {
      throw new Error(`a position is a single bar|beat (e.g. 1|1). For a span, use a transform time filter (1|1-2|1: ...).`);
    }

// A 0-indexed beat (`1|0`, `1|0.5`): beats count from 1, so a leading 0 can only
// be this mistake (every valid beat starts 1-9, or is a `-n` offset / decimal).
// Raises a targeted error; never returns a value. The `1|0`-as-pickup reading is
// deliberately NOT taught — a pickup before the downbeat is the offset form
// `1|1-n/N` (see standard skills).
badZeroBeat
  = "0" [0-9]* ("." [0-9]*)? {
      throw new Error(`beats are 1-indexed: the downbeat is beat 1 (e.g. 1|1); for a pickup before it, offset from beat 1 (e.g. 1|1-n/4). Got beat ${text()}.`);
    }

// Last resort for a digit-led element that is neither a position (no `|`) nor a
// duration (no `bar`): a `bar.beat`/`bar:beat` written with the wrong separator,
// or a raw MIDI number used as a pitch. Ordered last in `element` so every real
// element wins first; raises a fix-suggesting error in place of peggy's generic
// "Expected …". Never returns a value.
badNumericToken
  = unsignedInt ("." / ":") unsignedInt {
      throw new Error(`positions use a pipe: bar|beat (e.g. 1|1), not "." or ":". Got ${text()}.`);
    }
  / unsignedInt &(WS / !.) {
      throw new Error(`use note names like C3 (middle C) for pitches, not MIDI numbers. Got ${text()}.`);
    }

unsignedMixedNumber
  = wholeNumber:unsignedInt "+" fraction:unsignedFraction {
    return wholeNumber + fraction;
  }

unsignedFraction
  = num:([0-9]+ "." [0-9]+ / [0-9]*) "/" den:[1-9] [0-9]* mod:("d" / "t")? {
    // Numerator may be empty (→ 1), an integer, or a DECIMAL: the off-grid escape
    // `n<beats>/4` (e.g. `n1.9638/4`) the length/duration serializer emits for a
    // sample-derived value with no clean note-value fraction. The denominator
    // stays a no-leading-zero integer. An optional single `d`/`t` suffix scales the
    // value: `d` = dotted (×3/2, `n/4d` = dotted quarter = 3/8), `t` = triplet
    // (×2/3, `n/4t` = quarter triplet = 1/6, `n/8t` = eighth triplet = 1/12).
    // Mutually exclusive, no stacking (`("d"/"t")?` matches at most one); applies to
    // ANY numerator (`n3/8d` = 9/16). Kept in parity with the TS regexes in
    // barbeat-time.ts by note-value-grammar-parity.test.ts.
    const parts = text().split('/');
    const numerator = parts[0] === '' ? 1 : Number.parseFloat(parts[0]);
    const denominator = Number.parseInt(parts[1]);  // parseInt stops at a d/t suffix
    const value = numerator / denominator;
    return mod === "d" ? (value * 3) / 2 : mod === "t" ? (value * 2) / 3 : value;
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
// Horizontal whitespace only (no newlines): spacing inside a comma beat-list,
// where a newline must stay a top-level element separator, not get absorbed
// into the list (so `1|1,\n2|3` stays two elements, not one spaced list).
hs = [ \t]*