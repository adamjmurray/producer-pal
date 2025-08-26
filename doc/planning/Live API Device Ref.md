# Live API Device Reference

## Overview

This reference covers the Live API classes for working with devices in Ableton
Live:

- **Device**: Base class for all MIDI and audio devices
- **DeviceParameter**: Automatable parameters within devices
- **RackDevice**: Specialized device type with chains and macros

## Device Class

Represents any MIDI or audio device in Live.

### Canonical Paths

```
live_set tracks N devices M
live_set tracks N devices M chains L devices K
live_set tracks N devices M return_chains L devices K
```

### Children

| Child        | Type                    | Access             | Description                                |
| ------------ | ----------------------- | ------------------ | ------------------------------------------ |
| `parameters` | list of DeviceParameter | read-only, observe | Only automatable parameters are accessible |
| `view`       | Device.View             | read-only          | Device view object                         |

### Properties

| Property             | Type   | Access              | Description                                              |
| -------------------- | ------ | ------------------- | -------------------------------------------------------- |
| `name`               | string | read/write, observe | User-visible name in title bar                           |
| `class_name`         | string | read-only           | Internal class (e.g., "Operator", "AutoFilter")          |
| `class_display_name` | string | read-only           | Display name (e.g., "Auto Filter")                       |
| `type`               | int    | read-only           | 0=undefined, 1=instrument, 2=audio_effect, 4=midi_effect |
| `is_active`          | bool   | read-only, observe  | False if device or parent rack is off                    |
| `can_have_chains`    | bool   | read-only           | True for rack devices                                    |
| `can_have_drum_pads` | bool   | read-only           | True only for Drum Racks                                 |
| `latency_in_samples` | int    | read-only, observe  | Device latency in samples                                |
| `latency_in_ms`      | float  | read-only, observe  | Device latency in milliseconds                           |

### Methods

- `store_chosen_bank(script_index, bank_index)`: For hardware control surfaces
  (rarely used)

### Device Type Detection

```javascript
const device = new LiveAPI("live_set tracks 0 devices 0");
const deviceType = device.getProperty("type");
const isRack = device.getProperty("can_have_chains");
const isDrumRack = device.getProperty("can_have_drum_pads");

// Type values:
// 1 = instrument (synths, samplers, drum racks)
// 2 = audio effect (reverbs, delays, compressors)
// 4 = MIDI effect (arpeggiators, chord, scale)
```

## DeviceParameter Class

Represents an automatable parameter within a device.

### Canonical Path

```
live_set tracks N devices M parameters L
```

### Properties

| Property           | Type   | Access                  | Description                          |
| ------------------ | ------ | ----------------------- | ------------------------------------ |
| `value`            | float  | **read/write**, observe | Current value between min and max    |
| `display_value`    | float  | read-only, observe      | Value as shown in GUI                |
| `name`             | string | read-only               | Parameter name                       |
| `original_name`    | string | read-only               | Name before macro assignment         |
| `min`              | float  | read-only               | Minimum value                        |
| `max`              | float  | read-only               | Maximum value                        |
| `default_value`    | float  | read-only               | Default value                        |
| `is_enabled`       | bool   | read-only               | Can be modified by user/automation   |
| `is_quantized`     | bool   | read-only               | True for discrete values             |
| `value_items`      | list   | read-only               | Possible values for quantized params |
| `automation_state` | int    | read-only, observe      | 0=none, 1=playing, 2=overridden      |
| `state`            | int    | read-only, observe      | 0=active, 1=inactive, 2=locked       |

### Methods

- `re_enable_automation()`: Re-enable automation for this parameter
- `str_for_value(value)`: Get string representation of a value
- `__str__()`: Get string representation of current value

### Working with Parameters

```javascript
// Get parameter info
const param = new LiveAPI("live_set tracks 0 devices 0 parameters 0");
const name = param.getProperty("name");
const value = param.getProperty("value");
const range = {
  min: param.getProperty("min"),
  max: param.getProperty("max"),
};

// Set parameter value
if (param.getProperty("is_enabled")) {
  param.set("value", 0.75);
}

// Handle quantized parameters (enums)
if (param.getProperty("is_quantized")) {
  const options = param.getProperty("value_items");
  // value will be an index into options array
}
```

## RackDevice Class (Inherits from Device)

Specialized device type for Instrument Rack, Audio Effect Rack, MIDI Effect
Rack, and Drum Rack.

### Additional Children

| Child               | Type            | Access             | Description                      |
| ------------------- | --------------- | ------------------ | -------------------------------- |
| `chains`            | list of Chain   | read-only, observe | Device chains                    |
| `return_chains`     | list of Chain   | read-only, observe | Return chains                    |
| `drum_pads`         | list of DrumPad | read-only, observe | 128 pads (Drum Rack only)        |
| `visible_drum_pads` | list of DrumPad | read-only, observe | 16 visible pads (Drum Rack only) |
| `chain_selector`    | DeviceParameter | read-only          | Chain selector parameter         |

### Additional Properties

| Property                   | Type | Access              | Description                               |
| -------------------------- | ---- | ------------------- | ----------------------------------------- |
| `visible_macro_count`      | int  | read-only, observe  | Number of visible macros (0-8)            |
| `has_macro_mappings`       | bool | read-only, observe  | True if any macro is mapped               |
| `variation_count`          | int  | read-only, observe  | Number of stored variations (Live 11.0+)  |
| `selected_variation_index` | int  | read/write          | Currently selected variation (Live 11.0+) |
| `can_show_chains`          | bool | read-only           | Can show chains in Session View           |
| `is_showing_chains`        | bool | read/write, observe | Currently showing chains                  |
| `has_drum_pads`            | bool | read-only, observe  | Is a Drum Rack with pads                  |

### Additional Methods (Live 11.0+)

- `randomize_macros()`: Randomize all mapped macro values
- `store_variation()`: Store current macro state as new variation
- `recall_selected_variation()`: Recall the selected variation
- `recall_last_used_variation()`: Recall most recent variation
- `delete_selected_variation()`: Delete the selected variation
- `add_macro()`: Increase visible macro count
- `remove_macro()`: Decrease visible macro count
- `copy_pad(source_index, dest_index)`: Copy drum pad content

### Rack Macros

The first 8 parameters in any rack device are always the macro controls:

```javascript
const rack = new LiveAPI("live_set tracks 0 devices 0");
if (rack.getProperty("can_have_chains")) {
  const macros = rack.getChildren("parameters").slice(0, 8);
  const visibleCount = rack.getProperty("visible_macro_count");

  // Work with visible macros
  for (let i = 0; i < visibleCount; i++) {
    const macro = macros[i];
    console.log(macro.getProperty("name"), macro.getProperty("value"));
  }
}
```

## Common Device Examples

### Scanning All Device Parameters

```javascript
function scanDevice(devicePath) {
  const device = new LiveAPI(devicePath);
  const paramIds = device.getChildIds("parameters");

  const parameters = [];
  for (const paramId of paramIds) {
    const param = new LiveAPI(paramId);
    parameters.push({
      id: paramId,
      name: param.getProperty("name"),
      value: param.getProperty("value"),
      min: param.getProperty("min"),
      max: param.getProperty("max"),
      isEnabled: param.getProperty("is_enabled"),
      isQuantized: param.getProperty("is_quantized"),
      valueItems: param.getProperty("is_quantized")
        ? param.getProperty("value_items")
        : null,
    });
  }

  return {
    deviceName: device.getProperty("name"),
    className: device.getProperty("class_name"),
    type: device.getProperty("type"),
    parameterCount: parameters.length,
    parameters,
  };
}
```

### Setting Multiple Parameters

```javascript
function setDeviceParameters(devicePath, parameterValues) {
  const device = new LiveAPI(devicePath);
  const params = device.getChildren("parameters");

  const results = [];
  for (const [paramName, value] of Object.entries(parameterValues)) {
    // Find parameter by name
    const param = params.find((p) => p.getProperty("name") === paramName);

    if (param && param.getProperty("is_enabled")) {
      const min = param.getProperty("min");
      const max = param.getProperty("max");
      const clampedValue = Math.max(min, Math.min(max, value));

      param.set("value", clampedValue);
      results.push({
        name: paramName,
        success: true,
        value: clampedValue,
      });
    } else {
      results.push({
        name: paramName,
        success: false,
        reason: param ? "Parameter disabled" : "Parameter not found",
      });
    }
  }

  return results;
}
```

## Important Notes

### API Limitations

- Only **automatable** parameters are accessible through the API
- Cannot create parameter mappings programmatically
- Cannot access visual elements (waveforms, graphs, etc.)
- Parameter discovery requires individual API calls per parameter

### Performance Considerations

- Scanning all parameters of a complex device (like Operator with 195 params)
  requires hundreds of API calls
- Consider caching parameter maps for known devices
- Batch operations are not supported - each parameter must be accessed
  individually

### Best Practices

1. **Always check `is_enabled`** before setting parameter values
2. **Clamp values** to min/max range when setting
3. **Cache parameter maps** when doing repeated operations
4. **Handle quantized parameters** differently (they use indices, not float
   values)
5. **Verify device type** before using type-specific features (rack methods,
   drum pad access)
