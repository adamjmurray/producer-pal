# |beat Shortcut Implementation Plan

## Goal

Allow `|beat` syntax to reuse the current bar number, reducing redundancy in
bar|beat notation.

## Changes

### 1. Grammar Update (`src/notation/barbeat/barbeat-grammar.peggy`)

- Modify the `time` rule to accept `"|" beat:positiveFloat`
- Return `{ bar: null, beat }` to signal "use current bar"

### 2. Parser Update (`src/notation/barbeat/barbeat-parse-notation.js`)

- In the AST processing loop, check if `element.bar === null`
- If null, keep `currentTime.bar` and only update `currentTime.beat`

### 3. Test Coverage (`src/notation/barbeat/barbeat-parse-notation.test.js`)

- Add test: basic |beat usage within same bar
- Add test: |beat after bar change
- Add test: mixed full bar|beat and |beat notation
- Add test: |beat at start should error (no current bar set)

### 4. Update Documentation

- `src/notation/barbeat/barbeat-description.js`: Add |beat shortcut explanation
- `src/mcp-server/tool-def-create-clip.js`: Update description to mention
  shortcut

## Example Test Case

```javascript
const result = parseNotation("1|1 C3 |2 D3 |3 E3 2|1 F3 |2 G3");
// C3 at 1|1, D3 at 1|2, E3 at 1|3, F3 at 2|1, G3 at 2|2
```
