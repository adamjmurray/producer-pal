// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

const SLOTS = 128;
// Keep in step with NAME_WIDTH in wrapper.js
const NAME_WIDTH = Math.max(2, String(SLOTS).length);
const COLUMNS = 8;
const HEADER_SIZE = 32;
const SLOT_BOX = /^slot(dial|prep)\d+$/;

type Json = Record<string, unknown>;

interface Box {
  box: Json;
}

interface Patchline {
  patchline: { source: [string, number]; destination: [string, number] };
}

interface Patcher {
  patcher: {
    boxes: Box[];
    lines: Patchline[];
    parameters?: unknown;
  };
}

// Node has these (JSON.parse source text access); TypeScript's lib doesn't yet.
const RawJson = JSON as unknown as {
  parse: (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source: string },
    ) => unknown,
  ) => unknown;
  rawJSON: (text: string) => unknown;
};

/**
 * Rebuild one plug-in host .amxd: put the wrapper code into its v8.codebox and
 * replace the automation-slot dials, their prepends and cords, the vstslots
 * pattr and the slot list. Never touches the patcher's "project" block (one
 * missing fields crashes Live). Running it twice gives the same bytes.
 *
 * @param amxd - The device file
 * @param wrapperCode - wrapper.js source; its SLOT_COUNT is set to SLOTS
 * @returns The rebuilt device file
 */
export function buildPluginHostDevice(
  amxd: Buffer,
  wrapperCode: string,
): Buffer {
  const code = setSlotCount(wrapperCode);
  const json = readPatcher(amxd);
  const p = json.patcher;
  const boxes = p.boxes.filter((b) => !isOurs(b.box.id));

  for (const b of boxes) {
    if (b.box.maxclass === "v8.codebox") {
      b.box.code = code;
    }
  }

  p.boxes = [...boxes, ...ownedBoxes().map((box) => ({ box }))];
  p.lines = [...p.lines.filter((l) => !touchesOurs(l)), ...ownedLines()];
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

function setSlotCount(code: string): string {
  const pattern = /const SLOT_COUNT = \d+;/g;

  if (code.match(pattern)?.length !== 1) {
    throw new Error("wrapper.js needs one 'const SLOT_COUNT = <n>;' line");
  }

  return code.replaceAll(pattern, `const SLOT_COUNT = ${SLOTS};`);
}

// Includes dials and prepends left by a build with more slots.
function isOurs(id: unknown): boolean {
  return (
    typeof id === "string" &&
    (id === "vstslots" || id === "slotlist" || SLOT_BOX.test(id))
  );
}

function touchesOurs(line: Patchline): boolean {
  const { source, destination } = line.patchline;

  return isOurs(source[0]) || isOurs(destination[0]);
}

function ownedBoxes(): Json[] {
  const slots = Array.from({ length: SLOTS }, (_, i) => i + 1);

  return [...slots.map(dial), ...slots.map(prepend), vstslots(), slotlist()];
}

function ownedLines(): Patchline[] {
  return Array.from({ length: SLOTS }, (_, i) => [
    cord(`slotdial${i + 1}`, `slotprep${i + 1}`),
    cord(`slotprep${i + 1}`, "code"),
  ]).flat();
}

function cord(from: string, to: string): Patchline {
  return { patchline: { source: [from, 0], destination: [to, 0] } };
}

// Names are zero-padded so Live sorts them.
function dial(n: number): Json {
  const name = `Automation ${String(n).padStart(NAME_WIDTH, "0")}`;
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
        parameter_type: 0,
        parameter_mmin: RawJson.rawJSON("0.0"),
        parameter_mmax: RawJson.rawJSON("1.0"),
        parameter_unitstyle: 1,
      },
    },
  };
}

function prepend(n: number): Json {
  const { col, row } = grid(n);

  return {
    id: `slotprep${n}`,
    maxclass: "newobj",
    text: `prepend slot ${n}`,
    numinlets: 1,
    numoutlets: 1,
    outlettype: [""],
    patching_rect: [450 + col * 100, 180 + row * 30, 90, 22],
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

function slotlist(): Json {
  return {
    id: "slotlist",
    maxclass: "live.comment",
    varname: "slotlist",
    numinlets: 1,
    numoutlets: 0,
    patching_rect: [300, 140, 300, 40],
    presentation: 1,
    presentation_rect: [4, 48, 220, 117],
    text: "No automation slots mapped",
  };
}

function grid(n: number): { col: number; row: number } {
  return { col: (n - 1) % COLUMNS, row: Math.floor((n - 1) / COLUMNS) };
}
