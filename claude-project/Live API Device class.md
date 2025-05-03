# Device

This class represents a MIDI or audio device in Live.

## Canonical Paths

live_set tracks N devices M
live_set tracks N devices M chains L devices K

live_set tracks N return_tracks L devices K

## Children

### parameters

**Type:** list of DeviceParameter
**Attributes:** read-only, observe

Only automatable parameters are accessible. See DeviceParameter to learn how to modify them.

### view

**Type:** Device.View
**Attributes:** read-only

## Properties

### can_have_chains

**Type:** bool
**Attributes:** read-only

0 for a single device
1 for a device Rack

### can_have_drum_pads

**Type:** bool
**Attributes:** read-only

1 for Drum Racks

### class_display_name

**Type:** symbol
**Attributes:** read-only

Get the original name of the device (e.g. `Operator`, `Auto Filter`).

### class_name

**Type:** symbol
**Attributes:** read-only

Live device type such as `MidiChord`, `Operator`, `Limiter`, `MxDeviceAudioEffect`, or `PluginDevice`.

### is_active

**Type:** bool
**Attributes:** read-only, observe

0 = either the device itself or its enclosing Rack device is off.

### name

**Type:** symbol
**Attributes:** observe

This is the string shown in the title bar of the device.

### type

**Type:** int
**Attributes:** read-only

The type of the device. Possible types are: 0 = undefined, 1 = instrument, 2 = audio_effect, 4 = midi_effect.

### latency_in_samples

**Type:** int
**Attributes:** read-only, observe

Device latency in samples.

### latency_in_ms

**Type:** float
**Attributes:** read-only, observe

Device latency in milliseconds.

## Functions

### store_chosen_bank

Parameters:
`script_index` [int]
`bank_index` [int]
(This is related to hardware control surfaces and is usually not relevant.)
