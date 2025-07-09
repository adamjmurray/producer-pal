# Per-Project Context & Tabbed UI Specification

## Overview

Implement a tabbed UI system for Producer Pal and add per-project context
functionality that allows users to provide project-specific information to guide
Claude's assistance.

## Goals

1. Create a cleaner, more organized UI with tabs
2. Allow users to define project-specific context
3. Keep implementation simple and "dummy proof"
4. Return context via `read-song` response (no extension toggle needed)
5. Prepare UI structure for future features

## UI Design

### Tab Structure

Four tabs organized by user type and function:

- **Main**: Status and control
- **Settings**: Typical user customizations
- **Advanced**: Power user configurations
- **About**: Info and documentation

### Main Tab

```
┌────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]│
├────────────────────────────────────┤
│                                    │
│         🎹 Producer Pal            │
│                                    │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  │     Producer Pal Running     │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                    │
│      [Start]      [Stop]           │
│                                    │
└────────────────────────────────────┘
```

**Elements:**

- Producer Pal logo (reuse from desktop extension)
- Status indicator (green for running, red/gray for stopped)
- Start/Stop buttons

### Settings Tab

```
┌────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]│
├────────────────────────────────────┤
│                                    │
│  Project Context                   │
│  ────────────────────              │
│  📄 Enabled: [✓]                   │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ This Live Set is for...      │  │
│  │                              │  │
│  │                              │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                    │
│  (Memory settings will go here)    │
│                                    │
└────────────────────────────────────┘
```

**Elements:**

- Project Context toggle (checkbox)
- Multi-line text field for context
- Placeholder text: "This Live Set is for..."
- Space reserved for future memory features

### Advanced Tab

```
┌────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]│
├────────────────────────────────────┤
│                                    │
│  Server Configuration              │
│  ────────────────────              │
│  Port:     [3350    ]              │
│  Timeout:  [15      ] seconds      │
│                                    │
│  (JSON overrides will go here)     │
│                                    │
│  ⚠️ Warning: Only change these      │
│  settings if you know what you're  │
│  doing or are experiencing issues  │
│                                    │
└────────────────────────────────────┘
```

**Elements:**

- Port configuration (moved from current UI)
- Timeout configuration (moved from current UI)
- Warning message
- Space reserved for future JSON override features

### About Tab

```
┌────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]│
├────────────────────────────────────┤
│                                    │
│         🎹 Producer Pal            │
│                                    │
│         Version 0.9.3              │
│                                    │
│      © 2025 Adam Murray            │
│         MIT License                │
│                                    │
│      📖 Producer Pal docs          │
│                                    │
└────────────────────────────────────┘
```

**Elements:**

- Producer Pal logo
- Version number
- Copyright and license
- Documentation link (http://adammurray.link/producer-pal)

## Technical Implementation

### Max Device Parameters

Add new parameters to the Max for Live device:

- `projectContextEnabled` (toggle parameter via [live.toggle], default: 0)
- `projectContext` (blob parameter via [textedit] for text storage)

### Max Implementation

1. **Settings Tab UI Objects:**
   - Add [live.toggle] for enabled state
   - Add [textedit] for context input
   - Enable "Parameter Mode Enable" on both objects
   - Set parameter names in Inspector:
     - Toggle: "projectContextEnabled"
     - Textedit: "projectContext"

2. **Message Routing to v8:**
   - Connect [live.toggle] output to message box: `projectContextEnabled $1`
   - Connect [textedit] output to message box: `projectContext $1`
   - Connect both message boxes to [v8] inlet

3. **JavaScript Handlers:**

   ```javascript
   // In main.js or imported module
   function projectContextEnabled(enabled) {
     // Store enabled state (0 or 1)
   }

   function projectContext(text) {
     // Store context text
   }
   ```

### Data Flow

1. User toggles enabled state or enters text in Settings tab
2. UI objects output values when changed
3. Values are sent to v8 via message boxes
4. JavaScript stores the current values
5. When `read-song` is called:
   - Check stored enabled state
   - If enabled and context exists, include in response
6. Claude receives context with every `read-song` call

### read-song Response Format

```javascript
// In read-song tool
{
  // Existing song properties at top level
  "tempo": 120,
  "timeSignature": "4/4",
  "tracks": [...],
  "scenes": [...],
  // ... other properties ...

  // New context property (only if enabled and not empty)
  "userContext": {
    "project": "This is a jazz fusion experiment with vintage synthesizers..."
  }
}
```

### JavaScript Implementation Details

```javascript
// At top of main.js or in a context module
let projectContextState = {
  enabled: false,
  text: "",
};

// Message handlers from Max
function projectContextEnabled(value) {
  projectContextState.enabled = Boolean(value);
}

function projectContext(text) {
  projectContextState.text = text || "";
}

// In read-song tool implementation
function readSong(args) {
  const result = {
    // ... existing song data ...
  };

  // Add user context if enabled and not empty
  if (projectContextState.enabled && projectContextState.text.trim()) {
    result.userContext = {
      project: projectContextState.text.trim(),
    };
  }

  return result;
}
```

### read-song Tool Description Update

Add to the tool description:

> "Response includes user-defined project context when enabled. Consider this
> context when providing musical assistance and suggestions."

## Implementation Steps

1. **Create tab panel system in Max**
   - Use Max's tab object
   - Create four panels
   - Wire up visibility switching

2. **Reorganize existing UI elements**
   - Move port/timeout to Advanced tab
   - Move version/copyright to About tab
   - Simplify Main tab

3. **Add project context UI**
   - Create toggle in Settings tab
   - Add textedit object for multi-line input
   - Connect to blob parameter

4. **Update read-song implementation**
   - Read projectContextEnabled parameter
   - Read projectContext blob if enabled
   - Include in response object

5. **Test context persistence**
   - Verify context saves with Live Set
   - Test empty context handling
   - Verify immediate effect (no toggle needed)

## Initialization Handling

When the device loads, ensure JavaScript receives initial parameter values:

1. **[live.thisdevice] initialization:**
   - Connect [live.thisdevice] left outlet (bang on init) to both UI objects
   - This triggers them to output their current values
   - JavaScript receives initial state on device load

2. **Max patch connections:**
   ```
   [live.thisdevice]
         |
         ├─→ [live.toggle] → [projectContextEnabled $1] → [v8]
         |
         └─→ [textedit] → [projectContext $1] → [v8]
   ```

## Future Extensibility

This UI structure prepares for:

- Global context (Phase 2)
- Memory system (Phase 4)
- JSON overrides (Phase 3)
- Additional power user features

The Settings tab will expand with user-friendly options while Advanced remains
for technical configurations.

## Testing Checklist

- [ ] Tabs switch correctly
- [ ] Status indicator updates properly
- [ ] Start/Stop buttons work from Main tab
- [ ] Project context saves with Live Set
- [ ] Project context appears in read-song response
- [ ] Empty/disabled context doesn't appear in response
- [ ] Port/timeout settings still work from Advanced tab
- [ ] Documentation link opens correctly
- [ ] UI is responsive and clear

## Notes

- Keep all text short and clear
- Use visual indicators (✓, 📄, ⚠️) for clarity
- Ensure immediate feedback - no delays or confusion
- Context changes take effect immediately (no extension toggle)
