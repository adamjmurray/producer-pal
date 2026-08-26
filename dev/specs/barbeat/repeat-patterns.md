# Repeat Patterns

Repeat patterns generate sequences of beat positions using the syntax
`{start}x{times}@{step}`, eliminating the need to list long sequences manually.

## Syntax

```
bar|{start}x{times}@{step}
```

- **start**: Starting beat position — the same dialect as note positions: a
  whole beat, a decimal sub-beat (`1.5`), or an integer-or-decimal grid beat
  plus a `±n` note-value offset (`1+n/12`, `1.5+n/12`). Bare fractions (`4/3`)
  and bar-relative mixed numbers (`1+1/3`) are rejected
- **times**: Number of repetitions (positive integer)
- **step**: Interval between repetitions, **same note-value duration grammar as
  `n`** — `@n<fraction>` note value (denominator mandatory, numerator defaults
  to 1, so `@n/4` == `@n1/4`), `@Nbar` meter-aware bars (`@1bar`), or
  `@Nbar+n<fraction>` mixed (`@1bar+n/4`). Bare fractions (`@/4`), bare integers
  (`@1`), decimals (`@0.5`), and mixed numbers (`@1+1/2`) are invalid and raise
  a parser error — the `n` prefix marks a note value, bars use `Nbar`. Like the
  other duration sites, an `n`-prefixed bar step (`@n1bar`, `@n/1bar`,
  `@n3/4bar`) raises the targeted "bar steps don't use the `n` prefix — write
  @Nbar" error, and a plural `@2bars` is accepted as a tolerance alias of
  `@Nbar`

The `@` symbol reads as "at intervals" and semantically connects to bar copy
operations.

## Examples

**Quarter notes:**

```
1|1x4@n/4         // 4 positions a quarter apart: beats 1,2,3,4 in 4/4
```

**Triplets:**

```
1|1x3@n/12        // eighth-note triplet (3 in a quarter): beats 1, 4/3, 5/3 in 4/4
1|1x3@n/6         // quarter-note triplet (3 in a half): beats 1, 5/3, 7/3 in 4/4
1|3x3@n/12        // eighth-note triplet starting at beat 3
```

**16th notes:**

```
1|4x4@n/16        // four 16ths on beat 4: 4, 17/4, 18/4, 19/4
1|1x16@n/16       // 16 sixteenths = 4 quarters (a full bar in 4/4)
```

**Eighth notes:**

```
1|1x8@n/8         // eight 8ths: 1, 3/2, 2, 5/2, ..., 9/2 in 4/4
```

**Note-value offset starts (positions stay meter-relative):**

```
1|2+n/12x3@n/12   // start at 2+1/3 (beat 2 + eighth triplet), three steps
```

**Step omitted** (defaults to the current duration):

```
n/8 C1 1|1x4     // 4 eighths starting at 1|1 (step defaults to n value)
```

## Behavior

**Bar overflow**: Patterns naturally overflow into subsequent bars:

```
1|3x6@n/4         // 3,4,5,6,7,8 → 1|3, 1|4, 2|1, 2|2, 2|3, 2|4 in 4/4
```

**Mixing with regular beats**: Combine repeat patterns with explicit beats:

```
C1 1|1x4@n/4,3.5  // Beats 1,2,3,4,3.5 (beat 3.5 listed explicitly)
```

**Multiple patterns**: Use multiple repeat patterns in one beat list:

```
C1 1|1x2@n/4,3x2@n/8  // Beats 1,2,3,3.5 in 4/4
```

**Sticky per-item `bar|`**: A comma beat-list opens with `bar|`, and any later
item may **restate its own `bar|`**. An explicit bar updates a running "current
bar"; bare items inherit the most recent one. This lets a single list span bars
without splitting it across whitespace:

```
8|2,8|2.5          // both in bar 8 (the item restates the bar)
1|1,2|3            // bar 1 beat 1, then bar 2 beat 3
1|1,2|1,3          // 1|1, 2|1, 2|3  (the bare 3 inherits bar 2)
1|1,2,2|1,2        // bar 1 beats 1,2 then bar 2 beats 1,2
```

This is purely input tolerance — the bar-grouped form (`1|1,2 2|1,2`,
whitespace-separated) still works and serialization is unchanged. **Whitespace
after a comma is allowed** (`1|1, 2, 3`), and a **single trailing comma** is
ignored (`1|1,2,`). The comma separator stays on one logical line: a newline is
not absorbed into the list, so `1|1,2` then a newline then `2|3` remains two
separate time positions.

## Interaction with Other Features

**Pitch buffering**: All buffered pitches emit at each expanded position:

```
C3 D3 E3 1|1x4@n/4   // C3, D3, E3 at each of beats 1,2,3,4
```

**State parameters**: Velocity, duration, probability apply to all positions:

```
v80 n/8 C1 1|1x4@n/4 // All four notes have v80 and an eighth-note duration
```

**Bar copy**: Repeat patterns work with bar copy operations:

```
C1 1|1x4@n/4         // Bar 1: kick on every beat
@2=1                // Bar 2: copy of bar 1
```

## Validation

**Maximum repetitions**: Parser warns if `times > 100` (excessive notes)

**Step size**: Must be greater than 0 (validated in grammar)

**Start position**: Must be ≥ 1 (enforced by grammar)
