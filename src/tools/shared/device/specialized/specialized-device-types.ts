// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Types for the specialized-device interface layer. Devices with a specialized
// Live API class (Roar, Drift, Wavetable, Compressor, ...) expose state that
// can't be reached as DeviceParameters. Each such device contributes a
// `SpecializedDeviceSpec` that plugs into the shared read/update plumbing:
//
//   - `params`     → writable/read-only pseudo-params (flow through the
//                    existing `params` arg / `parameters` output)
//   - `actions`    → handlers for the `actions` arg on update-device
//   - `readOptions`→ dynamic catalogs surfaced via `include: ["options"]`
//   - `readModulations` → the `modulations` output field (Wavetable only)
//
// See dev/Specialized-Devices.md for the full design.

/**
 * A pseudo-parameter: a named value that behaves like a DeviceParameter from
 * the LLM's perspective but is actually backed by a class-level Live API
 * property (or function). Every pseudo-param is readable (it appears in the
 * `parameters` output); omit `write` for read-only ones.
 */
export interface PseudoParam {
  /** Canonical camelCase name (e.g. "routingMode", "voiceCount"). */
  name: string;
  /**
   * Read the current value. Return `undefined` to omit the entry from the
   * `parameters` output (e.g. a value that doesn't apply in the current
   * device state).
   */
  read: (device: LiveAPI) => unknown;
  /**
   * Apply a new value. Follow update-tool conventions: warn-and-skip on
   * invalid input rather than throwing.
   */
  write?: (device: LiveAPI, value: string | number, toolName: string) => void;
}

/** A parsed `actions` entry: a name plus positional literal args. */
export interface ParsedAction {
  name: string;
  args: Array<string | number>;
}

/** Handler for a single named action. */
export type ActionHandler = (
  device: LiveAPI,
  args: Array<string | number>,
  toolName: string,
) => void;

/**
 * A named action's full definition: the handler plus the discovery metadata
 * surfaced by `ppal-read-device include: ["actions"]`. Co-located with the
 * handler so the docs can't drift from the implementation.
 */
export interface ActionDef {
  /** The action implementation. */
  handler: ActionHandler;
  /** Call form shown to the model, e.g. `warpAs(beats)` or `reverse`. */
  signature: string;
  /** One-line description of what the action does. */
  description: string;
}

/**
 * The full contribution a specialized device makes to the tool surface.
 * Dispatched by `class_display_name` (consistent with the existing Simpler
 * `sample` handling — display names are stable English device names).
 */
export interface SpecializedDeviceSpec {
  /** `class_display_name` value(s) this spec handles (e.g. ["Roar"]). */
  displayNames: string[];
  /** Writable / read-only pseudo-params. */
  params?: PseudoParam[];
  /** Action definitions, keyed by action name (matched case-insensitively). */
  actions?: Record<string, ActionDef>;
  /** Dynamic catalogs for the `options` include. */
  readOptions?: (device: LiveAPI) => Record<string, unknown>;
  /** Structured modulation-matrix state (Wavetable). */
  readModulations?: (device: LiveAPI) => unknown[];
}
