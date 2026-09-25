// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Plug-ins and Max for Live devices. The Live API can't insert either, so the
// Producer Pal remote script loads each one from Live's browser onto a temp
// track, and it moves from there to the path the call named.

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { loopBudgetMs } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  type BrowserItem,
  type BrowserItemLoad,
  type BrowserItemResolution,
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { moveDeviceIntoContainer } from "#src/tools/device/update/helpers/move-device.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  type CreateDeviceResult,
  type CreationTarget,
  createdDeviceEntry,
  insertionPosition,
  insertRefusal,
  resolveCreationTarget,
} from "./device-creation.ts";

/** How often, and how many times, to look for the loaded device. */
const ARRIVAL_POLL = { pollingInterval: 50, maxRetries: 40 };

/** The longest the arrival poll runs. */
const ARRIVAL_WAIT_MS = ARRIVAL_POLL.pollingInterval * ARRIVAL_POLL.maxRetries;

/** The request's time limits, from ToolContext. */
export type RequestTiming = Pick<
  Partial<ToolContext>,
  "deadline" | "timeoutMs"
>;

/**
 * Load one device and move it to a path. The path resolves first, so it fails
 * the way a native insert does, and a `c+` makes its chain once.
 * @param item - What to load
 * @param deviceName - The device as the call named it
 * @param path - Where it goes
 * @param timing - The request's time limits
 * @returns The device and its result entry
 */
export async function createBrowserDevice(
  item: BrowserItem,
  deviceName: string,
  path: string,
  timing: RequestTiming = {},
): Promise<{ device: LiveAPI; entry: CreateDeviceResult }> {
  const target = resolveCreationTarget(path);
  const waitMs = remoteScriptWait(timing.deadline, ARRIVAL_WAIT_MS);

  if (waitMs == null) {
    throw new Error(
      `could not load "${deviceName}": ${outOfTime(timing.timeoutMs)}`,
    );
  }

  return await withTempTrack(deviceName, async (track) => {
    const device = await loadOnto(track, item, deviceName, waitMs);

    moveIntoPlace(device, target, deviceName, path);

    return { device, entry: createdDeviceEntry(device.id, device, target) };
  });
}

/**
 * Find a device name in Live's browser.
 * @param deviceName - The name the call used
 * @param deadline - The request deadline from ToolContext
 * @returns The item, or null when the remote script isn't answering
 * @throws Error when nothing, or more than one thing, goes by that name
 */
export async function resolveBrowserDevice(
  deviceName: string,
  deadline?: number | null,
): Promise<BrowserItem | null> {
  const lookUpFailed = (why: string): Error =>
    new Error(`could not look up "${deviceName}" in Live's browser: ${why}`);
  const waitMs = remoteScriptWait(deadline);

  // Every lookup runs before any device is made, so nothing was created yet.
  if (waitMs == null) {
    throw lookUpFailed("the request ran out of time; nothing was created");
  }

  const response = await requestNode<BrowserItemResolution>(
    REMOTE_SCRIPT_ROUTES.resolve,
    { name: deviceName },
    waitMs,
  );

  if (!response.success || response.result == null) {
    throw lookUpFailed(response.error ?? "no answer");
  }

  const resolution = response.result;

  if (!resolution.available) {
    return null;
  }

  if ("error" in resolution) {
    throw new Error(resolution.error);
  }

  return resolution.item;
}

/**
 * How long V8 waits on a remote-script route: its usual wait, cut to what is
 * left of the request's time. V8 must answer before Node's tool timeout, or it
 * goes on creating devices the caller was told timed out, and a retry
 * duplicates them.
 * @param deadline - The request deadline, or null for none
 * @param reserveMs - Time to keep for work after the route answers
 * @returns The wait, or null when there's no time left to start
 */
export function remoteScriptWait(
  deadline: number | null | undefined,
  reserveMs = 0,
): number | null {
  if (deadline == null) {
    return REMOTE_SCRIPT_REQUEST_TIMEOUT_MS;
  }

  const left = deadline - Date.now() - reserveMs;

  return left > 0 ? Math.min(REMOTE_SCRIPT_REQUEST_TIMEOUT_MS, left) : null;
}

// --- Helpers below main exports ---

/**
 * Why a load didn't start for lack of time. When the whole budget can't cover
 * the arrival poll, a re-run fails the same way, so the Timeout must go up.
 * @param timeoutMs - The request timeout, when known
 * @returns The reason, worded for the model
 */
function outOfTime(timeoutMs: number | undefined): string {
  return timeoutMs != null && loopBudgetMs(timeoutMs) <= ARRIVAL_WAIT_MS
    ? `the Timeout setting (${timeoutMs / 1000}s) is too short to load it; ask the user to raise it`
    : "the request ran out of time; re-run for this path";
}

/**
 * Run `body` with a temp MIDI track at the end of the regular tracks, then
 * delete it and put the track selection back, however `body` ends. MIDI,
 * because Live refuses an instrument on an audio track; effects go on either.
 * The end, so no path the call named shifts.
 * @param deviceName - The device as the call named it, for the error
 * @param body - Runs while the temp track exists
 * @returns Whatever body returns
 */
async function withTempTrack<T>(
  deviceName: string,
  body: (track: LiveAPI) => Promise<T>,
): Promise<T> {
  const liveSet = LiveAPI.from(livePath.liveSet);
  // The remote script selects the track it loads onto.
  const selectedTrackId = LiveAPI.from(livePath.view.selectedTrack).id;
  const track = LiveAPI.from(
    liveSet.call("create_midi_track", -1) as [string, string | number],
  );

  if (!track.exists()) {
    throw new Error(`could not load "${deviceName}": Live made no track`);
  }

  try {
    return await body(track);
  } finally {
    // Read now, not at creation: another request may have added or removed a
    // track while this one waited.
    const index = track.trackIndex;

    if (index != null) {
      liveSet.call("delete_track", index);
    }

    if (selectedTrackId !== "0") {
      LiveAPI.from(livePath.view.song).setProperty(
        "selected_track",
        toLiveApiId(selectedTrackId),
      );
    }
  }
}

/**
 * Load an item onto a track and find the device it made. Live may already have
 * put devices on the track from the user's default track preset, so the new
 * device is the id that wasn't there before.
 * @param track - The temp track
 * @param item - What to load
 * @param deviceName - The device as the call named it
 * @param waitMs - How long to wait for the remote script
 * @returns The loaded device
 */
async function loadOnto(
  track: LiveAPI,
  item: BrowserItem,
  deviceName: string,
  waitMs: number,
): Promise<LiveAPI> {
  const before = new Set(track.getChildIds("devices"));
  // The remote script finds the track by this name, not the index: tracks can
  // shift before it runs, and a late load must not land on a user's track.
  const trackName = `Producer Pal temp ${Math.random().toString(36).slice(2)}`;

  track.set("name", trackName);

  const started = Date.now();
  const response = await requestNode<BrowserItemLoad>(
    REMOTE_SCRIPT_ROUTES.load,
    {
      type: item.type,
      path: item.path,
      trackIndex: track.trackIndex,
      trackName,
    },
    waitMs,
  );
  // When V8 stops waiting, the temp track is deleted, and a load that runs
  // later can't find it by name, so nothing reaches the path.
  const gaveUp = Date.now() - started >= waitMs;
  const failure = !response.success
    ? `${response.error ?? "no answer"}${gaveUp ? "; nothing was added at this path, re-run for it" : ""}`
    : response.result == null
      ? "the remote script returned nothing"
      : !response.result.available
        ? "Live's browser stopped answering"
        : response.result.error;

  if (failure != null) {
    throw new Error(`could not load "${deviceName}": ${failure}`);
  }

  const loadedId = (): string | undefined =>
    track.getChildIds("devices").find((id) => !before.has(id));

  if (!(await waitUntil(() => loadedId() != null, ARRIVAL_POLL))) {
    throw new Error(`could not load "${deviceName}": it never arrived`);
  }

  return LiveAPI.from(loadedId() as string);
}

/**
 * Move a loaded device to where the call named, with a native insert's
 * semantics: past the end appends and warns.
 * @param device - The loaded device, still on the temp track
 * @param target - Where it goes
 * @param deviceName - The device as the call named it
 * @param path - The path as the call wrote it
 */
function moveIntoPlace(
  device: LiveAPI,
  target: CreationTarget,
  deviceName: string,
  path: string,
): void {
  const { position } = insertionPosition(target, path, deviceName);
  // No source chain: the device comes off a temp track, so there is no chain
  // mixer to carry or leave behind.
  const move = moveDeviceIntoContainer(
    device,
    { container: target.container, position },
    null,
    path,
  );

  // The container was resolved before the load, and a held object never reads
  // as gone, so anything but "moved" is Live turning the move down.
  if (move.outcome !== "moved") {
    throw new Error(
      insertRefusal(deviceName, target.position, path, move.reason),
    );
  }
}
