# DeviceParameter

This class represents an (automatable) parameter within a MIDI or audio device. To modify a device parameter, set its `value` property or send its object ID to live.remote~.

## Canonical Path

live_set tracks N devices M parameters L

## Properties

### automation_state

**Type:** int
**Attributes:** read-only, observe

Get the automation state of the parameter.
0 = no automation.
1 = automation active.
2 = automation overridden.

### default_value

**Type:** float
**Attributes:** read-only

Get the default value for this parameter.
Only available for parameters that aren't quantized (see _is_quantized_).

### is_enabled

**Type:** bool
**Attributes:** read-only

1 = the parameter value can be modified directly by the user, by sending `set` to a live.object, by automation or by an assigned MIDI message or keystroke.
Parameters can be disabled because they are macro-controlled, or they are controlled by a live-remote~ object, or because Live thinks that they should not be moved.

### is_quantized

**Type:** bool
**Attributes:** read-only

1 for booleans and enums
0 for int/float parameters
Although parameters like MidiPitch.Pitch appear quantized to the user, they actually have an is_quantized value of 0.

### max

**Type:** float
**Attributes:** read-only

Largest allowed value.

### min

**Type:** float
**Attributes:** read-only

Lowest allowed value.

### name

**Type:** symbol
**Attributes:** read-only

The short parameter name as shown in the (closed) automation chooser.

### original_name

**Type:** symbol
**Attributes:** read-only

The name of a Macro parameter before its assignment.

### state

**Type:** int
**Attributes:** read-only, observe

The active state of the parameter.
0 = the parameter is active and can be changed.
1 = the parameter can be changed but isn't active, so changes won't have an audible effect.
2 = the parameter cannot be changed.

### value

**Type:** float
**Attributes:** observe

Linear-to-GUI value between min and max.

### value_items

**Type:** StringVector
**Attributes:** read-only

Get a list of the possible values for this parameter.
Only available for parameters that are quantized (see _is_quantized_).

## Functions

### re_enable_automation

Re-enable automation for this parameter.

### str_for_value

Parameter: `value` [float]
Returns: [symbol] String representation of the specified value.

### \_\_str\_\_

Returns: [symbol] String representation of the current parameter value.
