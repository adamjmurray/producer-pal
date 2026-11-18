// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isPanelBox, panelBoxes, panelLines } from "./plugin-host-panel.ts";
import {
  FLOAT_RANGE,
  type Json,
  type Patchline,
  patchCord,
  RawJson,
} from "./plugin-host-patch.ts";

const SLOTS = 128;
const COLUMNS = 8;
const KNOBS = 16; // keep in step with KNOBS in plugin-host-panel.ts
const HEADER_SIZE = 32;
const SLOT_BOX = /^slot(dial|lim|prep)\d+$/;
// Live sends a moving slot about 670 values a second (one per audio block).
// Passing at most one per this many ms keeps the plug-in's CPU down.
const SLOT_INTERVAL_MS = 20;
const SLOT_ROUTE = "slotroute";
// A pattr bound to vst~ re-reads the plug-in's whole state on every param
// change, which glitches the audio while automation moves. The slot list was
// the panel before the knobs.
const REMOVED_BOXES = new Set(["vstmirror", "slotlist"]);

/** A page of the panel's knobs: `count` slots from slot `first` (1-based). */
export interface KnobPage {
  name: string;
  first: number;
  count: number;
}

/** Spike: what a device generated for one plug-in bakes in. */
export interface BakedPlugin {
  /** The wrapper's load request for the plug-in */
  load: Json;
  /**
   * One per dial: its Live param name, the plug-in param it drives, and the
   * shorter name its panel knob shows
   */
  slots: { name: string; index: number; value?: number; label?: string }[];
  /** The panel's pages; default: 16 slots each */
  pages?: KnobPage[];
}

interface Box {
  box: Json;
}

interface Patcher {
  patcher: {
    boxes: Box[];
    lines: Patchline[];
    parameters?: unknown;
  };
}

/**
 * Rebuild one plug-in host .amxd: put the wrapper code into its v8.codebox and
 * replace the automation-slot dials, their prepends and cords, the vstslots
 * pattr and the device panel, take vst~ out of the panel, cut vststate off
 * from vst~ and drop vstmirror and the old slot list. Never touches the
 * patcher's "project" block (one missing fields crashes Live). Running it twice
 * gives the same bytes.
 *
 * @param amxd - The device file
 * @param wrapperCode - wrapper.js source; its SLOT_COUNT is set to SLOTS
 * @param baked - Spike: bake in one plug-in, a dial per param
 * @returns The rebuilt device file
 */
export function buildPluginHostDevice(
  amxd: Buffer,
  wrapperCode: string,
  baked?: BakedPlugin,
): Buffer {
  const names = baked ? baked.slots.map((s) => s.name) : slotNames(SLOTS);
  const code = bake(setSlotCount(wrapperCode, names.length), baked);
  const json = readPatcher(amxd);
  const p = json.patcher;
  const boxes = p.boxes.filter(
    (b) => !isOurs(b.box.id) && !isRemoved(b.box.id),
  );

  for (const b of boxes) {
    if (b.box.maxclass === "v8.codebox") {
      b.box.code = code;
    }

    if (b.box.id === "vst") {
      delete b.box.presentation;
      delete b.box.presentation_rect;
    }

    // Storage only: the wrapper restores it into vst~, which can't read the
    // stored form. A cord would also reset the plug-in on every restore.
    if (b.box.id === "vststate") {
      b.box.text = "pattr vststate @parameter_enable 1";
    }
  }

  const initial = baked?.slots.map((s) => s.value);

  const pages = baked?.pages ?? slotPages(names.length);

  p.boxes = [
    ...boxes,
    ...ownedBoxes(names, pages, initial).map((box) => ({ box })),
  ];
  p.lines = [
    ...p.lines.filter((l) => !touchesOurs(l) && !feedsVst(l)),
    ...ownedLines(names.length),
  ];
  p.parameters ??= { parameterbanks: {}, inherited_shortname: 1 };

  const body = Buffer.from(`${JSON.stringify(json, null, 2)}\n\0`);
  const header = Buffer.from(amxd.subarray(0, HEADER_SIZE));

  header.writeUInt32LE(body.length, 28);

  return Buffer.concat([header, body]);
}

/**
 * Read the code in a device's v8.codebox.
 *
 * @param amxd - The device file
 * @returns The wrapper code
 */
export function extractWrapperCode(amxd: Buffer): string {
  const box = readPatcher(amxd).patcher.boxes.find(
    (b) => b.box.maxclass === "v8.codebox",
  );

  if (typeof box?.box.code !== "string") {
    throw new Error("no v8.codebox");
  }

  return box.box.code;
}

// Numbers keep their source text, so 20.0 stays 20.0 when written back.
function readPatcher(amxd: Buffer): Patcher {
  const tag = amxd.toString("latin1", 24, 28);

  if (tag !== "ptch" || amxd.readUInt32LE(28) !== amxd.length - HEADER_SIZE) {
    throw new Error("not an .amxd patcher");
  }

  const text = amxd.toString("utf8", HEADER_SIZE).replace(/\0+$/, "");

  return RawJson.parse(text, (_key, value, context) =>
    typeof value === "number" ? RawJson.rawJSON(context.source) : value,
  ) as Patcher;
}

function setSlotCount(code: string, count: number): string {
  const pattern = /const SLOT_COUNT = \d+;/g;

  if (code.match(pattern)?.length !== 1) {
    throw new Error("wrapper.js needs one 'const SLOT_COUNT = <n>;' line");
  }

  return code.replaceAll(pattern, `const SLOT_COUNT = ${count};`);
}

function bake(code: string, baked?: BakedPlugin): string {
  if (!baked) {
    return code;
  }

  const line = "const BAKED = null;";

  if (code.split(line).length !== 2) {
    throw new Error(`wrapper.js needs one '${line}' line`);
  }

  const slots = Object.fromEntries(
    baked.slots.map((s, i) => [
      String(i + 1),
      { index: s.index, name: s.name, label: s.label },
    ]),
  );
  const { load, pages } = baked;

  return code.replace(
    line,
    `const BAKED = ${JSON.stringify({ load, slots, pages })};`,
  );
}

// Keep in step with slotPages in wrapper.js
function slotPages(count: number): KnobPage[] {
  return Array.from({ length: Math.ceil(count / KNOBS) }, (_, p) => {
    const first = p * KNOBS + 1;
    const last = Math.min(count, first + KNOBS - 1);

    return { name: `Slots ${first}–${last}`, first, count: last - first + 1 };
  });
}

// Keep in step with dialName in wrapper.js
function slotNames(count: number): string[] {
  const width = Math.max(2, String(count).length);

  return Array.from(
    { length: count },
    (_, i) => `Slot ${String(i + 1).padStart(width, "0")}`,
  );
}

// Includes dials and prepends left by a build with more slots.
function isOurs(id: unknown): boolean {
  return (
    typeof id === "string" &&
    (id === "vstslots" ||
      id === SLOT_ROUTE ||
      isPanelBox(id) ||
      SLOT_BOX.test(id))
  );
}

function isRemoved(id: unknown): boolean {
  return typeof id === "string" && REMOVED_BOXES.has(id);
}

function touchesOurs(line: Patchline): boolean {
  const ends = [line.patchline.source[0], line.patchline.destination[0]];

  return ends.some((id) => isOurs(id) || isRemoved(id));
}

function feedsVst(line: Patchline): boolean {
  return line.patchline.source[0] === "vststate";
}

function ownedBoxes(
  names: string[],
  pages: KnobPage[],
  initial?: (number | undefined)[],
): Json[] {
  const slots = names.map((_, i) => i + 1);

  return [
    ...slots.map((n) => dial(n, names[n - 1] as string, initial?.[n - 1])),
    ...slots.map(speedlim),
    ...slots.map(prepend),
    slotRoute(),
    vstslots(),
    ...panelBoxes(
      pages.map((page) => page.name),
      Math.max(2, String(names.length).length),
    ),
  ];
}

function ownedLines(count: number): Patchline[] {
  const slotCords = Array.from({ length: count }, (_, i) => [
    patchCord(`slotdial${i + 1}`, `slotlim${i + 1}`),
    patchCord(`slotlim${i + 1}`, `slotprep${i + 1}`),
    patchCord(`slotprep${i + 1}`, SLOT_ROUTE),
  ]).flat();

  return [...slotCords, patchCord(SLOT_ROUTE, "vst", 1), ...panelLines()];
}

// Names are zero-padded so Live sorts them.
function dial(n: number, name: string, initial?: number): Json {
  const { col, row } = grid(n);

  return {
    id: `slotdial${n}`,
    maxclass: "live.dial",
    numinlets: 1,
    numoutlets: 2,
    outlettype: ["", "float"],
    parameter_enable: 1,
    varname: `slotdial${n}`,
    patching_rect: [20 + col * 50, 360 + row * 60, 44, 48],
    saved_attribute_attributes: {
      valueof: {
        parameter_longname: name,
        parameter_shortname: name,
        ...FLOAT_RANGE,
        ...(initial == null
          ? {}
          : { parameter_initial_enable: 1, parameter_initial: [initial] }),
      },
    },
  };
}

// Holds the latest value and sends it when the interval ends, so the last
// value of a move always arrives.
function speedlim(n: number): Json {
  const { col, row } = grid(n);

  return {
    id: `slotlim${n}`,
    maxclass: "newobj",
    text: `speedlim ${SLOT_INTERVAL_MS}`,
    numinlets: 2,
    numoutlets: 1,
    outlettype: [""],
    patching_rect: [450 + col * 100, 600 + row * 30, 90, 22],
  };
}

function prepend(n: number): Json {
  const { col, row } = grid(n);

  return {
    id: `slotprep${n}`,
    maxclass: "newobj",
    text: "prepend ignore",
    varname: `slotprep${n}`,
    numinlets: 1,
    numoutlets: 1,
    outlettype: [""],
    patching_rect: [450 + col * 100, 180 + row * 30, 90, 22],
  };
}

// Unmapped slots send "ignore"; everything else goes on to vst~. The wrapper
// sets each slot's prepend to its param index.
function slotRoute(): Json {
  return {
    id: SLOT_ROUTE,
    maxclass: "newobj",
    text: "route ignore",
    numinlets: 1,
    numoutlets: 2,
    outlettype: ["", ""],
    patching_rect: [450, 150, 90, 22],
  };
}

// Hidden blob parameter that saves the slot mapping with the Set
function vstslots(): Json {
  return {
    id: "vstslots",
    maxclass: "newobj",
    text: "pattr vstslots @parameter_enable 1",
    varname: "vstslots",
    numinlets: 1,
    numoutlets: 3,
    outlettype: ["", "", "bang"],
    patching_rect: [20, 320, 230, 22],
    saved_object_attributes: { parameter_enable: 1 },
    saved_attribute_attributes: {
      valueof: {
        parameter_longname: "ppal_slots",
        parameter_shortname: "ppal_slots",
        parameter_type: 3,
        parameter_invisible: 1,
      },
    },
  };
}

function grid(n: number): { col: number; row: number } {
  return { col: (n - 1) % COLUMNS, row: Math.floor((n - 1) / COLUMNS) };
}
