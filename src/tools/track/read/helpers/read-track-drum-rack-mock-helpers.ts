/**
 * Drum rack mock helpers for read-track tests
 */
import { children } from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";

export interface DrumChainMockOptions {
  inNote: number;
  name: string;
  deviceId?: string;
  color?: number;
  mute?: boolean;
  solo?: boolean;
  mutedViaSolo?: boolean;
}

export interface SimpleInstrumentMockOptions {
  name?: string;
  className?: string;
}

/**
 * Creates mock data for drum rack chain with optional instrument
 * @param opts - Options for the drum chain
 * @returns Chain mock data
 */
export function createDrumChainMock(opts: DrumChainMockOptions): {
  in_note: number;
  name: string;
  color: number;
  mute: number;
  muted_via_solo: number;
  solo: number;
  devices: unknown[];
} {
  const {
    inNote,
    name,
    deviceId,
    color = 0,
    mute = false,
    solo = false,
    mutedViaSolo = false,
  } = opts;

  return {
    in_note: inNote,
    name,
    color,
    mute: mute ? 1 : 0,
    muted_via_solo: mutedViaSolo ? 1 : 0,
    solo: solo ? 1 : 0,
    devices: deviceId ? children(deviceId) : [],
  };
}

/**
 * Creates mock data for a simple instrument device
 * @param opts - Options for the device
 * @returns Device mock data
 */
export function createSimpleInstrumentMock(
  opts: SimpleInstrumentMockOptions = {},
): {
  name: string;
  class_name: string;
  class_display_name: string;
  type: number;
  is_active: number;
  can_have_chains: number;
  can_have_drum_pads: number;
} {
  const { name = "Simpler", className = "Simpler" } = opts;

  return {
    name,
    class_name: className,
    class_display_name: className,
    type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    is_active: 1,
    can_have_chains: 0,
    can_have_drum_pads: 0,
  };
}
