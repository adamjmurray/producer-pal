// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  FLOAT_RANGE,
  type Json,
  type Patchline,
  patchCord,
} from "./plugin-host-patch.ts";

type Rect = [x: number, y: number, width: number, height: number];

// Keep KNOBS in step with KNOB_COUNT in wrapper.js
const KNOBS = 16;
const COLUMNS = 8;

// Keep NAME_LINE_PT in wrapper.js in step with the cell width
export const CELL_WIDTH = 64;
const CELL_HEIGHT = 68;
const GRID_TOP = 30;
const LABEL_HEIGHT = 13;
const KNOB_TOP = LABEL_HEIGHT + 2;
const KNOB_SIZE = 28;
const NAME_HEIGHT = 13;
const OPEN_WIDTH = 72;
const MENU_WIDTH = 120;
const TOP_HEIGHT = 16;
const MARGIN = 4;
const PANEL_RIGHT = MARGIN + COLUMNS * CELL_WIDTH;
const MENU_LEFT = PANEL_RIGHT - MENU_WIDTH;
// Knobs and tabs are Live parameters set to Hidden: Live neither stores nor
// automates them, and they add no undo steps. Without parameter mode, live.tab
// shows no tabs and live.dial ignores its range.
const HIDDEN = 2;
// In the patcher, each control sits at its panel position plus this offset.
const PATCH_X = 1300;
const PATCH_Y = 20;
const PREPEND_Y = PATCH_Y + 180;
const OPEN_HELP = "Opens the plug-in's own window.";
const PAGE_TITLE = "Knob Page";
const PAGE_HELP = "Picks which parameters the knobs show.";

const KNOB_TITLE = "Automation Slot";

// Keep the knob help in wrapper.js in step: it rewrites this text as slots are
// mapped and unmapped.
export const KNOB_HELP =
  "Shows and sets the plug-in parameter this slot automates. Inactive until Producer Pal assigns a parameter to the slot.";
const PANEL_BOX =
  /^(pluginname|openeditor|openprep|knobpage|knobpageprep|knob(prep|label|name|help)?\d+)$/;

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
 * The device panel: an Open button, a page menu, the plug-in's name (shown by
 * the wrapper only when it differs from the device's), and a page of knobs
 * that mirror the automation slots.
 *
 * @param pages - The page menu's items
 * @param nameWidth - Digits in a slot number
 * @returns The panel's boxes
 */
export function panelBoxes(pages: string[], nameWidth: number): Json[] {
  const knobs = Array.from({ length: KNOBS }, (_, i) => i + 1);
  const label = (n: number): string =>
    `Slot ${String(n).padStart(nameWidth, "0")}`;

  return [
    pluginName(),
    openButton(),
    openPrepend(),
    pageMenu(pages),
    prependBox("knobpageprep", "prepend knobpage", [PATCH_X + 400, PREPEND_Y]),
    ...knobs.flatMap((i) => [
      knob(i),
      prependBox(`knobprep${i}`, `prepend knob ${i}`, [
        PATCH_X + ((i - 1) % 4) * 100,
        PREPEND_Y + 30 + Math.floor((i - 1) / 4) * 30,
      ]),
      text(`knoblabel${i}`, label(i), cellRect(i, 0, LABEL_HEIGHT)),
      text(`knobname${i}`, "—", cellRect(i, KNOB_TOP + KNOB_SIZE, NAME_HEIGHT)),
      knobHelp(i),
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

// Between the button and the menu. The wrapper hides it while the device is
// named after the plug-in.
function pluginName(): Json {
  const left = MARGIN + OPEN_WIDTH + MARGIN;
  const right = MENU_LEFT - MARGIN;

  return {
    ...text("pluginname", "No plug-in loaded", [
      left,
      MARGIN,
      right - left,
      TOP_HEIGHT,
    ]),
    ...help(
      "Plug-in",
      "The plug-in loaded in this device. Hidden while the device is named after it.",
    ),
    textjustification: 0,
    fontsize: 10,
  };
}

// What Live's Info View shows for a control. Max keeps it as annotation_name
// and annotation on the box, and for a parameter-enabled box also in its
// valueof block as parameter_annotation_name and parameter_info.
function help(title: string, info: string): Json {
  return { annotation_name: title, annotation: info };
}

function parameterHelp(title: string, info: string): Json {
  return { parameter_annotation_name: title, parameter_info: info };
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
    ...placed([MARGIN, MARGIN, OPEN_WIDTH, TOP_HEIGHT]),
    ...help("Open Plug-in", OPEN_HELP),
    text: "Open Plug-in",
  };
}

function openPrepend(): Json {
  return prependBox("openprep", "prepend openeditor", [PATCH_X, PREPEND_Y]);
}

// A menu, not tabs: a plug-in can have dozens of pages. Hidden, so the page
// isn't saved and adds no undo step.
function pageMenu(pages: string[]): Json {
  return {
    id: "knobpage",
    maxclass: "live.menu",
    varname: "knobpage",
    numinlets: 1,
    numoutlets: 3,
    outlettype: ["", "", "float"],
    parameter_enable: 1,
    ...placed([MENU_LEFT, MARGIN, MENU_WIDTH, TOP_HEIGHT]),
    ...help(PAGE_TITLE, PAGE_HELP),
    saved_attribute_attributes: {
      valueof: {
        ...parameterHelp(PAGE_TITLE, PAGE_HELP),
        parameter_longname: "knobpage",
        parameter_shortname: "knobpage",
        parameter_enum: pages,
        parameter_mmax: pages.length - 1,
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
      y + KNOB_TOP,
      KNOB_SIZE,
      KNOB_SIZE,
    ]),
    ...help(KNOB_TITLE, KNOB_HELP),
    saved_attribute_attributes: {
      valueof: {
        ...parameterHelp(KNOB_TITLE, KNOB_HELP),
        parameter_longname: `knob${i}`,
        parameter_shortname: `knob${i}`,
        ...FLOAT_RANGE,
        parameter_invisible: HIDDEN,
      },
    },
  };
}

// An invisible box behind a knob's whole cell, with the knob's Info View text.
// It gets the hover over the labels, and over an unmapped knob, which ignores
// the mouse. A ubutton, because a transparent panel shows no Info View text.
function knobHelp(i: number): Json {
  return {
    id: `knobhelp${i}`,
    maxclass: "ubutton",
    varname: `knobhelp${i}`,
    numinlets: 1,
    numoutlets: 4,
    outlettype: ["bang", "bang", "", "int"],
    hltcolor: [0, 0, 0, 0],
    ...placed(cellRect(i, 0, KNOB_TOP + KNOB_SIZE + NAME_HEIGHT)),
    ...help(KNOB_TITLE, KNOB_HELP),
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

  return { x: MARGIN + col * CELL_WIDTH, y: GRID_TOP + row * CELL_HEIGHT };
}

function cellRect(i: number, top: number, height: number): Rect {
  const { x, y } = cell(i);

  return [x, y + top, CELL_WIDTH, height];
}
