# Producer Pal Customization & Learning Roadmap

## Vision

Transform Producer Pal from a static tool into a personalized AI assistant that
adapts to each user's musical style and workflow through customizable contexts
and memory-based learning.

## Phase 1: Per-Project Context & Tabbed UI

**Goal**: Implement tabbed UI system and per-project context functionality

**Status**: Specification complete

See `doc/Per Project Context and Tabbed UI Spec.md` for full implementation
details.

## Phase 2: Global Context (File System Storage)

**Goal**: Add persistent global preferences across all projects by introducing
file system storage

### Major Technical Addition: File System Access

This phase introduces Producer Pal's first use of the file system for persistent
storage. This is a significant milestone that enables:

- Settings that persist across all Live Sets
- Foundation for future file-based features (JSON overrides, memories, personas)
- User data stored outside of Live Sets

### Implementation

- Add global context text field to Settings tab
- **File system integration in Node for Max**
- Create Producer Pal user data directory on first use
- Handle cross-platform path differences
- Add file read/write error handling
- Load global context on device startup

### Storage Location Strategy

**Default Paths:**

- macOS: `~/Documents/Producer Pal/`
- Windows: `%USERPROFILE%\Documents\Producer Pal\`

**Configurable via Desktop Extension:**

- Users can override the default path via Claude Desktop Extension config:
  ```json
  {
    "mcpServers": {
      "producer-pal": {
        "command": "...",
        "env": {
          "PRODUCER_PAL_USER_DIR": "/custom/path/to/data"
        }
      }
    }
  }
  ```
- Benefits:
  - Power users can customize location
  - Keeps Max UI simple (no path configuration needed)
  - Handles edge cases (permissions, network drives, etc.)
  - Default works for most users

### File Structure

```
Producer Pal User Directory/
├── global-context.txt    # User's global context (Phase 2)
├── prompts.json         # JSON overrides (Phase 3)
├── memory/              # Memory system (Phase 4)
│   ├── current.json
│   └── backups/
└── personas/            # Persona system (Phase 5)
    ├── default/
    └── jazz-producer/
```

This directory structure will expand in future phases, making Phase 2's file
system integration foundational for all advanced features.

### Implementation Considerations

1. **Permissions & Access**
   - Handle read/write failures gracefully
   - Fall back to project-only context if file access fails
   - Show clear status in UI

2. **First Run Experience**
   - Auto-create directory structure on first use
   - No errors if directory already exists
   - Clear messaging if creation fails

3. **Error States**
   - "Global context unavailable (check file permissions)"
   - Continue working with project context only
   - Log errors to Max console for debugging

### ppal-read-song Response Enhancement

```json
{
  "tempo": 120,
  "timeSignature": "4/4",
  "tracks": [...],
  // ... other existing song properties ...
  "userContext": {
    "project": "This is a jazz fusion experiment...",
    "global": "I generally make techno and house music..."
  }
}
```

### Technical Architecture

Global context file operations happen directly in the v8 object using Max's File
API:

1. **On device load:**
   - v8 reads global context file using `new File()`
   - Stores content in memory alongside project context

2. **On context change:**
   - v8 writes updated text to file system
   - Handles errors gracefully (permissions, missing directories)

3. **File handling example:**

   ```javascript
   // Read global context
   const file = new File(globalContextPath, "read");
   if (file.isopen) {
     const content = file.readline(10000); // Read up to 10k chars
     file.close();
     return content;
   }

   // Write global context
   const file = new File(globalContextPath, "write");
   if (file.isopen) {
     file.writestring(contextText);
     file.close();
   }
   ```

### Desktop Extension Configuration

For the configurable path option, the desktop extension manifest could include:

```json
{
  "id": "producer-pal",
  "configuration": {
    "type": "object",
    "properties": {
      "userDataPath": {
        "type": "string",
        "description": "Custom path for Producer Pal user data (leave empty for default)",
        "default": ""
      }
    }
  }
}
```

This would appear in Claude Desktop settings and be passed as an environment
variable to the MCP server.

### Enhanced UI (Settings Tab)

```
┌─────────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]    │
├─────────────────────────────────────────┤
│                                         │
│  Project Context                        │
│  ────────────────────                   │
│  📄 Enabled: [✓]                        │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ This is a jazz fusion experiment │   │
│  │ ...                              │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Global Context                         │
│  ────────────────────                   │
│  📁 Enabled: [✓]                        │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ I generally make techno...       │   │
│  │                                  │   │
│  └──────────────────────────────────┘   │
│                                         │
│  [Open Editor...]                       │
│                                         │
└─────────────────────────────────────────┘
```

## Phase 3: Full JSON Override System

**Goal**: Power users can customize all tool descriptions

### Implementation

- Extract all tool/parameter descriptions to `default-prompts.json`
- Load `prompts.json` from user folder with deep merge
- Add Advanced Overrides toggle to UI
- Version checking with mismatch alerts
- Clear indication when overrides are active
- **Important**: Users must toggle Producer Pal extension off/on in Claude
  Desktop after modifying prompts.json for changes to take effect

### prompts.json Format

```json
{
  "version": "0.9.0",
  "tools": {
    "ppal-update-clip": {
      "description": "...",
      "parameters": {
        "notes": {
          "description": "..."
        }
      }
    }
  }
}
```

### File Structure

```
~/Documents/Producer Pal/
├── prompts.json          # User overrides
└── global-context.txt    # Simple global context
```

### UI Addition (Advanced Tab)

```
┌─────────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]    │
├─────────────────────────────────────────┤
│                                         │
│  Server Configuration                   │
│  ────────────────────                   │
│  Port:     [3350    ]                   │
│  Timeout:  [15      ] seconds           │
│                                         │
│  JSON Overrides                         │
│  ────────────────────                   │
│  🔧 Enabled: [✓]                        │
│  Status: prompts.json loaded            │
│                                         │
│  [Open Folder] [Reload]                 │
│                                         │
│  ⚠️ Warning: Toggle Producer Pal        │
│  extension off/on in Claude Desktop     │
│  after modifying prompts.json           │
│                                         │
└─────────────────────────────────────────┘
```

## Phase 4: Memory-Based Learning System

**Goal**: Producer Pal learns and improves through use via memory storage

### Memory Implementation

- Add `memory` tool for Claude to store observations and learnings
- Per-project memory toggle
- Return latest memory summary (5-10 key learnings) with `ppal-read-song`
  response
- Timestamped memory entries stored as JSON log
- Memory summarization to condense older entries
- Display memory summaries in UI (new tab)
- Main UI tab indicates when memory is enabled

### ppal-read-song Response Enhancement

```json
{
  "tempo": 120,
  "timeSignature": "4/4",
  "tracks": [...],
  // ... other existing song properties ...
  "userContext": {
    "project": "This is a jazz fusion experiment...",
    "global": "I generally make techno..."
  },
  "ppal-memory": {
    "summary": [
      "User prefers 16th note hi-hats with velocity 80-100",
      "Often starts with 8-bar drum loops",
      "Likes to layer percussion in second half of patterns"
    ]
  }
}
```

### Memory Tool Operations

- `write`: Claude stores important observations (workflow preferences, musical
  patterns, corrections)
- `read`: Retrieve full memory or filter by date/topic/type
- `summarize`: Condense older memories into key patterns
- `clear`: Reset memory with backup

### Memory Entry Format

```json
{
  "timestamp": "2025-01-15T14:30:00Z",
  "type": "workflow_preference",
  "content": "User prefers 16th note hi-hats with velocity variation 80-100",
  "context": "During techno beat creation"
}
```

### Backup System

```
~/Documents/Producer Pal/
├── prompts.json          # JSON overrides (if enabled)
├── memory/
│   ├── current.json      # Active memory log
│   ├── summary.json      # Condensed key learnings
│   └── backups/
│       ├── memory-2025-01-15-1430.json
│       └── memory-2025-01-14-0900.json
└── global-context.txt
```

### Complete UI with Memory (Settings Tab)

```
┌─────────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [About]    │
├─────────────────────────────────────────┤
│                                         │
│  Project Context                        │
│  ────────────────────                   │
│  📄 Enabled: [✓]                        │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ This is a jazz fusion experiment │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Global Context                         │
│  ────────────────────                   │
│  📁 Enabled: [✓]                        │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ I generally make techno...       │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Memory & Learning                      │
│  ────────────────────                   │
│  🧠 Enabled: [✓]                        │
│  Entries: 47                            │
│                                         │
│  [View Memory] [Clear Memory...]        │
│                                         │
└─────────────────────────────────────────┘
```

### Memory Tab (New)

```
┌─────────────────────────────────────────┐
│ [Main] [Settings] [Advanced] [Memory]   │
├─────────────────────────────────────────┤
│                                         │
│  Memory Summary                         │
│  ────────────────────                   │
│  • Prefers 16th note hi-hats @ 80-100  │
│  • Often starts with 8-bar drum loops   │
│  • Likes percussion in 2nd half         │
│  • Uses sidechain on bass frequently    │
│  • Typical BPM range: 120-128          │
│                                         │
│  Full History (47 entries)              │
│  ────────────────────                   │
│  ┌──────────────────────────────────┐   │
│  │ 2025-01-15 14:30 - Workflow      │   │
│  │ User prefers velocity 80-100...  │   │
│  │                                  │   │
│  │ 2025-01-15 14:25 - Correction    │   │
│  │ Fixed: Use bar|beat not x.x.x.x  │   │
│  └──────────────────────────────────┘   │
│                                         │
│  [Export Memory] [Import Memory]        │
│                                         │
└─────────────────────────────────────────┘
```

## Phase 5: Persona System

**Goal**: Multiple AI personalities for different styles

### Features

- Multiple named personas (Jazz Producer, Techno Minimalist, etc.)
- Each persona has independent contexts, overrides, and memories
- Fork existing personas to create variations
- Per-project persona selection
- Personas travel with shared Live Sets
- Each persona returns its identity in `ppal-read-song` response

### ppal-read-song Response Enhancement

```json
{
  "tempo": 120,
  "timeSignature": "4/4",
  "tracks": [...],
  // ... other existing song properties ...
  "userContext": {
    "project": "This is a jazz fusion experiment...",
    "global": "I generally make techno..."
  },
  "ppal-memory": {
    "summary": [/* memory entries */]
  },
  "persona": {
    "name": "Jazz Producer",
    "description": "Specializes in complex harmonies and live instrumentation"
  }
}
```

### File Structure

```
~/Documents/Producer Pal/
├── personas/
│   ├── default/
│   │   ├── prompts.json
│   │   ├── context.txt
│   │   └── memory/
│   ├── jazz-producer/
│   └── techno-minimalist/
└── active-persona.txt
```

## Future Ideas

### Per-Project Memory & Overrides

- Project-specific memories stored in Live Set
- Would allow complete customization per project
- Memories could sync with collaborators

### Community Features

- Share personas online
- Download curated memory collections
- Aggregate common learnings across users
- Community-driven genre templates

## Notes

### Design Principles

- Target audience: "stupid musicians" - must be dead simple
- JSON editing is for power users only
- Customization should feel creative, not technical
- All learning stays local by default
- Memory is data, not code - keeps tool descriptions stable
- Breaking changes are okay - this is a creative tool, but use backups to
  protect valued memories and personas
- Contexts and memories delivered via `ppal-read-song` response to avoid
  extension toggle requirements

### Why Return Contexts in ppal-read-song

The approach of returning contexts in the `ppal-read-song` response rather than
injecting them into tool descriptions solves several problems:

- No extension toggle needed when contexts change
- Immediate effect when users update their contexts
- Natural fit - contexts are "notes about your music"
- Guaranteed visibility since Claude always calls `ppal-read-song` first
- Only power users modifying JSON tool descriptions need to toggle

### Memory vs Prompt Modification

The memory approach is preferred over modifying tool prompts because:

- Separation of concerns - memories are data, not operational logic
- More transparent - users can see what Claude remembers
- Less fragile - bad memories won't break functionality
- Natural for LLMs - storing observations rather than rewriting instructions
- Avoids prompt degradation from iterative modifications

### Factory Defaults

Rather than a single "Factory Defaults" button, each feature has its own toggle.
This provides fine-grained control while keeping the UI simple. Users can:

- Disable project context while keeping global context
- Turn off memory while keeping contexts
- Disable JSON overrides independently

For complete reset, users simply turn off all toggles in the Settings and
Advanced tabs.

### Full conversation reference: https://claude.ai/share/c0e771c8-4c9d-4a25-8ecb-c1aca29a1247
