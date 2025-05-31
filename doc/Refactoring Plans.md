# Refactoring Plans

This document tracks repetitive patterns found in the codebase and proposed refactoring opportunities. Each section includes priority, impact assessment, and implementation notes.

## 🔴 High Priority - High Impact

### 1. Comma-separated ID Parsing
**Pattern Found**: Almost identical in 5+ files
```javascript
const xIds = ids
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);
```
**Files**: update-track.js, update-clip.js, update-scene.js, delete.js, transport.js

**Proposed Solution**: 
```javascript
// In utils.js
export function parseCommaSeparatedIds(ids) {
  return ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}
```

**Status**: ✅ Complete

**Implementation Notes**:
- Also created `parseCommaSeparatedIndices()` for integer parsing with validation
- Updated 5 files: update-track.js, update-clip.js, update-scene.js, delete.js, transport.js
- Added 23 comprehensive test cases
- Eliminated ~25 lines of repetitive parsing code
- Error messages are now more specific and helpful

---

### 2. Time Signature Parsing
**Pattern Found**: Nearly identical in 5+ files
```javascript
const match = timeSignature.match(/^(\d+)\/(\d+)$/);
if (!match) {
  throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
}
const numerator = parseInt(match[1], 10);
const denominator = parseInt(match[2], 10);
```
**Files**: create-clip.js, update-clip.js, update-scene.js, create-scene.js, update-song.js

**Proposed Solution**:
```javascript
// In utils.js
export function parseTimeSignature(timeSignature) {
  const match = timeSignature.match(/^(\d+)\/(\d+)$/);
  if (!match) {
    throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
  }
  return {
    numerator: parseInt(match[1], 10),
    denominator: parseInt(match[2], 10)
  };
}
```

**Status**: 🔲 Not Started

---

## 🟡 Medium Priority - Medium Impact

### 3. LiveAPI Path Parsing for Indices
**Pattern Found**: 6+ files with variations
```javascript
const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);
// or:
const pathMatch = object.path.match(/live_set tracks (\d+) clip_slots (\d+)/);
```

**Proposed Solution**:
```javascript
// In utils.js
export function extractTrackIndex(path) {
  const match = path.match(/live_set tracks (\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

export function extractClipSlotIndices(path) {
  const match = path.match(/live_set tracks (\d+) clip_slots (\d+)/);
  if (!match) return null;
  return {
    trackIndex: Number(match[1]),
    clipSlotIndex: Number(match[2])
  };
}
```

**Status**: 🔲 Not Started

---

### 4. Single vs Array Return Logic
**Pattern Found**: 2 patterns across all multi-item functions
```javascript
// Update functions (based on input IDs):
return xIds.length > 1 ? results : results[0];

// Create functions (based on count):  
return count === 1 ? results[0] : results;
```

**Proposed Solution**:
```javascript
// In utils.js
export function returnSingleOrArray(items, shouldReturnArray) {
  return shouldReturnArray ? items : items[0];
}

// Usage:
// For update functions: return returnSingleOrArray(results, ids.length > 1);
// For create functions: return returnSingleOrArray(results, count > 1);
```

**Status**: 🔲 Not Started

---

### 5. Standardized Error Creation
**Pattern Found**: Consistent patterns across all tools
```javascript
throw new Error(`functionName failed: reason`);
```

**Proposed Solution**:
```javascript
// In utils.js
export function createToolError(toolName, reason) {
  return new Error(`${toolName} failed: ${reason}`);
}
```

**Status**: 🔲 Not Started

---

## 🟢 Lower Priority - Nice to Have

### 6. LiveAPI Existence Check Pattern
**Pattern Found**: Consistent across many files
```javascript
if (!object.exists()) {
  throw new Error(`functionName failed: X with id "${id}" does not exist`);
}
```

**Proposed Solution**: Could be combined with error creation utility.

**Status**: 🔲 Not Started

---

## 🔵 Completed Refactorings

### ✅ Object Property Setting
**Completed**: Created `setAllNonNull()` and `withoutNulls()` utilities
- **Files Updated**: create-clip.js, update-clip.js, create-track.js, update-track.js
- **Impact**: Eliminated ~50+ lines of repetitive conditional property setting
- **Status**: ✅ Complete

### ✅ LiveAPI Extensions
**Completed**: Created `LiveAPI.setAll()` for LiveAPI-specific object property setting
- **Files Updated**: create-clip.js, update-clip.js, create-track.js, update-track.js  
- **Impact**: Simplified LiveAPI property setting with automatic color handling
- **Status**: ✅ Complete

### ✅ Null-safe BarBeat Conversion
**Completed**: Updated `barBeatToAbletonBeats()` to handle null inputs
- **Files Updated**: create-clip.js, update-clip.js
- **Impact**: Eliminated repetitive null checks around time conversion calls
- **Status**: ✅ Complete

---

## Implementation Notes

- **Priority Order**: Start with high-impact, frequently repeated patterns first
- **Testing Strategy**: Each utility should have comprehensive tests before adoption
- **Migration Strategy**: Update one file at a time, ensure tests pass between changes
- **Validation**: Use existing test suite to validate refactoring doesn't break functionality

---

## Tracking

**Next Review Date**: TBD  
**Last Updated**: 2025-01-31  
**Total Patterns Identified**: 6  
**Patterns Addressed**: 4  
**Remaining High Priority**: 1