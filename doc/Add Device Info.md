# Plan: Add Device Listings to Track Information

## Overview

Add device information when listing tracks in read-track, read-song, and other
track-related tools.

## Implementation

### 1. Update `src/tools/read-track.js`

Add after the drumPads section:

```javascript
// List all devices on the track
const devices = track.getChildren("devices");
result.devices = devices.map((device) => ({
  id: device.id,
  name: device.getProperty("name"),
  className: device.getProperty("class_name"),
  displayName: device.getProperty("class_display_name"),
  type: device.getProperty("type"),
  isInstrument: device.getProperty("type") === DEVICE_TYPE_INSTRUMENT,
  isActive: device.getProperty("is_active"),
  canHaveChains: device.getProperty("can_have_chains"),
  canHaveDrumPads: device.getProperty("can_have_drum_pads"),
}));
```

### 2. Update `src/tools/read-song.js`

In the track mapping section, add device listing:

```javascript
tracks: [...trackIndices].map((trackIndex) => {
  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
  const devices = track.getChildren("devices");

  return {
    trackIndex,
    id: track.id,
    name: track.getProperty("name"),
    type: track.getProperty("has_midi_input") ? "midi" : "audio",
    devices: devices.map((device) => ({
      id: device.id,
      name: device.getProperty("name"),
      type: device.getProperty("type"),
      isInstrument: device.getProperty("type") === 1,
    })),
    // ... other track properties
  };
});
```

### 3. Example Output

```javascript
{
  id: "track1",
  name: "Lead Synth",
  type: "midi",
  devices: [
    {
      id: "device1",
      name: "Analog",
      className: "InstrumentVector",
      displayName: "Analog",
      type: 1,
      isInstrument: true,
      isActive: true,
      canHaveChains: false,
      canHaveDrumPads: false
    },
    {
      id: "device2",
      name: "Reverb",
      className: "Reverb",
      displayName: "Reverb",
      type: 2,
      isInstrument: false,
      isActive: true,
      canHaveChains: false,
      canHaveDrumPads: false
    }
  ]
  // ... rest of track data
}
```

### 4. Optional: Minimal Device Info

For `read-song` where we want to keep the response lighter, we could use a
minimal version:

```javascript
devices: devices.map((device) => ({
  name: device.getProperty("name"),
  type:
    device.getProperty("type") === 1
      ? "instrument"
      : device.getProperty("type") === 2
        ? "audio_effect"
        : device.getProperty("type") === 4
          ? "midi_effect"
          : "unknown",
}));
```

Which would output:

```javascript
devices: [
  { name: "Analog", type: "instrument" },
  { name: "Reverb", type: "audio_effect" },
];
```

### 5. Tests to Update

- `src/tools/read-track.test.js` - Add test cases for device listing
- `src/tools/read-song.test.js` - Update track assertions to include devices

### 6. Considerations

- Device listing adds some overhead to track queries
- Mixer device is included in the devices list (usually first)
- For grouped tracks or tracks in racks, device paths become more complex
- Some users might not need device info, so could make it optional with a
  parameter
