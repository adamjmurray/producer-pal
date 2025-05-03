# MaxDevice

This class represents a Max for Live device in Live.

A MaxDevice is a type of Device, meaning that it has all the children, properties and functions that a Device has. Listed below are the members unique to MaxDevice.

## Properties

### audio_inputs

**Type:** list of DeviceIO
**Attributes:** read-only, observe

List of the audio inputs that the MaxDevice offers.

### audio_outputs

**Type:** list of DeviceIO
**Attributes:** read-only, observe

List of the audio outputs that the MaxDevice offers.

### midi_inputs

**Type:** list of DeviceIO
**Attributes:** read-only, observe

List of the midi inputs that the MaxDevice offers.

_Available since Live 11.0._

### midi_outputs

**Type:** list of DeviceIO
**Attributes:** read-only, observe

List of the midi outputs that the MaxDevice offers.

_Available since Live 11.0._

## Functions

### get_bank_count

Returns: [int] the number of parameter banks.

### get_bank_name

Parameters: `bank_index` [int]
Returns: [list of symbols] The name of the parameter bank specified by bank_index.

### get_bank_parameters

Parameters: `bank_index` [int]
Returns: [list of ints] The indices of the parameters contained in the bank specified by bank_index. Empty slots are marked as -1. Bank index -1 refers to the "Best of" bank.
