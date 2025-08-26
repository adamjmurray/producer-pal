# Device Tool Specification

## Overview

A unified tool for controlling all device types in Ableton Live, including
special support for rack devices. This specification is for **internal
experimentation** - production version may be simplified or split into multiple
tools.

## Tool Definition

```javascript
// src/mcp-server/tool-def-device.js
import { z } from "zod/v3";
import { defineTool } from "./define-tool.js";

export const toolDefDevice = defineTool("device", {
  title: "Device Control",
  description:
    "Controls any device in Ableton Live, including synths, effects, and racks. " +
    "Supports parameter inspection, control, and rack-specific features like macros and variations. " +
    "Available actions: " +
    "- get-info: Quick device overview " +
    "- scan-parameters: Full parameter discovery (slow but thorough) " +
    "- get-parameters: Get current values of specific parameters " +
    "- set-parameters: Set parameter values by name or index " +
    "- randomize-macros: Randomize macro values (racks only) " +
    "- store-variation: Save macro state (racks only) " +
    "- recall-variation: Restore macro state (racks only) " +
    "- delete-variation: Remove variation (racks only)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    deviceId: z.string().describe("Device ID"),
    action: z
      .enum([
        "get-info",
        "scan-parameters",
        "get-parameters",
        "set-parameters",
        "randomize-macros",
        "store-variation",
        "recall-variation",
        "delete-variation",
      ])
      .describe("Action to perform"),

    // For get/set parameters
    parameterNames: z
      .string()
      .optional()
      .describe("Comma-separated parameter names for get-parameters"),
    parameterIndices: z
      .string()
      .optional()
      .describe(
        "Comma-separated parameter indices (0-based) for get-parameters",
      ),
    parameterValues: z
      .string()
      .optional()
      .describe(
        'JSON object of parameter name/value pairs for set-parameters, e.g. \'{"Volume": 0.7, "Algorithm": 3}\'',
      ),

    // For variations (rack only)
    variationIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Variation index for recall/delete actions"),

    // Options
    includeNonAutomatable: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include non-automatable info in scan (experimental)"),
    format: z
      .enum(["full", "summary", "names-only"])
      .optional()
      .default("summary")
      .describe("Output format for scan-parameters"),
  },
});
```

## Actions

### get-info

Quick overview of device without scanning all parameters.

**Returns:**

```javascript
{
  deviceId: "365",
  name: "Operator",
  displayName: "Lead Synth",  // If different from class name
  className: "Operator",
  type: "instrument",          // instrument/audio-effect/midi-effect/rack
  isActive: true,

  // Basic parameter info
  parameterCount: 195,

  // Rack-specific info (if applicable)
  isRack: false,
  rackType: null,             // instrument-rack/audio-effect-rack/midi-effect-rack/drum-rack
  visibleMacroCount: null,
  hasMacroMappings: null,
  variationCount: null,

  // Performance hint
  estimatedScanTime: "~10 seconds for 195 parameters"
}
```

### scan-parameters

Complete parameter discovery. Warning: This can take several seconds for complex
devices.

**Options:**

- `format`: "full" (all details), "summary" (essential info), "names-only" (just
  names)
- `includeNonAutomatable`: Attempt to discover non-automatable parameters
  (experimental)

**Returns (format="summary"):**

```javascript
{
  deviceId: "365",
  deviceName: "Operator",
  parameterCount: 195,
  scanDuration: 8.3,  // seconds

  parameters: [
    {
      index: 0,
      name: "Device On",
      value: 1,
      range: { min: 0, max: 1 },
      isQuantized: true,
      isEnabled: true
    },
    {
      index: 1,
      name: "Algorithm",
      value: 0,
      range: { min: 0, max: 10 },
      isQuantized: true,
      isEnabled: true,
      valueItems: ["1>2>3>4", "1+2>3>4", "1>2+3>4", ...]  // For enums
    },
    // ... more parameters
  ],

  // Quick access sections (device-specific intelligence)
  sections: {
    global: [0, 1, 2, 3, 4],      // Device On, Algorithm, Transpose, etc.
    oscillators: {
      A: [22, 23, 24, 25],
      B: [45, 46, 47, 48],
      C: [68, 69, 70, 71],
      D: [91, 92, 93, 94]
    },
    envelopes: {
      volume: [112, 113, 114, 115],
      filter: [134, 135, 136, 137],
      pitch: [156, 157, 158, 159]
    },
    filter: [178, 179, 180, 181],
    lfo: [189, 190, 191, 192]
  }
}
```

### get-parameters

Get current values of specific parameters without full scan.

**Input options (use one):**

- `parameterNames`: "Volume,Algorithm,Filter Freq"
- `parameterIndices`: "4,1,178"

**Returns:**

```javascript
{
  deviceId: "365",
  parameters: [
    { name: "Volume", index: 4, value: 0.7, isEnabled: true },
    { name: "Algorithm", index: 1, value: 3, isEnabled: true },
    { name: "Filter Freq", index: 178, value: 0.5, isEnabled: true }
  ]
}
```

### set-parameters

Set multiple parameter values.

**Input:**

- `parameterValues`: '{"Volume": 0.8, "Algorithm": 5, "Filter Freq": 0.6}'

**Returns:**

```javascript
{
  deviceId: "365",
  results: [
    { name: "Volume", success: true, value: 0.8 },
    { name: "Algorithm", success: true, value: 5 },
    { name: "Filter Freq", success: true, value: 0.6 }
  ]
}
```

### Rack-Only Actions

#### randomize-macros

Same as rack-device tool.

#### store-variation / recall-variation / delete-variation

Same as rack-device tool.

## Implementation Notes

### Smart Device Detection

```javascript
function detectDeviceType(device) {
  const type = device.getProperty("type");
  const canHaveChains = device.getProperty("can_have_chains");
  const canHaveDrumPads = device.getProperty("can_have_drum_pads");

  if (!canHaveChains) {
    // Regular device
    return {
      isRack: false,
      type:
        type === 1
          ? "instrument"
          : type === 2
            ? "audio-effect"
            : type === 4
              ? "midi-effect"
              : "unknown",
    };
  } else {
    // Rack device
    return {
      isRack: true,
      type: "rack",
      rackType: canHaveDrumPads
        ? "drum-rack"
        : type === 1
          ? "instrument-rack"
          : type === 2
            ? "audio-effect-rack"
            : "midi-effect-rack",
    };
  }
}
```

### Parameter Caching Strategy

```javascript
// Consider caching for known devices
const DEVICE_CACHE = {
  Operator: {
    /* pre-scanned parameter map */
  },
  Analog: {
    /* pre-scanned parameter map */
  },
  // etc.
};

function getParameterMap(device) {
  const className = device.getProperty("class_name");

  // Use cache for known devices
  if (DEVICE_CACHE[className]) {
    return DEVICE_CACHE[className];
  }

  // Otherwise scan (slow)
  return scanAllParameters(device);
}
```

### Performance Optimization

```javascript
// Batch parameter reads in groups
async function scanParametersOptimized(device, batchSize = 10) {
  const paramIds = device.getChildIds("parameters");
  const batches = [];

  for (let i = 0; i < paramIds.length; i += batchSize) {
    const batch = paramIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((id) => readParameter(id)),
    );
    batches.push(...batchResults);
  }

  return batches;
}
```

## Error Handling

### Common Errors

```javascript
// Device not found
if (!device.exists()) {
  throw new Error(`Device "${deviceId}" not found`);
}

// Rack-only action on non-rack
if (action === "randomize-macros" && !device.getProperty("can_have_chains")) {
  throw new Error(`Action "${action}" only works on rack devices`);
}

// Parameter not found
const param = findParameterByName(device, paramName);
if (!param) {
  console.error(`Warning: Parameter "${paramName}" not found`);
  continue; // Skip this parameter
}

// Parameter disabled
if (!param.getProperty("is_enabled")) {
  console.error(`Warning: Parameter "${paramName}" is disabled and cannot be set`);
}
```

## Usage Examples

### Basic Device Control

```javascript
// Quick info
await device({
  deviceId: "365",
  action: "get-info",
});

// Set some parameters
await device({
  deviceId: "365",
  action: "set-parameters",
  parameterValues: '{"Volume": 0.7, "Filter Freq": 0.5, "Resonance": 0.3}',
});
```

### Deep Device Analysis

```javascript
// Full scan (slow but thorough)
const fullScan = await device({
  deviceId: "365",
  action: "scan-parameters",
  format: "full",
});

// Use the sections info for targeted control
const oscASectionParams = fullScan.sections.oscillators.A;
```

### Rack Device Workflow

```javascript
// Store current state before experimenting
await device({
  deviceId: "123",
  action: "store-variation",
});

// Randomize and tweak
await device({
  deviceId: "123",
  action: "randomize-macros",
});

await device({
  deviceId: "123",
  action: "set-parameters",
  parameterValues: '{"Macro 1": 0.5, "Macro 2": 0.75}',
});

// Restore if needed
await device({
  deviceId: "123",
  action: "recall-variation",
  variationIndex: 0,
});
```

## Future Enhancements

### For Production

- **Split into multiple tools**:
  - `device-info` (fast queries)
  - `device-control` (parameter get/set)
  - `device-analyze` (slow scanning)
- **Preset system**: Save/recall device states beyond variations
- **Smart presets**: "Make brighter", "Add warmth" using parameter intelligence
- **Differential updates**: Only set parameters that changed

### Experimental Features

- **Non-automatable parameter access**: Via UI scripting or alternative APIs
- **Visual feedback integration**: Waveform displays, envelopes, etc.
- **Cross-device modulation**: Link parameters between devices
- **AI-driven sound design**: Natural language parameter control

## Production Considerations

Before shipping as a product feature:

1. **Performance**: Consider pre-scanning common devices and caching results
2. **Timeout handling**: Long scans need progress feedback or cancellation
3. **Parameter grouping**: Organize parameters logically for each device type
4. **Simplified actions**: Maybe just "set" and "get" for basic users
5. **Safety limits**: Prevent extreme parameter jumps that could damage speakers
6. **Undo support**: Store previous values before bulk changes
