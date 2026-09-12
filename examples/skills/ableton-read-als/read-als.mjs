#!/usr/bin/env node

// Read Ableton Live Set (.als) files without opening Live (Node 18+, no dependencies).
//
// CLI:
//   node read-als.mjs <file.als | folder> [more paths...] [options]
//
// Options:
//   --include <list>   comma-separated sections, or "all". Default: devices
//                      tracks (always) devices parameters clips mixer routing
//                      scenes locators
//   --compact          one JSON document per line, no indentation
//
// Examples:
//   node read-als.mjs "My Song Project/My Song.als"
//   node read-als.mjs ~/Music/Ableton/Projects --include devices,parameters
//   node read-als.mjs song.als --include all
//
// Library:
//   import { readAls } from "./read-als.mjs";
//   const set = readAls("/path/to/song.als", { include: ["devices", "clips"] });
//
// A folder is walked recursively; Backup/ folders are skipped. Output is one
// JSON object per Set (an array when more than one). Live 12 only.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const SECTIONS = [
  "devices",
  "parameters",
  "clips",
  "mixer",
  "routing",
  "scenes",
  "locators",
];

// Live's color palette, by color index. Captured from Live 12 by setting a
// track's color_index 0..69 and reading the color back.
const PALETTE = [
  "#FF94A6",
  "#FFA529",
  "#CC9927",
  "#F7F47C",
  "#BFFB00",
  "#1AFF2F",
  "#25FFA8",
  "#5CFFE8",
  "#8BC5FF",
  "#5480E4",
  "#92A7FF",
  "#D86CE4",
  "#E553A0",
  "#FFFFFF",
  "#FF3636",
  "#F66C03",
  "#99724B",
  "#FFF034",
  "#87FF67",
  "#3DC300",
  "#00BFAF",
  "#19E9FF",
  "#10A4EE",
  "#007DC0",
  "#886CE4",
  "#B677C6",
  "#FF39D4",
  "#D0D0D0",
  "#E2675A",
  "#FFA374",
  "#D3AD71",
  "#EDFFAE",
  "#D2E498",
  "#BAD074",
  "#9BC48D",
  "#D4FDE1",
  "#CDF1F8",
  "#B9C1E3",
  "#CDBBE4",
  "#AE98E5",
  "#E5DCE1",
  "#A9A9A9",
  "#C6928B",
  "#B78256",
  "#99836A",
  "#BFBA69",
  "#A6BE00",
  "#7DB04D",
  "#88C2BA",
  "#9BB3C4",
  "#85A5C2",
  "#8393CC",
  "#A595B5",
  "#BF9FBE",
  "#BC7196",
  "#7B7B7B",
  "#AF3333",
  "#A95131",
  "#724F41",
  "#DBC300",
  "#85961F",
  "#539F31",
  "#0A9C8E",
  "#236384",
  "#1A2F96",
  "#2F52A2",
  "#624BAD",
  "#A34BAD",
  "#CC2E6E",
  "#3C3C3C",
];

const WARP_MODES = [
  "beats",
  "tones",
  "texture",
  "repitch",
  "complex",
  "rex",
  "pro",
];
const MONITORING = ["in", "auto", "off"];
const SCALE_NAMES = [
  "Major",
  "Minor",
  "Dorian",
  "Mixolydian",
  "Lydian",
  "Phrygian",
  "Locrian",
  "Whole Tone",
  "Half-whole Dim.",
  "Whole-half Dim.",
  "Minor Blues",
  "Minor Pentatonic",
  "Major Pentatonic",
  "Harmonic Minor",
  "Harmonic Major",
  "Dorian #4",
  "Phrygian Dominant",
  "Melodic Minor",
  "Lydian Augmented",
  "Lydian Dominant",
  "Super Locrian",
  "8-Tone Spanish",
  "Bhairav",
  "Hungarian Minor",
  "Hirajoshi",
  "In-Sen",
  "Iwato",
  "Kumoi",
  "Pelog Selisir",
  "Pelog Tembung",
  "Messiaen 3",
  "Messiaen 4",
  "Messiaen 5",
  "Messiaen 6",
  "Messiaen 7",
];
const PITCH_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const PLUGIN_TYPES = {
  Vst3PluginInfo: "vst3",
  VstPluginInfo: "vst",
  AuPluginInfo: "au",
};

// Device element tags that hold chains of other devices.
const RACK_TAGS = new Set([
  "InstrumentGroupDevice",
  "AudioEffectGroupDevice",
  "MidiEffectGroupDevice",
  "DrumGroupDevice",
]);

// ---------------------------------------------------------------------------
// Minimal XML → tree. Every .als element is either <Tag Value="…"/> or a
// container; text content (a few binary blobs) is ignored.

function parseXml(xml) {
  const root = { tag: "", attrs: {}, children: [] };
  const stack = [root];
  const tagRe = /<(\/?)([\w.:-]+)((?:\s+[\w.:-]+="[^"]*")*)\s*(\/?)>/g;
  const attrRe = /([\w.:-]+)="([^"]*)"/g;
  let m;
  while ((m = tagRe.exec(xml)) != null) {
    const [, closing, tag, attrText, selfClosing] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = {};
    let a;
    while ((a = attrRe.exec(attrText)) != null) {
      attrs[a[1]] = unescape(a[2]);
    }
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
  }
  return root.children[0];
}

function unescape(s) {
  return s.includes("&")
    ? s
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replaceAll("&amp;", "&")
    : s;
}

function child(node, ...path) {
  let cur = node;
  for (const tag of path) {
    cur = cur?.children.find((c) => c.tag === tag);
  }
  return cur;
}

function children(node, ...path) {
  return child(node, ...path)?.children ?? [];
}

function value(node, ...path) {
  const v = child(node, ...path)?.attrs.Value;
  if (v == null) {
    return undefined;
  }
  if (v === "true") {
    return true;
  }
  if (v === "false") {
    return false;
  }
  if (v !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Live Set

/**
 * Reads one .als file into a plain object.
 * @param {string} file - Path to the .als
 * @param {{ include?: string[] }} [options]
 * @returns {object} The Set summary
 */
export function readAls(file, options = {}) {
  const include = resolveInclude(options.include);
  const xml = gunzipSync(readFileSync(file)).toString("utf8");
  const doc = parseXml(xml);
  const liveSet = child(doc, "LiveSet");
  const mainTrack = child(liveSet, "MainTrack");
  const mainMixer = child(mainTrack, "DeviceChain", "Mixer");
  const scale = child(liveSet, "ScaleInformation");

  const result = {
    file: resolve(file),
    name: basename(file, ".als"),
    liveVersion: doc.attrs.Creator,
    tempo: initialValue(mainTrack, mainMixer, "Tempo"),
    timeSignature: decodeTimeSignature(
      initialValue(mainTrack, mainMixer, "TimeSignature"),
    ),
    scale: `${PITCH_NAMES[value(scale, "Root")]} ${SCALE_NAMES[value(scale, "Name")] ?? value(scale, "Name")}`,
    scaleEnabled: value(liveSet, "InKey"),
    arrangementLoop: {
      on: value(liveSet, "Transport", "LoopOn"),
      start: value(liveSet, "Transport", "LoopStart"),
      length: value(liveSet, "Transport", "LoopLength"),
    },
  };

  if (include.has("scenes")) {
    result.scenes = children(liveSet, "Scenes").map(readScene);
  }
  if (include.has("locators")) {
    result.locators = children(liveSet, "Locators", "Locators").map((l) => ({
      name: value(l, "Name"),
      time: value(l, "Time"),
    }));
  }

  const tracks = children(liveSet, "Tracks");
  const groupNames = new Map(
    tracks
      .filter((t) => t.tag === "GroupTrack")
      .map((t) => [t.attrs.Id, value(t, "Name", "EffectiveName")]),
  );
  result.tracks = tracks.map((t) => readTrack(t, include, groupNames));
  result.mainTrack = readTrack(mainTrack, include, groupNames);
  return result;
}

function resolveInclude(list) {
  const wanted = new Set(list ?? ["devices"]);
  if (wanted.has("all")) {
    return new Set(SECTIONS);
  }
  if (wanted.has("parameters")) {
    wanted.add("devices");
  }
  for (const s of wanted) {
    if (!SECTIONS.includes(s) && s !== "tracks") {
      throw new Error(
        `Unknown include "${s}". Choose from: ${SECTIONS.join(", ")}, all`,
      );
    }
  }
  return wanted;
}

// Tempo and time signature edits land in a main-track automation envelope (the
// event at the far-past time is the Set's value); Manual keeps the default.
function initialValue(mainTrack, mainMixer, parameter) {
  const targetId = child(mainMixer, parameter, "AutomationTarget")?.attrs.Id;
  const envelope = children(mainTrack, "AutomationEnvelopes", "Envelopes").find(
    (e) => value(e, "EnvelopeTarget", "PointeeId") === Number(targetId),
  );
  const first = children(envelope, "Automation", "Events")
    .map((e) => ({ time: Number(e.attrs.Time), value: Number(e.attrs.Value) }))
    .toSorted((a, b) => a.time - b.time)[0];
  return first?.value ?? value(mainMixer, parameter, "Manual");
}

// Live stores the main time signature as denominatorIndex * 99 + numerator - 1,
// where the denominator is 2 ** denominatorIndex. 201 is 4/4.
function decodeTimeSignature(encoded) {
  if (typeof encoded !== "number") {
    return undefined;
  }
  const numerator = (encoded % 99) + 1;
  const denominator = 2 ** Math.floor(encoded / 99);
  return `${numerator}/${denominator}`;
}

function color(index) {
  return index == null || index < 0
    ? undefined
    : (PALETTE[index] ?? `index ${index}`);
}

function readScene(scene) {
  return {
    name: value(scene, "Name"),
    color: color(value(scene, "Color")),
    ...(value(scene, "IsTempoEnabled") && { tempo: value(scene, "Tempo") }),
    ...(value(scene, "IsTimeSignatureEnabled") && {
      timeSignature: decodeTimeSignature(value(scene, "TimeSignatureId")),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tracks

const TRACK_TYPES = {
  MidiTrack: "midi",
  AudioTrack: "audio",
  GroupTrack: "group",
  ReturnTrack: "return",
  MainTrack: "main",
};

function readTrack(track, include, groupNames) {
  const chain = child(track, "DeviceChain");
  const sequencer = child(chain, "MainSequencer");
  const groupId = value(track, "TrackGroupId");
  const type = TRACK_TYPES[track.tag] ?? track.tag;
  const result = {
    name: value(track, "Name", "EffectiveName"),
    type,
    color: color(value(track, "Color")),
    ...(groupId != null &&
      groupId >= 0 && { group: groupNames.get(String(groupId)) }),
    ...(value(track, "Freeze") === true && { frozen: true }),
  };
  if (sequencer != null && (type === "midi" || type === "audio")) {
    result.monitoring = MONITORING[value(sequencer, "MonitoringEnum")];
  }
  if (include.has("mixer")) {
    result.mixer = readMixer(child(chain, "Mixer"));
  }
  if (include.has("routing")) {
    result.routing = readRouting(chain);
  }
  if (include.has("devices")) {
    result.devices = readDevices(
      child(chain, "DeviceChain", "Devices"),
      include,
    );
  }
  if (include.has("clips") && sequencer != null) {
    const session = children(sequencer, "ClipSlotList").map((slot, i) => {
      const clip = children(slot, "ClipSlot", "Value")[0];
      return clip && { scene: i, ...readClip(clip) };
    });
    result.sessionClips = session.filter(Boolean);
    result.arrangementClips = children(
      sequencer,
      "ClipTimeable",
      "ArrangerAutomation",
      "Events",
    ).map((clip) => ({ start: Number(clip.attrs.Time), ...readClip(clip) }));
  }
  return result;
}

function readMixer(mixer) {
  return {
    volume: value(mixer, "Volume", "Manual"),
    pan: value(mixer, "Pan", "Manual"),
    active: value(mixer, "Speaker", "Manual"),
    sends: children(mixer, "Sends").map((holder) =>
      value(holder, "Send", "Manual"),
    ),
  };
}

function readRouting(chain) {
  const display = (name) => {
    const r = child(chain, name);
    return [value(r, "UpperDisplayString"), value(r, "LowerDisplayString")]
      .filter((s) => s !== "" && s != null)
      .join(" / ");
  };
  return {
    audioIn: display("AudioInputRouting"),
    audioOut: display("AudioOutputRouting"),
    midiIn: display("MidiInputRouting"),
    midiOut: display("MidiOutputRouting"),
  };
}

// ---------------------------------------------------------------------------
// Devices

function readDevices(devicesNode, include) {
  return (devicesNode?.children ?? []).map((d) => readDevice(d, include));
}

function readDevice(device, include) {
  const result = {
    type: device.tag,
    name: value(device, "UserName") || undefined,
    on: value(device, "On", "Manual"),
  };
  // A user or factory preset (.adv/.adg) or a Max for Live device (.amxd). A
  // stock device with no preset points at a Core Library folder, which is noise.
  const ref = device.tag.startsWith("MxDevice")
    ? [...iterate(device)].find((n) => n.tag === "FileRef")
    : child(device, "LastPresetRef", "Value")?.children[0]?.children.find(
        (n) => n.tag === "FileRef",
      );
  const presetPath = value(ref, "Path");
  if (/\.(adv|adg|amxd)$/i.test(presetPath ?? "")) {
    result.preset = presetPath;
  }

  if (device.tag === "PluginDevice") {
    const info = child(device, "PluginDesc")?.children[0];
    result.type = PLUGIN_TYPES[info?.tag] ?? "plugin";
    result.name = value(info, "Name");
    if (include.has("parameters")) {
      result.parameters = readPluginParameters(device);
    }
    return result;
  }
  if (RACK_TAGS.has(device.tag)) {
    result.macros = readMacros(device);
    result.chains = children(device, "Branches").map((b) =>
      readChain(b, include),
    );
    return result;
  }
  if (device.tag === "OriginalSimpler" || device.tag === "MultiSampler") {
    const sample = [...iterate(device)].find((n) => n.tag === "SampleRef");
    const samplePath = value(sample, "FileRef", "Path");
    if (samplePath) {
      result.sample = samplePath;
    }
  }
  if (include.has("parameters")) {
    result.parameters = readParameters(device);
  }
  return result;
}

function readMacros(rack) {
  const count = value(rack, "NumVisibleMacroControls") ?? 0;
  const macros = {};
  for (let i = 0; i < count; i++) {
    macros[value(rack, `MacroDisplayNames.${i}`)] = value(
      rack,
      `MacroControls.${i}`,
      "Manual",
    );
  }
  return macros;
}

function readChain(branch, include) {
  const chainNode = child(branch, "DeviceChain")?.children.find((c) =>
    c.tag.endsWith("DeviceChain"),
  );
  const mixer = child(branch, "MixerDevice");
  const note = value(branch, "BranchInfo", "ReceivingNote");
  return {
    name: value(branch, "Name", "EffectiveName"),
    ...(note != null && { note }),
    color: color(value(branch, "Color")),
    ...(mixer && {
      volume: value(mixer, "Volume", "Manual"),
      pan: value(mixer, "Pan", "Manual"),
      active: value(mixer, "Speaker", "Manual"),
    }),
    devices: readDevices(child(chainNode, "Devices"), include),
  };
}

// Only the plug-in parameters Live has configured (shown in the device panel)
// carry a name; the rest are unnamed slots.
function readPluginParameters(device) {
  const params = {};
  for (const p of children(device, "ParameterList")) {
    const name = value(p, "ParameterName");
    if (name) {
      params[name] = value(p, "ParameterValue", "Manual");
    }
  }
  return params;
}

// A parameter is any element with a Manual value. Containers (an EQ band, a
// compressor's sidechain) are flattened with a dotted name.
const SKIP_PARAMETER_TAGS = new Set([
  "On",
  "LomId",
  "LomIdView",
  "Pointee",
  "LastPresetRef",
  "SourceContext",
  "LockedScripts",
  "ViewData",
  "Branches",
  "ReturnBranches",
]);
const MAX_PARAMETER_DEPTH = 4;

function readParameters(device, prefix = "", depth = 0) {
  const params = {};
  for (const c of device.children) {
    if (SKIP_PARAMETER_TAGS.has(c.tag) || c.tag.startsWith("Macro")) {
      continue;
    }
    const manual = value(c, "Manual");
    if (manual !== undefined) {
      params[prefix + c.tag] = manual;
    } else if (c.children.length > 0 && depth < MAX_PARAMETER_DEPTH) {
      Object.assign(params, readParameters(c, `${prefix}${c.tag}.`, depth + 1));
    }
  }
  return params;
}

function* iterate(node) {
  yield node;
  for (const c of node.children) {
    yield* iterate(c);
  }
}

// ---------------------------------------------------------------------------
// Clips

function readClip(clip) {
  const loop = child(clip, "Loop");
  const sig = children(clip, "TimeSignature", "TimeSignatures")[0];
  const result = {
    name: value(clip, "Name"),
    type: clip.tag === "AudioClip" ? "audio" : "midi",
    color: color(value(clip, "Color")),
    length: value(clip, "CurrentEnd") - value(clip, "CurrentStart"),
    loop: value(loop, "LoopOn"),
    loopStart: value(loop, "LoopStart"),
    loopEnd: value(loop, "LoopEnd"),
    timeSignature: `${value(sig, "Numerator")}/${value(sig, "Denominator")}`,
    ...(value(clip, "Disabled") === true && { disabled: true }),
  };
  if (clip.tag === "AudioClip") {
    result.sample = value(clip, "SampleRef", "FileRef", "Path");
    result.warping = value(clip, "IsWarped");
    result.warpMode = WARP_MODES[value(clip, "WarpMode")];
    result.pitch = value(clip, "PitchCoarse") + value(clip, "PitchFine") / 100;
    result.gain = value(clip, "SampleVolume");
  } else {
    result.noteCount = children(clip, "Notes", "KeyTracks").reduce(
      (sum, kt) => sum + children(kt, "Notes").length,
      0,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

function findSets(paths) {
  const files = [];
  const walk = (p) => {
    const stat = statSync(p);
    if (stat.isDirectory()) {
      if (basename(p) === "Backup") {
        return;
      }
      for (const entry of readdirSync(p).toSorted()) {
        walk(join(p, entry));
      }
    } else if (p.endsWith(".als")) {
      files.push(p);
    }
  };
  for (const p of paths) {
    walk(p);
  }
  return files;
}

function main(argv) {
  const paths = [];
  let include;
  let compact = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--include") {
      include = argv[++i]?.split(",").map((s) => s.trim());
    } else if (arg.startsWith("--include=")) {
      include = arg.slice(10).split(",");
    } else if (arg === "--compact") {
      compact = true;
    } else if (arg === "--help" || arg === "-h") {
      usage(0);
    } else {
      paths.push(arg);
    }
  }
  if (paths.length === 0) {
    usage(1);
  }

  const files = findSets(paths);
  if (files.length === 0) {
    console.error("No .als files found");
    process.exit(1);
  }
  const sets = files.map((f) => {
    try {
      return readAls(f, { include });
    } catch (error) {
      return { file: resolve(f), error: error.message };
    }
  });
  if (compact) {
    for (const s of sets) {
      console.log(JSON.stringify(s));
    }
  } else {
    console.log(JSON.stringify(files.length === 1 ? sets[0] : sets, null, 2));
  }
}

function usage(code) {
  console.error(
    "Usage: node read-als.mjs <file.als | folder> [...] [--include devices,parameters,clips,mixer,routing,scenes,locators|all] [--compact]",
  );
  process.exit(code);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  main(process.argv.slice(2));
}
