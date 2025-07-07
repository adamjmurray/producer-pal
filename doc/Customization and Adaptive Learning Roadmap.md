# Producer Pal Customization & Learning Roadmap

## Vision

Transform Producer Pal from a static tool into a personalized AI assistant that
adapts to each user's musical style and workflow through customizable prompts
and eventually adaptive learning.

## Phase 1: Per-Project Context

**Goal**: Let users customize Producer Pal for specific projects

### Implementation

- Add Settings tab to Max device UI
- Store project context as blob parameter in device (no file system yet)
- Toggle switch for project context also stored as device parameter
- Include Factory Defaults button, which simply toggles off the project context
  (this will make more sense in future phases)
- Inject project context into `read-song` tool description (and then evaluate if
  we need to inject it anywhere else)

### UI Concept

```
┌─────────────────────────────────────────┐
│ [Main] [Settings]                       │
├─────────────────────────────────────────┤
│                                         │
│ 📄 Project Context (this project): [ON] │
│ ┌─────────────────────────────────────┐ │
│ │ This is a jazz fusion experiment... │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ─────────────────────────────────────── │
│ [Factory Defaults] (toggles all off)    │
│ * Project-only, temporary reset         │
└─────────────────────────────────────────┘
```

## Phase 2: Global Context

**Goal**: Add persistent global preferences across all projects

### Implementation

- Add global context text field to Settings
- Determine default paths:
  - macOS: `~/Documents/Producer Pal/`
  - Windows: `%USERPROFILE%\Documents\Producer Pal\`
- Add popup editor for longer contexts (with tabs for project/global)
- Global context loads on device startup
- Factory Defaults button also disables the global context toggle
- Add indicators to the main UI tab that project and/or global context are being
  used (not empty and enabled)

### Enhanced UI

```
┌─────────────────────────────────────────┐
│ Settings                                │
├─────────────────────────────────────────┤
│ 📄 Project Context (this project): [ON] │
│ ┌─────────────────────────────────────┐ │
│ │ This is a jazz fusion experiment... │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 📁 Global Context (all projects): [ON]  │
│ ┌─────────────────────────────────────┐ │
│ │ I generally make techno...          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Open Editor...]                        │
│                                         │
│ ─────────────────────────────────────── │
│ [Factory Defaults] (toggles all off)    │
│ * Project-only, temporary reset         │
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

### prompts.json Format

```json
{
  "version": "0.9.0",
  "tools": {
    "update-clip": {
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

## Phase 4: Learning with Backup System

**Goal**: Producer Pal learns and improves through use

### Learning Implementation

- Add `learn` tool for Claude to update prompts
- Per-project learning toggle
- Version all changes with timestamps
- Display learning history summaries in UI (new tab)
- Main UI tab indicates when learning is enabled

### Backup System

```
~/Documents/Producer Pal/
├── prompts.json
├── backups/
│   ├── prompts-2024-01-15-1430.json
│   ├── prompts-2024-01-14-0900.json
│   └── prompts-2024-01-07-0900.json
└── history/
    ├── changes.log
    └── learning-summary.json
```

### Backup Features

- Automatic backups before changes
- Automatic cleanup / rotation of backups
- Corruption detection with fallback
- Import/export (.producerpal files, which are maybe just .zip files)

### Complete UI with Learning

```
┌─────────────────────────────────────────┐
│ [Main] [Settings] [History]             │
├─────────────────────────────────────────┤
│ Settings                                │
├─────────────────────────────────────────┤
│ 🧠 Learning: [ON]                       │
│                                         │
│ 📄 Project Context (this project): [ON] │
│ ┌─────────────────────────────────────┐ │
│ │ This is a jazz fusion experiment... │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 📁 Global Context (all projects): [ON]  │
│ ┌─────────────────────────────────────┐ │
│ │ I generally make techno...          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 🔧 Advanced Overrides (JSON): [ON]      │
│                                         │
│ ─────────────────────────────────────── │
│ [Factory Defaults] (toggles all off)    │
│ * Project-only, temporary reset         │
└─────────────────────────────────────────┘
```

## Phase 5: Persona System

**Goal**: Multiple AI personalities for different styles

### Features

- Multiple named personas (Jazz Producer, Techno Minimalist, etc.)
- Each persona has independent contexts, overrides, and learning
- Fork existing personas to create variations
- Per-project persona selection
- Personas travel with shared Live Sets

### File Structure

```
~/Documents/Producer Pal/
├── personas/
│   ├── default/
│   │   ├── prompts.json
│   │   └── context.txt
│   ├── jazz-producer/
│   └── techno-minimalist/
└── active-persona.txt
```

## Future Ideas

### Per-Project JSON Overrides

- Project-specific `prompts.json` stored in Live Set
- Would allow complete customization per project
- Adds complexity but enables ultimate flexibility

### Community Features

- Share personas online
- Download curated prompt collections
- Aggregate common learnings across users
- Community-driven genre templates

## Notes

### Design Principles

- Target audience: "stupid musicians" - must be dead simple
- JSON editing is for power users only
- Customization should feel creative, not technical
- All learning stays local by default
- Factory Defaults = all toggles OFF = vanilla behavior
- Breaking changes are okay - this is a creative tool, but use a backup system
  to avoid people losing a valued Producer Pal persona

### Full conversation reference: https://claude.ai/share/c0e771c8-4c9d-4a25-8ecb-c1aca29a1247
