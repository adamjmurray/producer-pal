// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Json, type Patchline, patchCord } from "./plugin-host-patch.ts";

type Rect = [x: number, y: number, width: number, height: number];

// Keep KNOBS in step with KNOB_COUNT in wrapper.js
const KNOBS = 16;
const COLUMNS = 8;
const CELL_WIDTH = 66;
const CELL_HEIGHT = 70;
const GRID_TOP = 24;
const LABEL_HEIGHT = 13;
const KNOB_SIZE = 28;
const NAME_HEIGHT = 24; // two lines
const TAB_WIDTH = 42;
// Knobs and tabs are Live parameters set to Hidden: Live neither stores nor
// automates them, and they add no undo steps. Without parameter mode, live.tab
// shows no tabs and live.dial ignores its range.
const HIDDEN = 2;
// In the patcher, each control sits at its panel position plus this offset.
const PATCH_X = 1300;
const PATCH_Y = 20;
const PREPEND_Y = PATCH_Y + 180;
const PANEL_BOX =
  /^(pluginname|openeditor|openprep|knobpage|knobpageprep|knob(prep|label|name)?\d+)$/;

/**
 * Whether a box belongs to the device panel this module builds.
 *
 * @param id - Box id
 * @returns True for the name row, the Open button, the tabs and the knobs
 */
export function isPanelBox(id: string): boolean {
  return PANEL_BOX.test(id);
}

/**
 * The device panel: the plug-in's name, an Open button, and a page of knobs
 * that mirror the automation slots, picked by tabs.
 *
 * @param slots - Number of automation slots
 * @param nameWidth - Digits in a slot number
 * @returns The panel's boxes
 */
export function panelBoxes(slots: number, nameWidth: number): Json[] {
  const knobs = Array.from({ length: KNOBS }, (_, i) => i + 1);
  const label = (n: number): string =>
    `Auto ${String(n).padStart(nameWidth, "0")}`;

  return [
    pluginName(),
    openButton(),
    openPrepend(),
    pageTabs(slots),
    prependBox("knobpageprep", "prepend knobpage", [PATCH_X + 400, PREPEND_Y]),
    ...knobs.flatMap((i) => [
      knob(i),
      prependBox(`knobprep${i}`, `prepend knob ${i}`, [
        PATCH_X + ((i - 1) % 4) * 100,
        PREPEND_Y + 30 + Math.floor((i - 1) / 4) * 30,
      ]),
      text(`knoblabel${i}`, label(i), cellRect(i, 0, LABEL_HEIGHT)),
      text(
        `knobname${i}`,
        "—",
        cellRect(i, LABEL_HEIGHT + KNOB_SIZE, NAME_HEIGHT),
      ),
    ]),
  ];
}

/**
 * Cords from the panel's controls to the code box.
 *
 * @returns The panel's patchlines
 */
export function panelLines(): Patchline[] {
  const knobs = Array.from({ length: KNOBS }, (_, i) => i + 1);

  return [
    patchCord("openeditor", "openprep"),
    patchCord("openprep", "code"),
    patchCord("knobpage", "knobpageprep"),
    patchCord("knobpageprep", "code"),
    ...knobs.flatMap((i) => [
      patchCord(`knob${i}`, `knobprep${i}`),
      patchCord(`knobprep${i}`, "code"),
    ]),
  ];
}

function pluginName(): Json {
  return {
    ...text("pluginname", "No plug-in loaded", [4, 4, 140, 16]),
    textjustification: 0,
    fontsize: 10,
  };
}

// A button, not a Live parameter: no automation, no undo step.
function openButton(): Json {
  return {
    id: "openeditor",
    maxclass: "live.text",
    varname: "openeditor",
    mode: 0, // button; live.text defaults to a toggle
    numinlets: 1,
    numoutlets: 2,
    outlettype: ["", ""],
    parameter_enable: 0,
    ...placed([148, 4, 44, 16]),
    text: "Open",
  };
}

function openPrepend(): Json {
  return prependBox("openprep", "prepend openeditor", [PATCH_X, PREPEND_Y]);
}

// Hidden, so the page isn't saved and adds no undo step.
function pageTabs(slots: number): Json {
  const pages = Math.ceil(slots / KNOBS);
  const names = Array.from(
    { length: pages },
    (_, p) => `${p * KNOBS + 1}-${Math.min((p + 1) * KNOBS, slots)}`,
  );

  return {
    id: "knobpage",
    maxclass: "live.tab",
    varname: "knobpage",
    num_lines_patching: 1,
    num_lines_presentation: 1,
    numinlets: 1,
    numoutlets: 3,
    outlettype: ["", "", "float"],
    parameter_enable: 1,
    ...placed([
      4 + COLUMNS * CELL_WIDTH - pages * TAB_WIDTH,
      4,
      pages * TAB_WIDTH,
      16,
    ]),
    saved_attribute_attributes: {
      valueof: {
        parameter_longname: "knobpage",
        parameter_shortname: "knobpage",
        parameter_enum: names,
        parameter_mmax: pages - 1,
        parameter_type: 2,
        parameter_invisible: HIDDEN,
      },
    },
  };
}

function knob(i: number): Json {
  const { x, y } = cell(i);

  return {
    id: `knob${i}`,
    maxclass: "live.dial",
    varname: `knob${i}`,
    numinlets: 1,
    numoutlets: 2,
    outlettype: ["", "float"],
    parameter_enable: 1,
    active: 0,
    showname: 0,
    shownumber: 0,
    ...placed([
      x + (CELL_WIDTH - KNOB_SIZE) / 2,
      y + LABEL_HEIGHT,
      KNOB_SIZE,
      KNOB_SIZE,
    ]),
    saved_attribute_attributes: {
      valueof: {
        parameter_longname: `knob${i}`,
        parameter_shortname: `knob${i}`,
        parameter_mmin: 0,
        parameter_mmax: 1,
        parameter_type: 0,
        parameter_invisible: HIDDEN,
      },
    },
  };
}

function text(id: string, value: string, rect: Rect): Json {
  return {
    id,
    maxclass: "live.comment",
    varname: id,
    numinlets: 1,
    numoutlets: 0,
    fontsize: 9,
    textjustification: 1,
    ...placed(rect),
    text: value,
  };
}

function prependBox(
  id: string,
  value: string,
  at: [x: number, y: number],
): Json {
  return {
    id,
    maxclass: "newobj",
    text: value,
    numinlets: 1,
    numoutlets: 1,
    outlettype: [""],
    patching_rect: [at[0], at[1], 100, 22],
  };
}

// Shown in the panel at rect, and at the same spot (offset) in the patcher.
function placed(rect: Rect): Json {
  return {
    patching_rect: [PATCH_X + rect[0], PATCH_Y + rect[1], rect[2], rect[3]],
    presentation: 1,
    presentation_rect: rect,
  };
}

function cell(i: number): { x: number; y: number } {
  const col = (i - 1) % COLUMNS;
  const row = Math.floor((i - 1) / COLUMNS);

  return { x: 4 + col * CELL_WIDTH, y: GRID_TOP + row * CELL_HEIGHT };
}

function cellRect(i: number, top: number, height: number): Rect {
  const { x, y } = cell(i);

  return [x, y + top, CELL_WIDTH, height];
}
