# Live API Paths — Use `livePath` Builders

Part of the [coding standards](README.md).

**Never hardcode Live API path strings.** Use `livePath` from
`src/shared/live-api-path-builders.ts` to construct all Live API paths. Raw
strings like `"live_set tracks 0 devices 1"` and template literals like
`` `live_set tracks ${i}` `` are bug-prone, hard to refactor, and lack type
safety.

```typescript
// WRONG — hardcoded path strings
const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
const path = "live_set master_track mixer_device";

// RIGHT — use livePath builders
const track = LiveAPI.from(livePath.track(trackIndex));
const path = livePath.masterTrack().mixerDevice();
```

`LiveAPI.from()` accepts `PathLike` objects directly (no `String()` wrapping
needed). For contexts that require a `string` (computed property keys, Map
lookups, template literal concatenation), use `String(livePath.track(i))`.

## API Reference

```
livePath.track(i)                     → TrackPath (chainable)
livePath.returnTrack(i)               → TrackPath (chainable)
livePath.masterTrack()                → TrackPath (chainable)
livePath.scene(i)                     → string
livePath.cuePoint(i)                  → string
livePath.liveSet                      → "live_set"
livePath.view.song                    → "live_set view"
livePath.view.app                     → "live_app view"
livePath.view.selectedTrack           → "live_set view selected_track"
livePath.view.selectedScene           → "live_set view selected_scene"
livePath.view.detailClip              → "live_set view detail_clip"
livePath.view.highlightedClipSlot     → "live_set view highlighted_clip_slot"

TrackPath.device(i)                   → DevicePath (chainable)
TrackPath.clipSlot(i)                 → ClipSlotPath (chainable)
TrackPath.arrangementClip(i)          → string
TrackPath.mixerDevice()               → string

DevicePath.parameter(i)               → string
DevicePath.chain(i)                   → ChainPath (chainable)
DevicePath.returnChain(i)             → ChainPath (chainable)
DevicePath.drumPad(i)                 → string

ChainPath.device(i)                   → DevicePath (chainable, enables nesting)

ClipSlotPath.clip()                   → string
```
