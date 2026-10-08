// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage add-producer-pal while the device is offline: copy the bundled
// device into the User Library, have the remote script load it onto a new MIDI
// track, and wait for its server to answer. Each failure says what it left
// behind, since the Set may have changed.

import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import {
  RemoteScriptTimeout,
  replyError,
  type RemoteScriptAnswer,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { outdatedScript } from "#src/mcp-server/rpc/remote-script/port/remote-script-version.ts";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { INSTALL_WITH_TOOL } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type DeviceInstallResult } from "../setup/device-install.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { SETUP_URL } from "./offline-guidance.ts";
import { offlineError, offlineResult } from "./offline-responses.ts";

/** Live's browser can take a few seconds to see a file just written. */
const LOAD_RETRY_MS = 500;
const LOAD_RETRY_LIMIT_MS = 15_000;

/** How long Live may leave the load queued, which is also how long we wait. */
const LOAD_EXPIRES_MS = 20_000;

/** A Max device takes a while to start its server. */
const SERVER_POLL_MS = 500;
const SERVER_WAIT_MS = 30_000;

const DONT_RETRY = "Don't call add-producer-pal again.";
const FILE_LEFT = "The device file is in the User Library.";

/** The track the device was loaded onto, as the remote script reports it. */
interface LoadedTrack {
  index: number;
  name: string;
}

/** A failure to report, worded for the model. */
class AddFailed extends Error {}

/**
 * Add the Producer Pal device to the open Live Set.
 * @param userLibrary - The User Library the call gave, if any
 * @param connect - Connect to the device's server; throws until it answers
 * @param deps - What the steps reach out to
 * @returns The track and what happened to the device file, or why it failed
 */
export async function addProducerPal(
  userLibrary: string | undefined,
  connect: () => Promise<void>,
  deps: OfflineDeps,
): Promise<McpResponse> {
  try {
    const bundled = deps.findBundledDevice();

    if (bundled == null) {
      throw new AddFailed(
        `this Producer Pal install has no bundled device, so nothing was added. Tell the user to install it by hand: ${SETUP_URL}`,
      );
    }

    const library = await userLibraryFor(userLibrary, deps);
    const device = copyDevice(library, bundled, deps);
    const track = await loadDevice(device.path, deps);

    await waitForServer(track, connect, deps);

    return offlineResult({
      ...(track == null ? {} : { track }),
      device: device.note,
      nextSteps: "Call ppal-connect next.",
    });
  } catch (error) {
    return offlineError(errorMessage(error));
  }
}

/**
 * Check the remote script is there, then settle which User Library to use.
 * @param given - The User Library the call gave, if any
 * @param deps - The ping and the library lookup
 * @returns Absolute path to the User Library
 * @throws AddFailed when the script can't load it or no library is known
 */
async function userLibraryFor(
  given: string | undefined,
  deps: OfflineDeps,
): Promise<string> {
  const ping = await deps.ping();

  if (!ping.running) {
    throw new AddFailed(
      `the Producer Pal remote script isn't running, and adding the device needs it, so nothing was added. Run ${INSTALL_WITH_TOOL} (if it isn't installed), then ask the user to restart Live and choose Producer Pal as a Control Surface in Settings → Link, Tempo & MIDI. Then call add-producer-pal again.`,
    );
  }

  const outdated = outdatedScript(ping.scriptVersion);

  if (outdated != null) {
    throw new AddFailed(`${outdated}. Nothing was added.`);
  }

  const library = await firstUserLibrary(
    [given?.trim(), ping.userLibrary],
    deps,
  );

  if (library == null) {
    throw new AddFailed(
      `couldn't find Live's User Library, so nothing was added. ${ASK_FOR_LIBRARY}`,
    );
  }

  return library;
}

/**
 * @param known - The libraries the call and the remote script named, best first
 * @param deps - The lookup of last resort
 * @returns The first one named, else the one Producer Pal finds, else null
 */
async function firstUserLibrary(
  known: Array<string | null | undefined>,
  deps: OfflineDeps,
): Promise<string | null> {
  const named = known.find((path) => path != null && path !== "");

  return named ?? (await deps.findUserLibrary());
}

/**
 * Put the bundled device in the User Library, or find the one already there.
 * @param library - Absolute path to the User Library
 * @param bundled - The device file that shipped with the portal
 * @param deps - The copy
 * @returns Where the device file is, and what happened to it
 * @throws AddFailed when there is no device file to load
 */
function copyDevice(
  library: string,
  bundled: string,
  deps: OfflineDeps,
): { path: string; note: string } {
  let result: DeviceInstallResult;

  try {
    result = deps.installDevice(library, bundled);
  } catch (error) {
    const message = errorMessage(error);

    throw new AddFailed(
      error instanceof UserLibraryFolderError
        ? `${message}; nothing was added. ${ASK_FOR_LIBRARY}`
        : `${message}. Nothing was added.`,
      { cause: error },
    );
  }

  const { path } = result;

  if (result.outcome !== "failed") {
    return { path, note: copyNote(result) };
  }

  if (!deps.fileExists(path)) {
    throw new AddFailed(
      `${result.detail} Cause: ${result.error}. Nothing was added to the Live Set. Tell the user to install the device by hand: ${SETUP_URL}`,
    );
  }

  return {
    path,
    note: `couldn't update the installed device (${result.error}); used the one already there`,
  };
}

/**
 * @param result - The copy's result, which didn't fail
 * @returns A short note on the device file for the result
 */
function copyNote(result: DeviceInstallResult): string {
  if (result.outcome === "installed") {
    return "installed in the User Library";
  }

  if (result.outcome === "updated") {
    return "updated in the User Library";
  }

  if (result.outcome === "current") {
    return "already installed and up to date";
  }

  return `used the installed device as it is (${result.previousVersion ?? "unknown version"}; the bundled one is ${result.bundledVersion ?? "unknown"} and the installed one is newer or can't be ordered against it)`;
}

/**
 * Ask the remote script to load the device onto a new MIDI track. A 404 means
 * Live's browser hasn't seen the new file yet, so it is asked again for a while.
 * @param path - Absolute path of the device file
 * @param deps - The remote script, and the clock
 * @returns The track it landed on, when the remote script said
 * @throws AddFailed when it didn't load, or may have
 */
async function loadDevice(
  path: string,
  deps: OfflineDeps,
): Promise<LoadedTrack | undefined> {
  const started = deps.now();

  for (;;) {
    const reply = await requestLoad(path, deps);

    if (reply.status === 200) {
      return trackOf(reply.body);
    }

    if (reply.status === 404 && deps.now() - started < LOAD_RETRY_LIMIT_MS) {
      await deps.sleep(LOAD_RETRY_MS);
      continue;
    }

    throw loadFailure(reply);
  }
}

/**
 * @param path - Absolute path of the device file
 * @param deps - The remote script
 * @returns The remote script's answer
 * @throws AddFailed when it didn't answer, with what that means for the Set
 */
async function requestLoad(
  path: string,
  deps: OfflineDeps,
): Promise<RemoteScriptAnswer> {
  let reply;

  try {
    reply = await deps.request({
      method: "POST",
      route: "/load",
      body: { type: "file", path },
      expiresInMs: LOAD_EXPIRES_MS,
    });
  } catch (error) {
    const sent = !(error instanceof RemoteScriptTimeout) || error.sent;

    throw new AddFailed(
      sent
        ? `Live didn't answer the request to add Producer Pal (${errorMessage(error)}), so it may have been added to a new MIDI track. Wait a moment, then call ppal-connect. ${DONT_RETRY} ${FILE_LEFT}`
        : `ran out of time before the request reached Live, so nothing was added to the Set. ${FILE_LEFT} Call add-producer-pal again.`,
      { cause: error },
    );
  }

  if (!reply.available) {
    const why = reply.outdated ?? "the remote script stopped answering";

    throw new AddFailed(`${why}. Nothing was added to the Set. ${FILE_LEFT}`);
  }

  return reply;
}

/**
 * @param reply - A /load answer that wasn't a success
 * @returns The failure to report
 */
function loadFailure(reply: RemoteScriptAnswer): AddFailed {
  const text = replyError(reply);

  if (reply.status === 409 && /already in this Live Set/i.test(text)) {
    return new AddFailed(
      `${text}. But its server isn't answering. Ask the user to check that device in Live (it may be switched off or still loading), then call ppal-connect. Don't add another.`,
    );
  }

  if (reply.status === 404) {
    return new AddFailed(
      `Live's browser hasn't found the device file yet (${text}). Nothing was added to the Set. ${FILE_LEFT} Call add-producer-pal again in a moment.`,
    );
  }

  return new AddFailed(
    `Live couldn't add Producer Pal: ${text}. Nothing was added to the Set. ${FILE_LEFT}`,
  );
}

/**
 * @param body - A successful /load answer
 * @returns The track it names, when it names one
 */
function trackOf(body: Record<string, unknown>): LoadedTrack | undefined {
  const { track } = body;

  if (track == null || typeof track !== "object") {
    return undefined;
  }

  const { index, name } = track as Record<string, unknown>;

  return typeof index === "number" && typeof name === "string"
    ? { index, name }
    : undefined;
}

/**
 * Connect to the device's server, trying until it answers.
 * @param track - Where the device was added, for the failure message
 * @param connect - Connect to the device's server; throws until it answers
 * @param deps - The clock
 * @throws AddFailed when it never answers
 */
async function waitForServer(
  track: LoadedTrack | undefined,
  connect: () => Promise<void>,
  deps: OfflineDeps,
): Promise<void> {
  const started = deps.now();

  for (;;) {
    try {
      await connect();

      return;
    } catch {
      // Not up yet.
    }

    if (deps.now() - started >= SERVER_WAIT_MS) {
      break;
    }

    await deps.sleep(SERVER_POLL_MS);
  }

  const where =
    track == null ? "a new MIDI track" : `track ${track.index} "${track.name}"`;

  throw new AddFailed(
    `Producer Pal was added to ${where} but hasn't answered yet. Wait a moment, then call ppal-connect. ${DONT_RETRY}`,
  );
}
