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

  // Maps a multiplicative operator character to its AST node type.
  const MULTIPLICATIVE_OP_TYPES = { "*": "multiply", "/": "divide", "%": "modulo" };

  // Borrow across bar lines so a `-n` range-bound offset can pull a position
  // earlier than beat 1 of its bar (e.g. `2|1-n/12` → bar 1, beat 4⅔ in 4/4).
  // The offset already produced a sub-1 `beat`; wrap it up into the previous
  // bar(s) using beatsPerBar. A pull before `1|1` is allowed: the bar goes to
  // 0 / negative and the bound resolves to negative time. Never throws.
  function borrowBars(bar, beat, beatsPerBar) {
    while (beat < 1) {
      beat += beatsPerBar;
      bar -= 1;
    }
    return { bar, beat };
  }

  // Targeted error for the removed synced-period syntax (Nt, N:Nt).
  function oldPeriodError(matched) {
    return `Period syntax "${matched}" is no longer supported. Use a note-value period with the "sync" keyword, e.g. sin(n/4, sync) for a quarter-note cycle, or cos(1bar, sync) for a bar-length cycle.`;
  }

  // Desugars a shorthand additive op (v±N, p±N) to the same shape the full form
  // produces in assignmentBody: subtract becomes add-of-negation, add stays add.
  function shorthandAdditive(parameter, operator, value) {
    if (operator === "subtract") {
      return { parameter, operator: "add", expression: { type: "subtract", left: 0, right: value } };
    }
    return { parameter, operator, expression: value };
  }

  // Intrinsic scalar note properties allowed inside a where() predicate. Selection-
  // derived note props (index, count), the next.* lookahead, and the clip/audio
  // namespaces are excluded: where() is evaluated during note SELECTION, before the
  // selected set (and thus index/count/next/legato) exists, so only per-note
  // intrinsic values are available.
  const PREDICATE_NOTE_PROPS = new Set([
    "velocity", "deviation", "duration", "probability", "pitch", "start",
  ]);

  // Functions rejected inside a where() predicate: they need the finalized note
  // SELECTION, which doesn't exist yet while selecting. legato() resolves to the
  // next distinct start / clip cursor of the selected set; seq() cycles by
  // note.index. Every other function (math, waveforms, ramp/curve, quant/swing,
  // snap/step, clipseq, rand/choose) resolves from per-note + clip context, which
  // selectAssignmentNotes threads into the predicate evaluator.
  const PREDICATE_REJECTED_FUNCTIONS = new Set(["legato", "seq"]);

  // Walk a where() predicate AST and reject anything that can't resolve during note
  // SELECTION: any variable other than the six intrinsic note properties, and the
  // two selection-derived functions (legato/seq). Throws a targeted error; returns
  // nothing on success. Number literals are bare JS numbers (not objects) and pass
  // through; pitch/duration domain literals are allowed. Allowed functions recurse
  // into their args so a rejected variable nested in an arg is still caught.
  function validatePredicate(node) {
    if (node == null || typeof node !== "object") {
      return;
    }
    switch (node.type) {
      case "or":
      case "and":
      case "comparison":
      case "add":
      case "subtract":
      case "multiply":
      case "divide":
      case "modulo":
        validatePredicate(node.left);
        validatePredicate(node.right);
        return;
      case "not":
        validatePredicate(node.operand);
        return;
      case "variable":
        if (node.namespace !== "note" || !PREDICATE_NOTE_PROPS.has(node.name)) {
          throw new Error(`where() predicates can only reference note properties (note.velocity, note.deviation, note.duration, note.probability, note.pitch, note.start). Got "${node.namespace}.${node.name}" — note.index/count, next.*, and clip.* aren't available while selecting notes.`);
        }
        return;
      case "function":
        if (PREDICATE_REJECTED_FUNCTIONS.has(node.name)) {
          const dep = node.name === "legato" ? "the legato target (next distinct start)" : "note.index";
          throw new Error(`where() predicates can't use ${node.name}() — it depends on ${dep}, which isn't known while selecting notes. Use note properties, math (abs/min/max/clamp/round/…), waveforms (sin/tri/…), or clipseq instead.`);
        }
        node.args.forEach(validatePredicate);
        return;
      default:
        return;
    }
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

  // Fold a list of selector segments (each a pitch / time / where piece, parsed in
  // any order) into the single { pitchRange, timeRange, predicate } shape the
  // statement rule consumes. Each kind may appear at most once — a duplicate is a
  // user mistake (two pitch selectors AND-combine to the empty set). Rather than
  // throw (which would abort the WHOLE transforms string, killing the other
  // lines), keep the first occurrence and record a `selectorWarning`. The
  // evaluator relays it as a WARNING and skips just this line, so the remaining
  // lines still apply — the warn-and-skip pattern used across the transform tool.
  // `matched` is the raw prefix text, for the message.
  function combineSelectorSegments(segments, matched) {
    let pitchRange = null;
    let timeRange = null;
    let predicate = null;
    const label = matched.trim();
    const reasons = [];
    const warnedKinds = new Set();
    // Note a duplicate kind once (a pitch appearing 3x is still one message).
    function noteDuplicate(kind, reason) {
      if (!warnedKinds.has(kind)) {
        warnedKinds.add(kind);
        reasons.push(reason);
      }
    }
    for (const seg of segments) {
      if (seg.kind === "pitch") {
        if (pitchRange != null) {
          noteDuplicate("pitch", "duplicate pitch selector (span multiple pitches with a range like C3-E3)");
          continue;
        }
        pitchRange = seg.pitchRange;
      } else if (seg.kind === "time") {
        if (timeRange != null) {
          noteDuplicate("time", "duplicate time selector (use a single range like 1|1-3|1)");
          continue;
        }
        timeRange = seg.timeRange;
      } else {
        if (predicate != null) {
          noteDuplicate("where", "duplicate where() (combine conditions with && / || inside one where(...))");
          continue;
        }
        predicate = seg.predicate;
      }
    }
    const selectorWarning = reasons.length
      ? `Skipping "${label}": ${reasons.join("; ")}.`
      : null;
    return { pitchRange, timeRange, predicate, selectorWarning };
  }
}}

start
  = __ head:statement? tail:((_ nl _)+ statement)* __ {
    // A single shorthand token may desugar to multiple assignments (e.g. the
    // `vA-B` velocity range emits velocity + deviation), so flatten one level.
    const statements = [head, ...tail.map(t => t[1])].filter(Boolean).flat();
    return statements;
  }


// A transform line is either a parameter assignment (the common case) or a
// note-count operation (ratchet/merge/split/repeat). Both accept the same optional
// `selector:` prefix and run in the same sequential pipeline.
statement "statement"
  = prefix:selectorPrefix? body:(noteOp / assignmentBody) {
    const pitchRange = prefix?.pitchRange ?? null;
    const timeRange = prefix?.timeRange ?? null;
    const predicate = prefix?.predicate ?? null;
    const selectorWarning = prefix?.selectorWarning ?? null;
    const isNoteOpBody = !Array.isArray(body) && body.kind === "noteOp";
    // A duplicate-selector line is already destined to be warn-and-skipped by the
    // evaluator (selectorWarning set), so don't hard-fail it on the where()-on-
    // noteOp rule below — let the skip take precedence.
    if (predicate != null && isNoteOpBody && selectorWarning == null) {
      // Note-count ops (ratchet/merge/split/repeat) don't support a where()
      // predicate. Reject rather than silently ignore so the limitation is visible.
      throw new Error(`where(...) is not supported on note-count operations (ratchet/merge/split/repeat) — put the predicate on a parameter assignment line instead.`);
    }
    // Only attach `predicate` when a where() clause is present, so non-predicate
    // assignments keep their historical shape (just pitchRange/timeRange).
    const predPart = predicate != null ? { predicate } : {};
    // A duplicate-selector line carries a warning for the evaluator to relay
    // before skipping; absent on well-formed lines so they keep their shape.
    const warnPart = selectorWarning != null ? { selectorWarning } : {};
    // A range shorthand (e.g. `vA-B`) yields an array of bodies; apply the same
    // selector + predicate to each so a single token's writes share one filter.
    if (Array.isArray(body)) {
      return body.map(b => ({ pitchRange, timeRange, ...predPart, ...warnPart, ...b }));
    }
    // Note ops carry only the positional selector (no predicate field).
    if (isNoteOpBody) {
      return { pitchRange, timeRange, ...warnPart, ...body };
    }
    return { pitchRange, timeRange, ...predPart, ...warnPart, ...body };
  }

// The optional `selector:` prefix. A list of selector segments — a pitch
// selector, a time selector, and/or a where() predicate — in ANY order, each
// separated by whitespace and/or an optional `:`, and terminated by a required
// `:`. Every combination AND-combines at apply time (a note must satisfy all),
// and each is per-line (no carry to neighboring lines).
//
// Order-free and colon-tolerant because LLMs reach for both freely: `Gb1 1|1-2|1
// where(...):`, `where(...): Gb1:`, and `Gb1: 1|1-2|1: where(...):` all parse the
// same. Each segment kind may appear at most once; a duplicate throws a targeted
// error (see combineSelectorSegments). The separating/terminating colon is only
// consumed where a segment or body genuinely follows, so a positional-only
// `Gb1: body` still parses (the body is not a segment, so the trailing `:` lands
// as the terminator, not a separator).
// Enumerated 1/2/3-segment forms (a selector has at most three distinct kinds).
// Listed longest-first so PEG tries the most segments and BACKTRACKS to fewer
// when the trailing `:` is missing — a possessive `*` can't give a segment back,
// which matters because a bare pitch is also a valid BODY (`C1: C4` = pitch
// selector C1, body "set pitch to C4"). With the longest-first ladder, the
// 2-segment parse of `C1: C4` finds no terminating `:` after C4 and falls through
// to the 1-segment parse, leaving C4 as the body.
selectorPrefix
  = a:selectorSegment selectorSep b:selectorSegment selectorSep c:selectorSegment _ ":" _ {
      return combineSelectorSegments([a, b, c], text());
    }
  / a:selectorSegment selectorSep b:selectorSegment _ ":" _ {
      return combineSelectorSegments([a, b], text());
    }
  / a:selectorSegment _ ":" _ {
      return combineSelectorSegments([a], text());
    }

// One piece of a selector prefix. Pitch starts with a note letter, time with a
// digit, where() with `w` — mutually exclusive first chars, so the ordered choice
// is unambiguous and order-free at the prefix level.
selectorSegment
  = pitchRange:pitchRange { return { kind: "pitch", pitchRange }; }
  / timeRange:timeRange { return { kind: "time", timeRange }; }
  / predicate:whereClause { return { kind: "where", predicate }; }

// Separator between two selector segments: an optional `:` (with surrounding
// space), or bare whitespace. Always consumes at least one character (a `:` or a
// space), so two segments never silently abut.
selectorSep
  = _ ":" _
  / [ \t]+

// Note-count operations: statements that change how many notes exist, rather
// than assigning a value to a parameter. They reuse the `selector:` prefix above
// to scope which notes they touch (no selector = all notes).
//   ratchet(N)        — divide each matched note into N equal pieces (a roll)
//   ratchet(n/16)     — cut each matched note on the absolute 16th-note grid
//   repeat(n/8)       — echo matched notes an 8th later (1 copy; does NOT resize clip)
//   repeat(1bar, 3)   — three echoes, each a further bar on
//   split(2|1, 2|3)   — cut each matched note at explicit clip bar|beat positions
//   split(2|1, sync)  — same, but positions are arrangement-timeline absolute
//   merge()           — span all same-pitch matched notes into one sustained note
// These are NOT expression functions; using one as a value raises a targeted
// error (see badNoteOpInExpression). `split` takes a list of bar|beat positions
// (not expressions), so it has its own rule rather than sharing argumentList.
noteOp "note-count operation"
  = "split" "(" _ points:barBeatPointSyncList? _ ")" {
      return { kind: "noteOp", name: "split", args: points?.args ?? [], sync: points?.sync ?? false };
    }
  / name:noteOpName "(" _ args:argumentList? _ ")" {
      return { kind: "noteOp", name, args: args || [] };
    }

noteOpName
  = "ratchet" { return "ratchet"; }
  / "repeat" { return "repeat"; }
  / "merge" { return "merge"; }

// A comma-separated list of bar|beat cut positions for `split`, with an optional
// trailing `sync` keyword (mirrors the cyclical-function `sin(n/4, sync)` form).
// Without `sync` the positions are clip-relative (from `1|1`); with `sync` they
// are interpreted against the arrangement timeline at apply time.
barBeatPointSyncList
  = head:barBeatPoint tail:(_ "," _ barBeatPoint)* _ "," _ "sync" {
    return { args: [head, ...tail.map(t => t[3])], sync: true };
  }
  / head:barBeatPoint tail:(_ "," _ barBeatPoint)* {
    return { args: [head, ...tail.map(t => t[3])], sync: false };
  }

// A single bar|beat position (same dialect as a timeRange bound), resolved to
// absolute musical beats from the clip's `1|1` origin. `beatValue` is 1-indexed
// and already folds in any `±n` note-value offset (in musical beats), so the
// position is linear: (bar - 1) * beatsPerBar + (beat - 1). A pulled offset may
// land below beat 1 (negative musical beats, before the clip start); that simply
// falls outside every note at apply time. Consumed by `split` only.
barBeatPoint "bar|beat position"
  = bar:oneOrMoreInt "|" beat:beatValue {
    const beatsPerBar = options.beatsPerBar ?? 4;
    return { type: "barBeatPoint", musicalBeats: (bar - 1) * beatsPerBar + (beat - 1) };
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
// the same { parameter, operator, expression } shape as the full forms (the
// `vA-B` velocity range is the one exception: it emits two assignments —
// velocity + deviation). velocity/probability also accept additive ops
// (v±N, p±N) — safe because both domains are non-negative, so a leading sign is
// unambiguous.
shorthand "shorthand assignment"
  = "delete" {
      // Readable alias for the `v0` delete shorthand: set velocity to 0, which
      // the deletion sweep removes. Emits the SAME AST as `v0`, so a selector
      // still applies (`C1: delete`, `where(note.velocity < 40): delete`) and
      // `preTransforms` accepts it too. Shorthand-only: `velocity = delete` and
      // any expression use are rejected by badDeleteInExpression. No 'd'-pitch
      // clash — pitchLiteral requires an octave, so it backtracks off "delete".
      return { parameter: "velocity", operator: "set", expression: 0 };
    }
  / "v" operator:shorthandAddOp value:unsignedInt {
      return shorthandAdditive("velocity", operator, value);
    }
  / "v" min:unsignedInt "-" max:unsignedInt {
      // Velocity range = humanized random velocity, matching the bar|beat notes
      // layer's `vA-B`. Desugar to two ordinary assignments (base velocity +
      // velocity_deviation), mirroring the barbeat interpreter's mapping: clamp
      // each bound to 0-127, order-independent, deviation = high - low. Must be
      // tried before plain `vN` (which would match `v80` and strand `-120`).
      // Kept in lockstep by velocity-range-parity.test.ts (Peggy cannot import
      // the barbeat helper).
      //
      // Reject a 0 lower bound (covers `v0-N` / `vN-0` / `v0-0` via the single
      // `min === 0` check): base velocity 0 is the delete sentinel, so the range
      // would silently delete every note it touches. Byte-for-byte mirror of the
      // barbeat-grammar.peggy `velocity` rule's guard.
      if (Math.min(min, max) === 0) {
        throw new Error(`"${text()}" is invalid: velocity ranges must start at 1 or higher — v0 is the delete sentinel, not a range floor. Use v1-N for a low humanization floor, or a bare v0 to delete.`);
      }
      const lo = Math.max(0, Math.min(127, Math.min(min, max)));
      const hi = Math.max(0, Math.min(127, Math.max(min, max)));
      return [
        { parameter: "velocity", operator: "set", expression: lo },
        { parameter: "deviation", operator: "set", expression: hi - lo },
      ];
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
  / left:barDuration sign:("+" / "-") right:nDuration {
      // Mixed `Nbar±n<frac>` shorthand (e.g. `1bar+n/4`, or `1bar-n/16` = almost
      // a full bar), matching the bar|beat authoring token. Must precede the
      // bare `barDuration` branch so the ±n tail is consumed here, not stranded.
      // Desugars to the same add/subtract(barDuration, nDuration) node the full
      // `duration = 1bar±n/4` form builds via the additive rule, giving bar|beat
      // <-> transform-shorthand parity for the combined token. The `nDuration`
      // right operand also inherits its targeted "needs a denominator" error for
      // `1bar+n2.5`.
      return {
        parameter: "duration",
        operator: "set",
        expression: { type: sign === "+" ? "add" : "subtract", left, right },
      };
    }
  / expression:barDuration {
      return { parameter: "duration", operator: "set", expression };
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
      return { type: "pitchLiteral", value: pitch, name: `${pitchClass.name}${octave}` };
    }
    throw new Error(`MIDI pitch ${pitch} (${pitchClass.name}${octave}) outside valid range 0-127`);
  }

pitchClass
  = letter:[A-Ga-g] accidental:pitchAccidental? {
      return pitchClassFromParts(letter, accidental);
    }

pitchAccidental
  = "#" / "b" / "B" / "♯" / "♭"

// Whole-bar wildcard (`N|*`) and a span of whole bars (`A|*-B|*`) select every
// note in the named bar(s). Both desugar to a half-open range [first|1, after|1)
// — `endBar` is the bar AFTER the last selected bar and `endExclusive` drops a
// note that lands exactly on that downbeat, so `3|*` is precisely "all of bar 3"
// with no spill onto 4|1. The `<` marker on a normal range (`3|1-<4|1`) makes
// only its end bound exclusive; without it ranges stay inclusive on both ends.
// Wildcard forms come first so the `*` branches win before the beatValue branch.
// A bare bar|beat point (`4|3.5`) comes LAST so the range branch claims a real
// `start-end` first; only a point with no `-` separator falls through to it.
timeRange "time range"
  = startBar:oneOrMoreInt "|" "*" "-" endBar:oneOrMoreInt "|" "*" {
    // Reject a descending span, mirroring the beatValue range guard below: an
    // end bar before the start bar silently selected nothing (a warn-free no-op).
    // Equal bars stay valid (`3|*-3|*` == `3|*`).
    if (endBar < startBar) {
      throw new Error(`Invalid time range: end ${endBar}|* is before start ${startBar}|*`);
    }
    return { startBar, startBeat: 1, endBar: endBar + 1, endBeat: 1, endExclusive: true };
  }
  / bar:oneOrMoreInt "|" "*" {
    return { startBar: bar, startBeat: 1, endBar: bar + 1, endBeat: 1, endExclusive: true };
  }
  / startBar:oneOrMoreInt "|" startBeat:beatValue "-" excl:"<"? endBar:oneOrMoreInt "|" endBeat:beatValue {
    const beatsPerBar = options.beatsPerBar ?? 4;
    const start = borrowBars(startBar, startBeat, beatsPerBar);
    const end = borrowBars(endBar, endBeat, beatsPerBar);
    // Reject a descending/inverted range at parse, mirroring pitchRange's
    // "end is lower than start" guard. Without this, end-before-start silently
    // selects no notes (a warn-free no-op). Equal bounds stay allowed (a point
    // range). Compare absolute musical beats so an offset/borrow is respected.
    const startAbs = (start.bar - 1) * beatsPerBar + (start.beat - 1);
    const endAbs = (end.bar - 1) * beatsPerBar + (end.beat - 1);
    if (endAbs < startAbs) {
      throw new Error(`Invalid time range: end ${endBar}|${endBeat} is before start ${startBar}|${startBeat}`);
    }
    const range = {
      startBar: start.bar,
      startBeat: start.beat,
      endBar: end.bar,
      endBeat: end.beat
    };
    // Only the `<` marker makes the end exclusive; otherwise leave the field
    // absent so a default range serializes to the legacy inclusive shape.
    if (excl != null) range.endExclusive = true;
    return range;
  }
  / bar:oneOrMoreInt "|" beat:beatValue {
    // Bare bar|beat point (`4|3.5`, or `Gb1 4|3.5` paired with a pitch): target
    // only the note starting at exactly this position. Desugars to a degenerate
    // inclusive range [point, point] — the membership gate is inclusive on both
    // ends, so a zero-width range matches a note whose start equals the point and
    // nothing else (the same notes the explicit `4|3.5-4|3.5` range already
    // catches; this is just the sugar). Reached only after the range branch
    // fails for lack of a `-` separator. Borrows across the bar line like a range
    // bound so a `-n` offset (`2|1-n/12`) canonicalizes into the previous bar.
    const beatsPerBar = options.beatsPerBar ?? 4;
    const point = borrowBars(bar, beat, beatsPerBar);
    return { startBar: point.bar, startBeat: point.beat, endBar: point.bar, endBeat: point.beat };
  }

// A range-bound beat position. Same dialect as bar|beat note positions
// (`beatValue` in barbeat-grammar.peggy): a 1-based grid beat optionally
// displaced by an absolute note-value offset (`+n/12` = plus an eighth triplet,
// `-n/24` = minus a 32nd triplet). The offset is a whole-note fraction — a note
// value, so it is meter-INVARIANT in absolute time; `options.timeSigDenominator`
// only multiplies it into musical beats (the grid's unit) to add to the grid
// beat, a factor that cancels when musical beats convert to Ableton beats.
// Dyadic sub-beats may use a plain decimal (`1.5`). Bare
// fractions (`4/3`) and mixed numbers (`1+1/3`) are intentionally rejected so a
// beat reads the same in a range bound as in a note position. A `-n` offset may
// resolve below beat 1 ("just before the downbeat"); `timeRange` borrows across
// the bar line to canonicalize it, and a pull before 1|1 resolves to negative
// time (the bound sits before the clip start).
//
// The sign branches are split (unlike barbeat's combined `("+"/"-")`) because a
// range's `-` separator collides with a `-` offset sign: `1|1-2|1` is the
// whole-beat range "beat 1 to bar 2 beat 1", not "beat 1 minus 2". Requiring an
// `n` after the sign disambiguates — `-` is an offset only in `-n/...`, else it
// falls through to the separator. The targeted bad-offset error is kept only
// for `+` (the removed mixed-number form `1+1/3`); negative offsets never
// existed before this reform, so a malformed `-...` simply fails to parse.
beatValue
  = base:oneOrMoreDecimal "+n" frac:unsignedFraction {
      // The offset base is a decimal beat (`1|1.5+n/4`), not just an integer:
      // `oneOrMoreDecimal` subsumes integers (and stays >= 1), so the result is
      // always >= 1. Additive — no existing parse changes.
      return base + frac * (options.timeSigDenominator ?? 4);
    }
  / base:oneOrMoreDecimal "-n" frac:unsignedFraction {
      // May resolve below beat 1 (e.g. `2|1-n/12`, "just before the downbeat");
      // `timeRange` borrows across the bar line to canonicalize it. A pull
      // before 1|1 resolves to negative time. So return the raw beat even < 1.
      return base - frac * (options.timeSigDenominator ?? 4);
    }
  / oneOrMoreDecimal "+" bad:badBeatOffset {
      // Decimal base (`1|1.5+2`) gets the same targeted steer as the integer
      // base (`1|1+2`); `oneOrMoreDecimal` subsumes integers, and the valid
      // `oneOrMoreDecimal "+n" frac` branch above is tried first, so a real
      // `1.5+n/4` still wins. Without this, a decimal base fell through to a
      // generic peggy error.
      throw new Error(`beat offsets use the note-value form: 1|1+n/12 = beat 1 + an eighth triplet, 1|2-n/24. Got ${text()} — note-value offsets need the n prefix (write +n/3, not +${bad}).`);
    }
  / bad:bareFractionBeat {
      throw new Error(`beat positions are a grid beat with an optional note-value offset (1|1, 1|1+n/12) or a decimal (1|1.5). Got bare fraction ${bad} — write the grid+offset form instead (4/3 → 1+n/12).`);
    }
  / badZeroBeat
  / oneOrMoreDecimal

// A 0-indexed range bound (`1|0-2|1`): beats count from 1 in time ranges too, so
// a leading 0 can only be this mistake. Raises a targeted error; never returns a
// value. Mirrors the barbeat note grammar's `badZeroBeat` (Peggy can't share a
// rule across grammars). The `1|0`-as-pickup reading is deliberately not taught.
badZeroBeat
  = "0" [0-9]* ("." [0-9]*)? {
      throw new Error(`beats are 1-indexed: the downbeat is beat 1 (e.g. 1|1); for a pickup before it, offset from beat 1 (e.g. 1|1-n/4). Got beat ${text()}.`);
    }

// Old bare-fraction beat (`4/3`); matched only to raise a targeted error.
bareFractionBeat
  = [1-9] [0-9]* "/" [1-9] [0-9]* { return text(); }

// Tail of an old `int+fraction` mixed beat (`1+1/3`); for targeted errors only.
badBeatOffset
  = unsignedMixedNumber { return text(); }
  / unsignedFraction { return text(); }
  / unsignedDecimal { return text(); }

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

// A where() predicate: a boolean expression over note properties that filters which
// notes a statement touches. Boolean/comparison operators are legal ONLY here — an
// assignment RHS stays purely arithmetic. `validatePredicate` rejects any
// non-note-property variable and the two selection-derived functions (legato/seq)
// with a targeted error; other functions are allowed (resolved at selection time).
whereClause "where() predicate"
  = "where" _ "(" _ expr:boolOr _ ")" {
      validatePredicate(expr);
      return expr;
    }

// Boolean precedence, lowest-binding first: || < && < ! < comparison. Comparison
// operands are full arithmetic `expression`s, so arithmetic binds tighter than any
// comparison. Left-associative folds mirror the arithmetic rules.
boolOr
  = head:boolAnd tail:(_ "||" _ boolAnd)* {
      return tail.reduce((left, t) => ({ type: "or", left, right: t[3] }), head);
    }

boolAnd
  = head:boolNot tail:(_ "&&" _ boolNot)* {
      return tail.reduce((left, t) => ({ type: "and", left, right: t[3] }), head);
    }

boolNot
  = "!" _ operand:boolNot { return { type: "not", operand }; }
  / boolPrimary

// Boolean grouping: parens around a full boolean expression (`a && (b || c)`, or the
// reflexive `(note.velocity > 80)`). Tried before the bare comparison so a
// parenthesized predicate groups at the boolean layer; a paren wrapping only
// arithmetic (`(1 + 2) > 3`) backtracks to the comparison branch, where the
// arithmetic `expression` rule consumes the parens via its own `( expr )` primary.
boolPrimary
  = "(" _ expr:boolOr _ ")" { return expr; }
  / comparison

comparison
  = left:expression _ op:comparisonOp _ right:expression {
      return { type: "comparison", op, left, right };
    }

// Two-char operators precede their one-char prefixes so `>=`/`<=` win over `>`/`<`.
comparisonOp
  = ">=" { return ">="; }
  / "<=" { return "<="; }
  / "==" { return "=="; }
  / "!=" { return "!="; }
  / ">" { return ">"; }
  / "<" { return "<"; }

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
  / barDuration
  / pitchLiteral
  / badPeriod
  / badNoteOpInExpression
  / badDeleteInExpression
  / number
  / "(" _ expr:expression _ ")" { return expr; }

// ratchet()/repeat()/merge() are note-count operations (whole statements), not
// values. Matched here only to raise a targeted error when one is used in an
// expression (e.g. `velocity = ratchet(2)`). A valid bare statement reaches the
// noteOp rule first, so this never fires on correct usage.
badNoteOpInExpression
  = name:("ratchet" / "repeat" / "merge" / "split") _ "(" {
    const example = name === "ratchet" ? "ratchet(2)" : name === "repeat" ? "repeat(1bar)" : name === "split" ? "split(2|1)" : "merge()";
    throw new Error(`${name}() is a note-count operation, not a value — put it on its own line (optionally with a selector), e.g. "${example}", not inside an expression.`);
  }

// `delete` is the shorthand delete action (alias for `v0`), not a value. Matched
// here only to raise a targeted error when used in an expression (e.g.
// `velocity = delete`). A valid bare `delete` reaches the shorthand rule first,
// so this never fires on correct usage.
badDeleteInExpression
  = "delete" {
    throw new Error(`delete is a shorthand action, not a value — write it on its own line (optionally with a selector), e.g. "where(note.velocity < 40): delete", not "velocity = delete".`);
  }

nDuration "absolute duration value"
  = badBarDuration
  / "n" frac:unsignedFraction {
    return { type: "nDuration", wholeNoteFraction: frac };
  }
  / "n" bad:badAbsoluteValue {
    throw new Error(`durations need a denominator: n/4 = quarter, n/8 = eighth, n/12 = eighth triplet. Got n${bad}`);
  }

// `n`-prefixed bar duration (`n1bar`, `n/1bar`, `n3/4bar`): a category error —
// the `n` sigil marks a note-value fraction (denominator required); bars are the
// bare `Nbar` form. Matched only to raise a targeted "did you mean Nbar" error.
badBarDuration
  = "n" ([0-9]* "/")? last:$([0-9]+) "bar" "s"? {
    throw new Error(`"${text()}" is invalid: bar durations don't use the "n" prefix — write Nbar (e.g. ${last}bar).`);
  }

// Meter-aware bar duration (`Nbar`): N bars = N * beats-per-bar musical beats
// (the same value as `N * clip.barDuration`). Matches the authoring/length-field
// `Nbar` token so the duration vocabulary is uniform across grammars. The mixed
// form `Nbar+n<frac>` composes through ordinary addition (e.g. `1bar+n/4` parses
// as `barDuration(1) + nDuration(1/4)`), so this rule matches only the bar token.
barDuration "bar duration value"
  = bars:oneOrMoreInt "bar" "s"? {
    // A plural `bars` (`2bars`) is accepted as a tolerance alias; output stays `bar`.
    return { type: "barDuration", bars };
  }

// Matches values that LOOK like a duration but lack the required denominator.
// Used only to produce a targeted error message — never returns a value.
badAbsoluteValue
  = unsignedMixedNumber { return text(); }
  / unsignedDecimal { return text(); }

// Matches the removed synced-period syntax (Nt, N:Nt) to throw a targeted error.
// Synced periods are now note-value expressions gated by the `sync` keyword. The
// period number (`unsignedFloat`) is matched WITHOUT the note-value `d`/`t` suffix
// (see below), so a bare-fraction period like `1/2t` still leaves its trailing `t`
// for this rule. A note-value triplet always wears the `n` sigil (`n/4t`) and is
// consumed by `nDuration` before this rule, so there is no conflict.
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

oneOrMoreDecimal
  = [1-9] [0-9]* ("." [0-9]*)? {
    return Number.parseFloat(text());
  }

// The number in the removed synced-period syntax (`Nt`, `N:Nt`) — used ONLY by
// `badPeriod`. BOTH the mixed-number and bare-fraction alternatives spell the
// fraction inline WITHOUT the `d`/`t` note-value suffix that `unsignedFraction`
// now carries, so a bare-fraction (`1/2t`) OR mixed-number (`1+1/2t`, incl. the
// colon form `2:1+1/2t`) period leaves its trailing `t` for badPeriod to detect.
// (Routing the mixed number through `unsignedMixedNumber`/`unsignedFraction` would
// let it swallow the `t` and mask the removed syntax — the friendly steer is lost
// and a raw parser error surfaces instead.)
unsignedFloat
  = unsignedInt "+" ([0-9]+ "." [0-9]+ / [0-9]*) "/" [1-9] [0-9]*
  / ([0-9]+ "." [0-9]+ / [0-9]*) "/" [1-9] [0-9]*
  / unsignedDecimal

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
    // Mutually exclusive, no stacking; applies to ANY numerator. Kept in parity
    // with the TS regexes in barbeat-time.ts by note-value-grammar-parity.test.ts.
    const parts = text().split('/');
    const numerator = parts[0] === '' ? 1 : Number.parseFloat(parts[0]);
    const denominator = Number.parseInt(parts[1]);  // parseInt stops at a d/t suffix
    const value = numerator / denominator;
    return mod === "d" ? (value * 3) / 2 : mod === "t" ? (value * 2) / 3 : value;
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
