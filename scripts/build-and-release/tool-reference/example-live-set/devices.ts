// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The devices of the example Live Set: a drum rack with two pads on the drum
// track, and an instrument plus a reverb on the bass track. See
// live-set.ts.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { ID } from "./ids.ts";

interface ParameterSpec {
  name: string;
  value: number;
  display: string;
  min?: number;
  max?: number;
  /** What Live calls the parameter a rack macro is mapped to */
  originalName?: string;
}

const SIMPLER_PARAMS: ParameterSpec[] = [
  { name: "Device On", value: 1, display: "On", min: 0, max: 1 },
  { name: "Volume", value: 0.85, display: "-1.4 dB", min: 0, max: 1 },
  { name: "Attack", value: 0.01, display: "0.50 ms", min: 0, max: 1 },
  { name: "Release", value: 0.3, display: "180 ms", min: 0, max: 1 },
];

const BASS_PARAMS: ParameterSpec[] = [
  { name: "Device On", value: 1, display: "On", min: 0, max: 1 },
  { name: "Osc1 Shape", value: 0.5, display: "Saw", min: 0, max: 1 },
  { name: "Filter Freq", value: 0.42, display: "620 Hz", min: 0, max: 1 },
  { name: "Glide Time", value: 0.1, display: "60 ms", min: 0, max: 1 },
];

const DRUM_RACK_PARAMS: ParameterSpec[] = [
  { name: "Device On", value: 1, display: "On", min: 0, max: 1 },
  { name: "Macro 1", value: 0, display: "0.0 %", min: 0, max: 127 },
  {
    name: "Decay",
    value: 64,
    display: "50.4 %",
    min: 0,
    max: 127,
    originalName: "Macro 2",
  },
];

const REVERB_PARAMS: ParameterSpec[] = [
  { name: "Device On", value: 1, display: "On", min: 0, max: 1 },
  { name: "Dry/Wet", value: 0.18, display: "18 %", min: 0, max: 1 },
  { name: "Decay Time", value: 0.55, display: "2.20 s", min: 0, max: 1 },
];

/**
 * Register every device in the example Live Set.
 * @returns Nothing; the devices land in the mock registry
 */
export function registerExampleDevices(): void {
  registerDrumRack();
  registerBassDevices();
}

function registerDrumRack(): void {
  const rackPath = livePath.track(0).device(0);

  registerMockObject(ID.drumRack, {
    path: rackPath,
    type: "Device",
    properties: {
      name: "Kit",
      class_name: "DrumGroupDevice",
      class_display_name: "Drum Rack",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      is_active: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      chains: children(ID.kickChain, ID.snareChain),
      return_chains: children(),
      drum_pads: children(ID.kickPad, ID.snarePad),
      visible_drum_pads: children(ID.kickPad, ID.snarePad),
      parameters: children(...paramIds(ID.drumRack, DRUM_RACK_PARAMS)),
    },
  });
  registerParameters(ID.drumRack, String(rackPath), DRUM_RACK_PARAMS);

  registerDrumPad(ID.kickPad, rackPath.drumPad(36), "Kick", 36, ID.kickChain);
  registerDrumPad(
    ID.snarePad,
    rackPath.drumPad(38),
    "Snare",
    38,
    ID.snareChain,
  );

  registerDrumChain(0, ID.kickChain, "Kick", 36, ID.kickSimpler);
  registerDrumChain(1, ID.snareChain, "Snare", 38, ID.snareSimpler);
}

function registerDrumChain(
  chainIndex: number,
  chainId: string,
  name: string,
  midiNote: number,
  simplerId: string,
): void {
  const chainPath = livePath.track(0).device(0).chain(chainIndex);

  registerMockObject(chainId, {
    path: chainPath,
    type: "Chain",
    properties: {
      name,
      color: 0xff4c4c,
      mute: 0,
      solo: 0,
      muted_via_solo: 0,
      in_note: midiNote,
      out_note: midiNote,
      choke_group: 0,
      devices: children(simplerId),
      mixer_device: children(),
    },
  });

  registerDevice({
    id: simplerId,
    path: String(chainPath.device(0)),
    name,
    className: "OriginalSimpler",
    displayName: "Simpler",
    deviceType: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    params: SIMPLER_PARAMS,
  });
}

function registerBassDevices(): void {
  registerDevice({
    id: ID.bassInstrument,
    path: String(livePath.track(1).device(0)),
    name: "Sub Bass",
    className: "UltraAnalog",
    displayName: "Analog",
    deviceType: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    params: BASS_PARAMS,
  });

  registerDevice({
    id: ID.bassReverb,
    path: String(livePath.track(1).device(1)),
    name: "Reverb",
    className: "Reverb",
    displayName: "Reverb",
    deviceType: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
    params: REVERB_PARAMS,
  });
}

function registerDrumPad(
  padId: string,
  padPath: string,
  name: string,
  midiNote: number,
  chainId: string | null,
): void {
  registerMockObject(padId, {
    path: padPath,
    type: "DrumPad",
    properties: {
      name,
      note: midiNote,
      mute: 0,
      solo: 0,
      chains: chainId == null ? children() : children(chainId),
    },
  });
}

interface DeviceSpec {
  id: string;
  path: string;
  name: string;
  className: string;
  displayName: string;
  deviceType: number;
  params: ParameterSpec[];
}

function registerDevice(spec: DeviceSpec): void {
  registerMockObject(spec.id, {
    path: spec.path,
    type: "Device",
    properties: {
      name: spec.name,
      class_name: spec.className,
      class_display_name: spec.displayName,
      type: spec.deviceType,
      is_active: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      parameters: children(...paramIds(spec.id, spec.params)),
    },
  });
  registerParameters(spec.id, spec.path, spec.params);
}

// Parameter ids show up in tool output, so they look like the opaque numbers
// Live hands out rather than something derived from the parameter's name.
function paramIds(ownerId: string, params: ParameterSpec[]): string[] {
  return params.map((_, i) => `${ownerId}${i}`);
}

function registerParameters(
  ownerId: string,
  ownerPath: string,
  params: ParameterSpec[],
): void {
  const ids = paramIds(ownerId, params);

  for (const [i, param] of params.entries()) {
    registerMockObject(ids[i] as string, {
      path: `${ownerPath} parameters ${i}`,
      type: "DeviceParameter",
      properties: {
        name: param.name,
        original_name: param.originalName ?? param.name,
        value: param.value,
        display_value: param.display,
        min: param.min ?? 0,
        max: param.max ?? 1,
        is_quantized: 0,
        is_enabled: 1,
      },
    });
  }
}
