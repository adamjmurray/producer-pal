// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Atomic step in a computer-use runbook. Mirrors mcp__computer-use__* tool
 * names so the caller can dispatch them with no translation. Includes the
 * mouse-down/mouse-up primitives used for the drag-and-drop pickup pattern.
 */
export type RunbookStep =
  | { action: "key"; text: string; label: string }
  | { action: "wait"; duration: number; label: string }
  | { action: "left_click"; coordinate: [number, number]; label: string }
  | { action: "left_mouse_down"; label: string }
  | { action: "left_mouse_up"; label: string }
  | { action: "mouse_move"; coordinate: [number, number]; label: string }
  | { action: "type"; text: string; label: string }
  | { action: "screenshot"; label: string };

/**
 * Live's browser pane pixel anchors. Captured during the Welle-3 recon pass
 * on 2026-05-20. The browser layout is locale-agnostic - DE and EN ship the
 * same pixel grid because Live aligns by fixed positions.
 */
export const BROWSER_ANCHORS = {
  // The Max-for-Live category label in the left browser pane. Captured with
  // browser scrolled to top - if the caller has scrolled the category list,
  // failMode 2 applies.
  maxForLiveCategory: [58, 298] as [number, number],
  // The User Library top-level entry sits below the device-category cluster.
  userLibraryCategory: [58, 230] as [number, number],
  // First device row inside a selected category - the drag pickup point.
  firstDeviceRow: [200, 183] as [number, number],
  // Browser search-field activation focus point (used after cmd+f).
  searchField: [200, 93] as [number, number],
  // Default drop target: first regular track header. Set-dependent; callers
  // override via dropX/dropY when this default misses.
  defaultDropTarget: [415, 400] as [number, number],
  // Intermediate hover point en route to the drop target. Helps Live register
  // the drop as a real drag rather than a click (Playbook §2 settle pattern).
  intermediateHover: [300, 300] as [number, number],
} as const;

interface LoadOptions {
  deviceName: string;
  category: "max-audio-effect" | "max-instrument" | "max-midi-effect" | "user";
  dropX?: number;
  dropY?: number;
  useArrangementView?: boolean;
}

/**
 * Build the M4L-device-load runbook step list. Mutates `steps` in place.
 * Implements the Browser→Track drag pattern from
 * ABLETON-COMPUTER-USE-PLAYBOOK.md §2: mouse-down + 0.55 s wait + multi-step
 * mouse-move + 0.35 s wait + mouse-up, plus the closing Escape that clears
 * the browser search overlay.
 * @param steps - Step array being built.
 * @param opts - Load options.
 */
export function appendLoadM4lDeviceSteps(
  steps: RunbookStep[],
  opts: LoadOptions,
): void {
  // We do NOT auto-press Tab. Tab toggles Session<->Arrangement, so a
  // recipe-emitted Tab would silently flip the view if Live were already in
  // Arrangement. Instead we emit a verify-screenshot anchor when the caller
  // expressed a view preference; the caller dispatches Tab themselves after
  // checking the screenshot.
  if (opts.useArrangementView) {
    steps.push({
      action: "screenshot",
      label: "anchor: caller must verify Arrangement view before drop",
    });
  }

  appendCategoryClick(steps, opts.category);

  steps.push({
    action: "wait",
    duration: 0.3,
    label: "settle category click",
  });
  steps.push({
    action: "screenshot",
    label: "anchor: browser shows category contents",
  });

  appendSearchSteps(steps, opts.deviceName);
  appendDragDrop(steps, opts);

  // NO automatic Escape after the drop. Fail-Mode 5 warns that a .amxd
  // compile modal may appear post-drop; an auto-Escape would dismiss it
  // against the recipe's own advice. The caller dispatches Escape after
  // verifying the post-drop screenshot showed no modal.
  steps.push({
    action: "screenshot",
    label:
      "anchor: caller must verify no .amxd compile modal before dispatching Escape to clear search overlay",
  });
}

/**
 * Push a click on the category entry the caller selected. `user` targets the
 * top-level User Library row; the three Max-for-Live sub-categories all live
 * under the same category label and the device-name search disambiguates.
 * @param steps - Step array being built.
 * @param category - Category enum value.
 */
function appendCategoryClick(
  steps: RunbookStep[],
  category: LoadOptions["category"],
): void {
  if (category === "user") {
    steps.push({
      action: "left_click",
      coordinate: BROWSER_ANCHORS.userLibraryCategory,
      label: "click User Library category",
    });

    return;
  }

  steps.push({
    action: "left_click",
    coordinate: BROWSER_ANCHORS.maxForLiveCategory,
    label: `click Max for Live category (filter ${category})`,
  });
}

/**
 * Push the cmd+f search activation + device-name type + settle pattern.
 * @param steps - Step array being built.
 * @param deviceName - Exact device name as listed in the browser.
 */
function appendSearchSteps(steps: RunbookStep[], deviceName: string): void {
  steps.push({
    action: "key",
    text: "cmd+f",
    label: "open browser search",
  });
  steps.push({
    action: "type",
    text: deviceName,
    label: `filter by name '${deviceName}'`,
  });
  steps.push({
    action: "wait",
    duration: 0.3,
    label: "settle filter",
  });
  steps.push({
    action: "screenshot",
    label: "anchor: first match should highlight",
  });
}

/**
 * Push the drag-and-drop sequence following Playbook §2 settle timing.
 * Browser drop is fragile - left_click_drag would race past the timing window
 * so we use explicit down/wait/move/wait/up primitives.
 * @param steps - Step array being built.
 * @param opts - Load options (drop target + intermediate stops).
 */
function appendDragDrop(steps: RunbookStep[], opts: LoadOptions): void {
  // dropX/dropY must be set as a pair. A half-override (only one axis) would
  // mix a new value with the set-dependent default on the other axis and
  // silently land the drop on the wrong track. Reject the half-override so
  // the caller catches the mistake at call time.
  const hasX = opts.dropX != null;
  const hasY = opts.dropY != null;

  if (hasX !== hasY) {
    throw new Error(
      "ppal-load-m4l-device: dropX and dropY must be supplied as a pair (got dropX=" +
        String(opts.dropX) +
        ", dropY=" +
        String(opts.dropY) +
        ")",
    );
  }

  const drop: [number, number] =
    hasX && hasY
      ? [opts.dropX as number, opts.dropY as number]
      : [
          BROWSER_ANCHORS.defaultDropTarget[0],
          BROWSER_ANCHORS.defaultDropTarget[1],
        ];

  steps.push({
    action: "mouse_move",
    coordinate: BROWSER_ANCHORS.firstDeviceRow,
    label: "hover first device row",
  });
  steps.push({
    action: "left_mouse_down",
    label: "begin drag pickup",
  });
  steps.push({
    action: "wait",
    duration: 0.55,
    label: "settle drag pickup (Playbook §2)",
  });
  steps.push({
    action: "mouse_move",
    coordinate: BROWSER_ANCHORS.intermediateHover,
    label: "drag via intermediate hover",
  });
  steps.push({
    action: "mouse_move",
    coordinate: drop,
    label: `drag to drop target [${drop[0]}, ${drop[1]}]`,
  });
  steps.push({
    action: "wait",
    duration: 0.35,
    label: "settle drop target",
  });
  steps.push({
    action: "left_mouse_up",
    label: "release drop",
  });
  steps.push({
    action: "wait",
    duration: 0.5,
    label: "settle drop, give Live time to instantiate",
  });
  steps.push({
    action: "screenshot",
    label: "anchor: device should now exist on target track",
  });
}
