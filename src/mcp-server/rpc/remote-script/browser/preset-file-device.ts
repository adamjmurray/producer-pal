// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Telling which device a preset file is for, by reading it. A preset is
// gzipped XML: an .adv's root element is its device's class, and an .adg's is
// `GroupDevicePreset` around a rack class, with its chains' devices after it.

import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const gunzipAsync = promisify(gunzip);

/** The most XML a preset is read as. A bigger file is left unchecked. */
const MAX_XML_BYTES = 64 * 1024 * 1024;

/** How far into the XML the root and the rack class are looked for. */
const HEAD_CHARS = 4096;

/** Racks' classes, which an .adg holds inside `GroupDevicePreset`. */
const RACK_CLASSES: Array<[string, string]> = [
  ["drum rack", "DrumGroupDevice"],
  ["instrument rack", "InstrumentGroupDevice"],
  ["audio effect rack", "AudioEffectGroupDevice"],
  ["midi effect rack", "MidiEffectGroupDevice"],
];

const RACK_CLASS_NAMES = new Set(RACK_CLASSES.map(([, cls]) => cls));

/**
 * Each device's XML class, for the devices whose presets ship in Live's Core
 * Library. A device not listed (a plug-in, a Max device, one without presets)
 * isn't checked.
 */
const DEVICE_CLASSES = new Map<string, string>([
  ...RACK_CLASSES,
  ...Object.entries({
    // Instruments
    analog: "UltraAnalog",
    collision: "Collision",
    drift: "Drift",
    electric: "LoungeLizard",
    impulse: "InstrumentImpulse",
    meld: "InstrumentMeld",
    operator: "Operator",
    sampler: "MultiSampler",
    simpler: "OriginalSimpler",
    tension: "StringStudio",
    wavetable: "InstrumentVector",
    // MIDI effects
    arpeggiator: "MidiArpeggiator",
    chord: "MidiChord",
    "note length": "MidiNoteLength",
    pitch: "MidiPitcher",
    random: "MidiRandom",
    scale: "MidiScale",
    velocity: "MidiVelocity",
    // Audio effects
    amp: "Amp",
    "auto filter": "AutoFilter2",
    "auto pan-tremolo": "AutoPan2",
    "auto shift": "AutoShift",
    "beat repeat": "BeatRepeat",
    cabinet: "Cabinet",
    "channel eq": "ChannelEq",
    "chorus-ensemble": "Chorus2",
    compressor: "Compressor2",
    corpus: "Corpus",
    delay: "Delay",
    "drum buss": "DrumBuss",
    "dynamic tube": "Tube",
    echo: "Echo",
    "eq eight": "Eq8",
    "eq three": "FilterEQ3",
    erosion: "Erosion2",
    "filter delay": "FilterDelay",
    gate: "Gate",
    "glue compressor": "GlueCompressor",
    "grain delay": "GrainDelay",
    "hybrid reverb": "Hybrid",
    limiter: "Limiter",
    looper: "Looper",
    "multiband dynamics": "MultibandDynamics",
    overdrive: "Overdrive",
    pedal: "Pedal",
    "phaser-flanger": "PhaserNew",
    redux: "Redux2",
    resonators: "Resonator",
    reverb: "Reverb",
    roar: "Roar",
    saturator: "Saturator",
    shifter: "Shifter",
    "spectral resonator": "Transmute",
    "spectral time": "Spectral",
    spectrum: "SpectrumAnalyzer",
    utility: "StereoGain",
    "vinyl distortion": "Vinyl",
    vocoder: "Vocoder",
  }),
]);

/**
 * Whether a preset file is for a device. An .adv is for the device its root
 * element names. An .adg is for the rack it holds, or, for any other device, the
 * one it is built around: the first device of its first chain (Live files an
 * Impulse kit under Impulse). A rack that merely holds the device isn't for it.
 * Anything that can't be told counts as a yes: an unknown device, a file that
 * can't be read or isn't gzipped XML. Live then makes the call when it loads.
 * @param path - The preset file's absolute path
 * @param device - The device as the call named it
 * @returns False only when the file is readably for another device
 */
export async function presetFileIsFor(
  path: string,
  device: string,
): Promise<boolean> {
  const deviceClass = DEVICE_CLASSES.get(device.trim().toLowerCase());

  if (deviceClass == null) {
    return true;
  }

  const xml = await readPresetXml(path);
  const root = xml == null ? null : rootClass(xml);

  if (xml == null || root == null) {
    return true;
  }

  if (root !== "GroupDevicePreset") {
    return root === deviceClass;
  }

  const rack = rackClass(xml);

  if (rack == null) {
    return true;
  }

  // A named rack is for racks of its own class only.
  return RACK_CLASS_NAMES.has(deviceClass)
    ? rack === deviceClass
    : firstDeviceClass(xml) === deviceClass;
}

// --- Helpers below main export ---

/**
 * @param path - The preset file
 * @returns Its XML, or null when it can't be read or isn't gzipped
 */
async function readPresetXml(path: string): Promise<string | null> {
  try {
    const gzipped = await readFile(path);
    const xml = await gunzipAsync(gzipped, {
      maxOutputLength: MAX_XML_BYTES,
    });

    return xml.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * @param xml - A preset's XML
 * @returns The class of its first element inside `<Ableton>`, or null
 */
function rootClass(xml: string): string | null {
  const match = /<Ableton\b[^>]*>\s*<([A-Za-z]\w*)/.exec(
    xml.slice(0, HEAD_CHARS),
  );

  return match?.[1] ?? null;
}

/**
 * @param xml - An .adg's XML
 * @returns The class of the rack it holds, or null
 */
function rackClass(xml: string): string | null {
  const match = /<Device>\s*<([A-Za-z]\w*)/.exec(xml.slice(0, HEAD_CHARS));

  return match?.[1] ?? null;
}

/**
 * @param xml - An .adg's XML
 * @returns The class of the first device in the rack's first chain, or null
 *   when that chain is empty or the file has no chains
 */
function firstDeviceClass(xml: string): string | null {
  const chains = xml.indexOf("<BranchPresets>");

  if (chains === -1) {
    return null;
  }

  const rest = xml.slice(chains);
  const match = /<DevicePresets>[\s\S]*?<Device>\s*<([A-Za-z]\w*)/.exec(rest);

  // A chain with no devices has no `<DevicePresets>` of its own, so the match
  // would be a later chain's: the first chain closes before it.
  return match != null &&
    !/<\/\w*BranchPreset>/.test(rest.slice(0, match.index))
    ? (match[1] as string)
    : null;
}
