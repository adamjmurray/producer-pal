---
name: Producer Pal Refactoring Guidelines
description: Code refactoring principles for Producer Pal - when to extract functions, how to organize code, naming conventions, and complexity management
---

# Producer Pal Refactoring Guidelines

## Automatic Triggers

Apply these guidelines when:
- ESLint reports `max-lines-per-function`, `max-lines`, `max-depth`, or `complexity` violations
- Function exceeds 120 lines of code (not blank, not comment lines)
- Nesting depth exceeds 4 levels
- User requests refactoring or code cleanup
- Code review reveals duplication or complexity

## Refactoring Principles

### When to Extract Functions

**Always extract when:**
- Function >120 lines of code (not blank, not comment lines)
- Nesting depth >4 levels
- Logic repeated 2+ times (DRY)
- Complex conditional that needs a name

**Consider extracting when:**
- Function >50 lines with high complexity
- Multiple responsibilities in one function
- Business logic mixed with data manipulation
- Inner loop/conditional bodies are complex

### Function Organization Strategy
```javascript
// ✅ GOOD - Single responsibility, early returns
function processClip(clipId) {
  if (!clipId) return null;
  
  const clip = getClip(clipId);
  if (!clip) return null;
  
  return transformClipData(clip);
}

// ❌ BAD - Multiple responsibilities, nested conditions
function processClip(clipId) {
  if (clipId) {
    const clip = getClip(clipId);
    if (clip) {
      const notes = [];
      for (const note of clip.notes) {
        if (note.pitch > 60) {
          notes.push({ ...note, velocity: note.velocity * 0.8 });
        }
      }
      return { ...clip, notes };
    }
  }
  return null;
}
```

### Naming Conventions

**Functions:**
- Verb phrases: `createClip`, `validateInput`, `calculateDuration`
- Boolean returns: `isValid`, `hasNotes`, `canPlay`
- Avoid abbreviations: `getDuration` not `getDur`
- Be specific: `getActiveClipNotes` not `getData`

**Variables:**
- Descriptive: `clipStartTime` not `t`
- Booleans: `isLooping`, `hasDevices`, `shouldUpdate`
- Constants: `MAX_SLICES`, `DEFAULT_TEMPO`

### File Size & Organization

**Max lines per file:**
- Source files: 600 lines
- Test files: 800 lines

**When to split:**
- Multiple unrelated responsibilities
- File exceeds limits
- Natural feature boundaries exist

**Module structure order:**
```javascript
// 1. Imports (external first, then internal)
import { z } from 'zod';
import { barBeatToAbletonBeats } from '../../notation/barbeat/barbeat-time.js';

// 2. Constants
const MAX_CLIPS = 64;
const DEFAULT_VELOCITY = 100;

// 3. Helper functions (private, not exported)
function validateClipId(id) { }

// 4. Main functions (exported)
export function createClip(args) { }

// 5. Default export (if any)
export default { createClip };
```

## Refactoring Patterns

### Pattern 1: Extract Validation
```javascript
// BEFORE
function createClip(args) {
  if (!args.trackIndex || args.trackIndex < 0) {
    throw new Error('Invalid trackIndex');
  }
  if (!args.view || !['session', 'arrangement'].includes(args.view)) {
    throw new Error('Invalid view');
  }
  // ... main logic
}

// AFTER
function validateCreateClipArgs(args) {
  if (!args.trackIndex || args.trackIndex < 0) {
    throw new Error('Invalid trackIndex');
  }
  if (!args.view || !['session', 'arrangement'].includes(args.view)) {
    throw new Error('Invalid view');
  }
}

function createClip(args) {
  validateCreateClipArgs(args);
  // ... main logic
}
```

### Pattern 2: Flatten Nesting with Early Returns
```javascript
// BEFORE (depth 4)
function processNotes(clip) {
  if (clip) {
    if (clip.notes) {
      if (clip.notes.length > 0) {
        for (const note of clip.notes) {
          // process note
        }
      }
    }
  }
}

// AFTER (depth 1)
function processNotes(clip) {
  if (!clip?.notes?.length) return;
  
  for (const note of clip.notes) {
    // process note
  }
}
```

### Pattern 3: Extract Complex Conditionals
```javascript
// BEFORE
if (clip.looping && clip.length > 0 && 
    (clip.type === 'midi' || clip.hasNotes) &&
    !clip.isEmpty) {
  // ...
}

// AFTER
function isProcessableClip(clip) {
  return clip.looping && 
         clip.length > 0 && 
         (clip.type === 'midi' || clip.hasNotes) &&
         !clip.isEmpty;
}

if (isProcessableClip(clip)) {
  // ...
}
```

### Pattern 4: Extract Logical Sections
```javascript
// BEFORE - 200 line function
function transformClips(args) {
  // 40 lines of validation
  // 60 lines of clip collection
  // 50 lines of transformation
  // 50 lines of result building
}

// AFTER - orchestration + helpers
function transformClips(args) {
  validateTransformArgs(args);
  const clips = collectClipsToTransform(args);
  const transformed = applyTransformations(clips, args);
  return buildTransformResult(transformed);
}
```

## Code Smells to Fix

**Nested ternaries:**
```javascript
// ❌ BAD
const value = a ? (b ? c : d) : (e ? f : g);

// ✅ GOOD
const value = calculateValue(a, b, c, d, e, f, g);
```

**Long parameter lists (>5):**
```javascript
// ❌ BAD
function create(a, b, c, d, e, f, g) { }

// ✅ GOOD
function create({ a, b, c, d, e, f, g }) { }
```

**Boolean parameters:**
```javascript
// ❌ BAD - unclear at call site
processClip(clip, true, false);

// ✅ GOOD
processClip(clip, { validate: true, transform: false });
```

## Producer Pal Specific

### Bar|beat notation handling
- Keep bar|beat parsing in `barbeat-*` modules
- Don't duplicate parsing logic in tools
- Use `barBeatToAbletonBeats` for conversions

### Live API calls
- Encapsulate in `live-api-adapter.js`
- Don't call LiveAPI directly from tools
- Use provided abstractions

### Tool structure
- Keep tool definition (`*_def.js`) and implementation (`*.js`) separate
- Tool functions should orchestrate, not implement
- Extract complex logic to `shared/` modules

## Execution Checklist

Before submitting refactored code:
- [ ] ESLint passes (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] No duplicate code introduced
- [ ] Function names clearly describe purpose
- [ ] Nesting depth ≤4 levels
- [ ] Function length ≤100 lines
- [ ] Complexity ≤15 (or lower per current limits)
- [ ] No unused imports
- [ ] JSDoc comments updated if signatures changed

## Anti-patterns to Avoid

- **Over-abstraction**: Don't extract single-use 2-line functions
- **Premature optimization**: Clarity over cleverness
- **Changing too much**: One refactoring focus per change
- **Breaking tests**: Preserve behavior during refactoring
- **God functions**: One giant orchestrator calling tiny helpers