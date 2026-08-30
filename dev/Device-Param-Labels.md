# Device Parameter Labels

A `DeviceParameter` exposes no unit and no display range — only `min`, `max` and
`value` as raw numbers, plus `str_for_value(raw)`, which returns whatever string
Live would print. So everything we tell a model about a param, and everything we
do with a value it writes back, is reverse-engineered from those labels.

Read: `device-display-helpers.ts` builds the param result. Write:
`update-device-param-setters.ts` picks a path, and `param-display-search.ts`
maps a display value back to a raw one.

## The shapes Live prints

| Shape              | Example                    | Handled by                              |
| ------------------ | -------------------------- | --------------------------------------- |
| Number with a unit | `"1.00 kHz"`, `"-6 dB"`    | `parseLabel` pattern                    |
| Bare number        | `"4.00"`, `8`              | `parseLabel` fallback + the units table |
| Enum               | `"Peak"`, `"Expand"`       | `is_quantized` + `value_items`          |
| Division ladder    | `"1/16"`, `"1 / 16"`       | `isDivisionParam` → enumerated options  |
| Ratio              | `"4.00 : 1"`, `"1 : 2.00"` | `parseLabel` ratio patterns             |
| Pan                | `"50L"`, `"C"`             | `isPanLabel`                            |
| Note name          | `"C4"`                     | `parseLabel` pattern                    |
| A word at one end  | `"A"`, `"inf : 1"`         | sentinel trim in `readNumericRange`     |

## Traps

**A bare-number label arrives as a JS number, not a string.** Max converts it.
Always go through `strForValue`, which coerces — an uncoerced number fails
`parseLabel`'s type guard and drops the param back to raw units on both paths.

**A label with two numbers in it means one of them.** The no-unit fallback takes
the leading number, which is right for `"4.00 : 1"` and wrong for `"1 : 2.00"` —
every expansion ratio would read as 1, collapsing its range to a point. The two
ratio patterns handle both forms, and the fallback refuses anything with a colon
so an unrecognized ratio (`"inf : 1"`) reaches the sentinel trim instead.

**Live spaces the same construct differently per param.** Auto Filter's
`LFO S&H` reads `"1 / 16"`; its `LFO Rate` reads `"1/16"`. Division matching is
whitespace-insensitive on both sides for this reason.

**A division ladder is not fractions all the way down.** Sync rates run from bar
counts up to fractions — `"8"`, `"4"`, `"2"`, `"1"`, `"1/2"` … `"1/64"`.
Detection has to check the max end too, because a param sitting in the bar half
shows a bare number at both its current value and its minimum.

**The display doesn't always rise with the raw value.** Multiband Dynamics'
ratios count down. `param-display-search.ts` negates the display for those so
one binary search serves both directions; the search would otherwise walk the
wrong way and land anywhere.

**A display range collapsed to a point is not writable.** If every raw value
prints the same label there is no way back from a display value, and the search
returns the middle of the raw range while reporting success. That case warns and
skips. A param whose _raw_ range is a single point is different — it has exactly
one value, and the linear branch lands on it.

**Recorded units are keyed by range, not just by name.** `known-param-units.ts`
holds units Live states in its UI but never returns. A param that shares a name
with a recorded one is not the same control: Erosion's `Filter Width` is octaves
over 0.1–2.5, while every 0.5–9 param that sounds like it — `Filter Width` on
Beat Repeat, Delay, Filter Delay and Overdrive, Corpus `Width`, Reverb
`Input Width`, Roar `FB Width` and `Env Width` — is a bandwidth control Live
gives no unit. The range is part of the key so a Live version that moves a range
drops the entry rather than reporting a stale unit.

**A param name is not unique within a device.** Corpus exposes two called
`Width`: a filter bandwidth on 0.5–9 and a stereo width on 0–100 %. A write by
that name matches both, so it warns with each param's id and writes neither —
picking the first lands a value on a control the caller may not have meant and
reports success. Corpus is the only stock device with a repeated name, but a
rack with two macros renamed the same is easy to build.

## Checking a param for real

Labels are the only source of truth, and they can only be read from a running
Live. `ppal-live-api` (a debug build, plus
`POST /config {"liveApiEnabled":true}`) reads raw `min`/`max` and calls
`str_for_value` at any raw value — enough to see a param's real ladder. A unit
that appears only in prose has to be read by hovering the control in Live and
reading the Info View; it is not in the LOM.
