// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Grading for an Instrument Rack that sits inside a drum pad: its layers (rack
 * chains) read back through ppal-read-device, and the state assertions the
 * rack-in-pad scenarios share.
 */

import { type EvalAssertion } from "../../../types.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** One layer the setup builds: a rack chain holding one instrument. */
export interface LayerSpec {
  /** The chain's name */
  name: string;
  /** Instrument in the chain, as Live names it ("Operator") */
  device: string;
  /** The chain's own fader, in dB */
  gainDb: number;
}

/** One chain, as ppal-read-device returns it (devices at depth 1). */
export interface RackChain {
  name?: string;
  /** Left out at 0 dB */
  gainDb?: number;
  /** Left out when the chain is active */
  state?: string;
  devices?: { type?: string }[];
}

/** Live quantizes a dB write, so compare with slack rather than for equality. */
export const DB_TOLERANCE = 0.3;

/**
 * The layers on a rack read.
 * @param result - Parsed ppal-read-device result for the rack
 * @returns The rack's chains, or an empty list when it has none
 */
export function rackChains(result: unknown): RackChain[] {
  return (result as { chains?: RackChain[] }).chains ?? [];
}

/**
 * A rack's layers as one readable line, for failure text.
 * @param result - Parsed ppal-read-device result for the rack
 * @returns Each layer's name, instruments, level and state
 */
export function describeLayers(result: unknown): string {
  const chains = rackChains(result);

  if (chains.length === 0) {
    return "no layers";
  }

  return chains
    .map((chain) => {
      const devices = (chain.devices ?? []).map((d) => d.type ?? "?");
      const state = chain.state == null ? "" : ` ${chain.state}`;

      return `${chain.name ?? "?"} [${devices.join(", ") || "empty"}] ${
        chain.gainDb ?? 0
      } dB${state}`;
    })
    .join("; ");
}

/**
 * Whether a layer holds a given instrument.
 * @param chain - A chain off a rack read
 * @param device - Instrument name, e.g. "Wavetable"
 * @returns True when one of the chain's devices is that instrument
 */
export function holdsInstrument(chain: RackChain, device: string): boolean {
  return (chain.devices ?? []).some((d) =>
    (d.type ?? "").toLowerCase().includes(device.toLowerCase()),
  );
}

/**
 * Whether a layer is exactly as the setup built it: its instrument, its level,
 * and not muted.
 * @param chain - A chain off a rack read, or undefined when it's missing
 * @param spec - What the layer should be
 * @returns True when nothing about the layer changed
 */
export function isLayerUntouched(
  chain: RackChain | undefined,
  spec: LayerSpec,
): boolean {
  return (
    chain != null &&
    chain.state == null &&
    holdsInstrument(chain, spec.device) &&
    Math.abs((chain.gainDb ?? 0) - spec.gainDb) <= DB_TOLERANCE
  );
}

/**
 * Whether a rack holds exactly the given layers, each as built.
 * @param result - Parsed ppal-read-device result for the rack
 * @param specs - The layers the rack should hold
 * @returns True when the rack has these layers and no others
 */
export function layersAreUntouched(
  result: unknown,
  specs: LayerSpec[],
): boolean {
  const chains = rackChains(result);

  return (
    chains.length === specs.length &&
    specs.every((spec) =>
      isLayerUntouched(
        chains.find((chain) => chain.name === spec.name),
        spec,
      ),
    )
  );
}

/**
 * Read a rack with its layers and grade them.
 *
 * @param rackPath - Path of the Instrument Rack
 * @param what - What the check is looking for, for the failure text
 * @param check - Verdict over the rack read
 * @returns A state assertion over the rack
 */
export function assertRackLayers(
  rackPath: string,
  what: string,
  check: (result: unknown) => boolean,
): EvalAssertion {
  return {
    type: "state",
    tool: TOOLS.readDevice,
    args: { path: rackPath, include: ["chains"], maxDepth: 1 },
    expect: check,
    explain: (result) =>
      `${rackPath}: expected ${what}, got ${describeLayers(result)}`,
  };
}

/**
 * Read a pad and grade its own chains: the pad's fader and how many layers the
 * pad itself has, apart from the layers inside the rack on it.
 *
 * @param padPath - Path of the drum pad
 * @param what - What the check is looking for, for the failure text
 * @param check - Verdict over the pad's chains
 * @returns A state assertion over the pad
 */
export function assertPadChains(
  padPath: string,
  what: string,
  check: (chains: RackChain[]) => boolean,
): EvalAssertion {
  return {
    type: "state",
    tool: TOOLS.readDevice,
    args: { path: padPath, include: ["chains"] },
    expect: (result) => check(rackChains(result)),
    explain: (result) =>
      `${padPath}: expected ${what}, got ${describeLayers(result)}`,
  };
}
