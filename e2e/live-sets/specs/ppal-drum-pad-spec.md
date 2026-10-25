# Producer Pal Drum Pad Specification

A Set and a rack preset with the Producer Pal device inside a drum pad. Our
tools refuse to put the device there, so both are saved by hand from Live
`MIN_LIVE_VERSION` (12.3.x).

---

## ppal-drum-pad.als

For delete and duplicate refusing a drum pad that holds the Producer Pal device.
The device is in pad C1 and nowhere else in the Set, so a guard that fails
deletes the device and drops the connection.

| Property      | Value   |
| ------------- | ------- |
| Tempo         | 120 BPM |
| Return tracks | 2       |

### t0: Drums (MIDI)

```
d0: Drum Rack
├── pC1 "Producer_Pal" -> Producer Pal (the repo device)
└── pD1 "synth-snare"  -> Simpler "synth-snare"
```

pD1 is the pad a call can still clear or copy beside the refused one.

---

## presets/ppal-drum-pad-test-rack-preset.adg

The same Drum Rack, saved as a preset. For loading a preset that holds Producer
Pal, which must be refused because a Set can only have one.

Live only loads presets from the User Library or a Places folder. Saving it
there also made Live copy the device and sample into the User Library, and the
preset points at those copies, which no other machine has. So the test doesn't
load this file directly: it writes a copy into the User Library with the device
path pointed at the repo's `max-for-live-device/Producer_Pal.amxd`, and deletes
the copy afterwards. The Simpler's sample stays missing, which doesn't matter.
