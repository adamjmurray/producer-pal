// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Plug-ins and Max for Live devices. The Live API can't insert either, so the
// Producer Pal remote script loads each one from Live's browser onto a temp
// track, and it moves from there to the path the call named.

import {
  type NodeResponse,
  requestNode,
} from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { loopBudgetMs } from "#src/tools/clip/helpers/loop-deadline.ts";
import {
  type BrowserItem,
  type BrowserItemLoad,
  type BrowserItemResolution,
  REMOTE_SCRIPT_EXPIRY_MARGIN_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type RemoteScriptUnavailable,
  whyUnavailable,
} from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { errorWithChainsLeft } from "#src/tools/shared/device/helpers/path/chains-left.ts";
import { moveDeviceIntoContainer } from "#src/tools/device/update/helpers/move-device.ts";
import {
  remoteScriptExpiry,
  remoteScriptWait,
} from "#src/tools/shared/remote-script/remote-script-wait.ts";
import {
  appendDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  REQUEST_OUT_OF_TIME,
  unreachedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type CreatedDevice,
  type CreationTarget,
  createdDeviceEntry,
  insertionPosition,
  insertRefusal,
  resolveCreationTarget,
  writtenContainer,
} from "./device-creation.ts";
import {
  browserItemKind,
  loadedDeviceKind,
  misfitReason,
  trackMisfitReason,
} from "#src/tools/shared/device/helpers/path/device-fit.ts";

/**
 * Why a browser search stopped: it used up its share of the request's time. A
 * re-run is quicker, since Live keeps what it scanned, so only a repeat points
 * at the Timeout setting.
 * @param nothingDone - What is still undone, e.g. "nothing was created"
 * @returns The reason, worded for the model
 */
export function lookupOutOfTime(nothingDone: string): string {
  return `${REQUEST_OUT_OF_TIME} searching Live's browser; ${nothingDone}, re-run it. If it keeps happening, ask the user to raise the Timeout setting`;
}

/** How often, and how many times, to look for the loaded device. */
const ARRIVAL_POLL = { pollingInterval: 50, maxRetries: 40 };

/** The longest the arrival poll runs. */
const ARRIVAL_WAIT_MS = ARRIVAL_POLL.pollingInterval * ARRIVAL_POLL.maxRetries;

/**
 * The least a load is worth starting with: the expiry margin, then a quick
 * load. With less, Live can't start it in time and finish it.
 */
const MIN_LOAD_WAIT_MS = 2 * REMOTE_SCRIPT_EXPIRY_MARGIN_MS;

/** Why a load that timed out leaves nothing at the path, though Live may have made it. */
const LOAD_STRANDED =
  "Live may still have loaded it, but onto the temp track, which is removed; nothing was added at this path, re-run for it";

/** The request's time limits, from ToolContext. */
export type RequestTiming = Pick<
  Partial<ToolContext>,
  "deadline" | "timeoutMs"
>;

/** What a browser load needs besides the device. */
export interface BrowserLoadOptions extends RequestTiming {
  /**
   * Called once the device is in place, before the temp track is cleaned up.
   * A throw from it leaves the device in the Set.
   */
  onPlaced?: (created: CreatedDevice) => void;
}

/**
 * Load one device and move it to a path. The path resolves first, so it fails
 * the way a native insert does, and a `c+` makes its chain once.
 * @param item - What to load
 * @param deviceName - The device as the call named it
 * @param path - Where it goes
 * @param options - The request's time limits, and what to tell on arrival
 * @returns The device, its result entry and how its container was spelled
 */
export async function createBrowserDevice(
  item: BrowserItem,
  deviceName: string,
  path: string,
  options: BrowserLoadOptions = {},
): Promise<CreatedDevice> {
  const target = resolveCreationTarget(path);
  const arrival = { placed: false };

  try {
    refuseKnownMisfit(item, deviceName, target);

    return await loadAndMove(item, deviceName, target, path, {
      ...options,
      onPlaced: (created) => {
        arrival.placed = true;
        options.onPlaced?.(created);
      },
    });
  } catch (error) {
    // The chains the path made stay in the Set whether or not the load does.
    // Once the device sits in one, they aren't empty.
    throw arrival.placed
      ? error
      : errorWithChainsLeft(error, target.madeChains);
  }
}

/**
 * Find a device name in Live's browser.
 * @param deviceName - The name the call used
 * @param deadline - The request deadline from ToolContext
 * @returns The item, or `available: false` when the remote script isn't
 *   answering (`outdated` when it is too old)
 * @throws Error when nothing, or more than one thing, goes by that name
 */
export async function resolveBrowserDevice(
  deviceName: string,
  deadline?: number | null,
): Promise<BrowserItem | RemoteScriptUnavailable> {
  const lookUpFailed = (why: string): Error =>
    new Error(`could not look up "${deviceName}" in Live's browser: ${why}`);
  const waitMs = remoteScriptWait(deadline);

  // Every lookup runs before any device is made, so nothing was created yet.
  if (waitMs == null) {
    throw lookUpFailed(`${REQUEST_OUT_OF_TIME}; nothing was created`);
  }

  const started = Date.now();
  const response = await requestNode<BrowserItemResolution>(
    REMOTE_SCRIPT_ROUTES.resolve,
    { name: deviceName, expiresInMs: remoteScriptExpiry(waitMs) },
    waitMs,
  );

  // Whoever ran out of time, nothing was created yet.
  if (!response.success && Date.now() - started >= waitMs) {
    throw lookUpFailed(lookupOutOfTime("nothing was created"));
  }

  if (!response.success || response.result == null) {
    throw lookUpFailed(response.error ?? "no answer");
  }

  const resolution = response.result;

  if (!resolution.available) {
    return resolution;
  }

  if ("error" in resolution) {
    throw "outOfTime" in resolution
      ? lookUpFailed(lookupOutOfTime("nothing was created"))
      : new Error(resolution.error);
  }

  return resolution.item;
}

// --- Helpers below main exports ---

// Load the item onto a temp track, then move it to the resolved target.
async function loadAndMove(
  item: BrowserItem,
  deviceName: string,
  target: CreationTarget,
  path: string,
  options: BrowserLoadOptions,
): Promise<CreatedDevice> {
  // Checked before the track exists, so a doomed load makes nothing.
  loadWait(deviceName, options);

  let leftover: string | undefined;

  const created = await withTempTrack(
    deviceName,
    async (track) => {
      const device = await loadOnto(track, item, deviceName, options);

      moveIntoPlace(device, target, deviceName, path);

      const placed: CreatedDevice = {
        device,
        entry: createdDeviceEntry(device.id, device, target),
        written: writtenContainer(target),
      };

      options.onPlaced?.(placed);

      return placed;
    },
    (note) => {
      leftover = note;
    },
  );

  // The device is in place, so a temp track that won't go is on its entry.
  if (leftover != null) {
    appendDetail(created.entry, `the device was created, but ${leftover}`);
  }

  return created;
}

/**
 * How long a load may wait for the remote script. A load that can't start and
 * finish inside the deadline doesn't start: V8 would give up on it with Live
 * still loading.
 * @param deviceName - The device as the call named it
 * @param timing - The request's time limits
 * @returns The wait, in ms
 * @throws Error when there isn't time to load; nothing was loaded
 */
function loadWait(deviceName: string, timing: RequestTiming): number {
  const waitMs = remoteScriptWait(timing.deadline, ARRIVAL_WAIT_MS);

  if (waitMs == null || waitMs < MIN_LOAD_WAIT_MS) {
    throw new Error(
      `could not load "${deviceName}": ${outOfTime(timing.timeoutMs)}`,
    );
  }

  return waitMs;
}

/**
 * Why a load didn't start for lack of time. When the whole budget can't cover
 * the arrival poll, a re-run fails the same way, so the Timeout must go up.
 * @param timeoutMs - The request timeout, when known
 * @returns The reason, worded for the model
 */
function outOfTime(timeoutMs: number | undefined): string {
  return timeoutMs != null &&
    loopBudgetMs(timeoutMs) < ARRIVAL_WAIT_MS + MIN_LOAD_WAIT_MS
    ? `the Timeout setting (${timeoutMs / 1000}s) is too short to load it; ask the user to raise it`
    : unreachedDetail("path");
}

/**
 * Run `body` with a temp MIDI track at the end of the regular tracks, then
 * delete it and put the track selection back, however `body` ends. MIDI,
 * because Live refuses an instrument on an audio track; effects go on either.
 * The end, so no path the call named shifts.
 *
 * A temp track that can't be deleted is left behind, and said so: after `body`
 * threw, in its error; after it returned, to `leftBehind`, since what `body`
 * made is already in the Set. A selection that won't go back is dropped: it is
 * only what the user had highlighted, and the model can't act on it.
 * @param deviceName - The device as the call named it, for the error
 * @param body - Runs while the temp track exists
 * @param leftBehind - Told when the temp track couldn't be deleted after `body`
 *   succeeded
 * @returns Whatever body returns
 * @throws Error when no temp track can be made, or `body` throws
 */
async function withTempTrack<T>(
  deviceName: string,
  body: (track: LiveAPI) => Promise<T>,
  leftBehind: (note: string) => void,
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

  let result: T | undefined;
  let failure: unknown;

  try {
    result = await body(track);
  } catch (error) {
    failure = error;
  }

  const leftover = deleteTempTrack(liveSet, track);

  restoreSelection(selectedTrackId);

  if (failure != null) {
    throw leftover == null && failure instanceof Error
      ? failure
      : new Error(joinDetails([errorMessage(failure), leftover]), {
          cause: failure,
        });
  }

  if (leftover != null) {
    leftBehind(leftover);
  }

  return result as T;
}

/**
 * Delete the temp track.
 * @param liveSet - The Live Set
 * @param track - The temp track
 * @returns What to say when it couldn't be deleted, or undefined when it was
 */
function deleteTempTrack(liveSet: LiveAPI, track: LiveAPI): string | undefined {
  // Read now, not at creation: another request may have added or removed a
  // track while this one waited.
  const index = track.trackIndex;

  if (index == null) {
    return undefined;
  }

  try {
    liveSet.call("delete_track", index);

    return undefined;
  } catch (error) {
    return `the temporary track at ${formatObjectPath({ kind: "track", trackIndex: index })} couldn't be deleted: ${errorMessage(error)}`;
  }
}

/**
 * Put the track selection back, if it can be.
 * @param selectedTrackId - The track that was selected, or "0" for none
 */
function restoreSelection(selectedTrackId: string): void {
  if (selectedTrackId === "0") {
    return;
  }

  try {
    LiveAPI.from(livePath.view.song).setProperty(
      "selected_track",
      toLiveApiId(selectedTrackId),
    );
  } catch {
    // Only the user's highlight, and nothing the model can do about it.
  }
}

/**
 * Load an item onto a track and find the device it made. Live may already have
 * put devices on the track from the user's default track preset, so the new
 * device is the id that wasn't there before.
 * @param track - The temp track
 * @param item - What to load
 * @param deviceName - The device as the call named it
 * @param timing - The request's time limits
 * @returns The loaded device
 * @throws Error when making the track used up the time; nothing was loaded
 */
async function loadOnto(
  track: LiveAPI,
  item: BrowserItem,
  deviceName: string,
  timing: RequestTiming,
): Promise<LiveAPI> {
  const before = new Set(track.getChildIds("devices"));
  // The remote script finds the track by this name, not the index: tracks can
  // shift before it runs, and a late load must not land on a user's track.
  const trackName = `Producer Pal temp ${Math.random().toString(36).slice(2)}`;

  track.set("name", trackName);

  // Making the track took time too. Work out the wait now, so the arrival
  // poll's reserve is still there.
  const waitMs = loadWait(deviceName, timing);
  const started = Date.now();
  const response = await requestNode<BrowserItemLoad>(
    REMOTE_SCRIPT_ROUTES.load,
    {
      type: item.type,
      path: item.path,
      trackIndex: track.trackIndex,
      trackName,
      expiresInMs: remoteScriptExpiry(waitMs),
    },
    waitMs,
  );
  const failure = loadFailure(response, Date.now() - started >= waitMs);

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
 * A load failure's reason, with what it leaves behind when the load timed out.
 * @param why - The reason
 * @param timedOut - Whether the load timed out after it may have started
 * @returns The reason
 */
function stranded(why: string, timedOut: boolean): string {
  return timedOut ? `${why}; ${LOAD_STRANDED}` : why;
}

/**
 * Why a load answer isn't a success. A load that timed out may still have run in
 * Live, but the temp track is deleted, and a later load can't find it by name,
 * so nothing reaches the path.
 * @param response - The load route's response
 * @param gaveUp - Whether V8 stopped waiting for it
 * @returns The reason, or undefined when the load succeeded
 */
function loadFailure(
  response: NodeResponse<BrowserItemLoad>,
  gaveUp: boolean,
): string | undefined {
  if (!response.success) {
    return stranded(response.error ?? "no answer", gaveUp);
  }

  const result = response.result;

  if (result == null) {
    return "the remote script returned nothing";
  }

  if (!result.available) {
    return whyUnavailable(result, "Live's browser stopped answering");
  }

  return result.error == null
    ? undefined
    : stranded(result.error, result.unfinished === true);
}

/**
 * Move a loaded device to where the call named, with a native insert's
 * semantics: 0 on an empty chain appends.
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
  const { position } = insertionPosition(target);
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
    // A plug-in only shows its kind once loaded, so this is the first time it
    // can be told it doesn't fit. Said bare, as a native insert's is.
    const misfit = misfitReason(
      deviceName,
      loadedDeviceKind(device),
      target.container,
    );

    throw new Error(
      misfit ?? insertRefusal(deviceName, target.position, path, move.reason),
    );
  }
}

/**
 * Refuse before loading an item whose kind is known and doesn't fit the
 * container, so a doomed load makes no temp track.
 * @param item - What would be loaded
 * @param deviceName - The device as the call named it
 * @param target - Where it goes
 * @throws Error saying why the container won't take it
 */
function refuseKnownMisfit(
  item: BrowserItem,
  deviceName: string,
  target: CreationTarget,
): void {
  const misfit = trackMisfitReason(
    deviceName,
    browserItemKind(item.type),
    target.container,
  );

  if (misfit != null) {
    throw new Error(misfit);
  }
}
