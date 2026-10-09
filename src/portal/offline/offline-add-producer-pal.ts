// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-manage add-producer-pal while the device is offline: copy the bundled
// device into the User Library, have the remote script load it onto a new MIDI
// track, and wait for its server to answer. Each failure says what it left
// behind, since the Set may have changed.

import {
  replyError,
  type RemoteScriptAnswer,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { RemoteScriptTimeout } from "#src/mcp-server/rpc/remote-script/remote-script-errors.ts";
import { UPDATE_PORTAL_ADVICE } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import {
  installBundledDevice,
  requireBundledDevice,
} from "../setup/bundled-device-copy.ts";
import { requestWithBrowserRetry } from "../setup/browser-retry-request.ts";
import { type DeviceInstallResult } from "../setup/device-install.ts";
import { userLibraryFor } from "../setup/library-for-device.ts";
import { pollUntil } from "../setup/poll-until.ts";
import { remoteScriptReady } from "../setup/remote-script-ready.ts";
import { SetupFailed, type SetupPurpose } from "../setup/setup-failure.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { offlineError, offlineResult } from "./offline-responses.ts";
import { SETUP_URL } from "./offline-setup-hints.ts";

const ADD: SetupPurpose = {
  action: "add-producer-pal",
  doing: "adding the device",
  unchanged: "nothing was added",
};

const DONT_RETRY = "Don't call add-producer-pal again.";
const FILE_LEFT = "The device file is in the User Library.";

/** The track the device was loaded onto, as a track path ("t3"). */
interface LoadedTrack {
  path: string;
  name: string;
}

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
    const bundled = requireBundledDevice(deps, ADD);
    const ping = await remoteScriptReady(deps, ADD);
    const library = await userLibraryFor(userLibrary, ping, deps, ADD);
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
 * Put the bundled device in the User Library, or find the one already there.
 * @param library - Absolute path to the User Library
 * @param bundled - The device file that shipped with the portal
 * @param deps - The copy
 * @returns Where the device file is, and what happened to it
 * @throws SetupFailed when there is no device file to load
 */
function copyDevice(
  library: string,
  bundled: string,
  deps: OfflineDeps,
): { path: string; note: string } {
  const result = installBundledDevice(library, bundled, deps, ADD);
  const { path } = result;

  if (result.outcome !== "failed") {
    return { path, note: copyNote(result) };
  }

  if (!deps.fileExists(path)) {
    throw new SetupFailed(
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

  const { previousVersion, bundledVersion } = result;

  if (
    previousVersion != null &&
    bundledVersion != null &&
    isNewerVersion(bundledVersion, previousVersion)
  ) {
    return `used the installed device (${previousVersion}), which is newer than this portal's (${bundledVersion}). ${UPDATE_PORTAL_ADVICE}`;
  }

  return `used the installed device as it is (${previousVersion ?? "unknown version"}; the bundled one is ${bundledVersion ?? "unknown"} and the installed one is newer or can't be ordered against it)`;
}

/**
 * Ask the remote script to load the device onto a new MIDI track.
 * @param path - Absolute path of the device file
 * @param deps - The remote script, and the clock
 * @returns The track it landed on, when the remote script said
 * @throws SetupFailed when it didn't load, or may have
 */
async function loadDevice(
  path: string,
  deps: OfflineDeps,
): Promise<LoadedTrack | undefined> {
  const reply = await requestWithBrowserRetry(
    {
      route: "/load",
      body: { type: "file", path },
      thrown: loadThrew,
      unavailable: (unavailable) =>
        new SetupFailed(
          `${unavailable.outdated ?? "the remote script stopped answering"}. Nothing was added to the Set. ${FILE_LEFT}`,
        ),
    },
    deps,
  );

  if (reply.status === 200) {
    return trackOf(reply.body);
  }

  throw loadFailure(reply);
}

/**
 * @param error - What the request to the remote script threw
 * @returns The failure to report, with what that means for the Set
 */
function loadThrew(error: unknown): SetupFailed {
  const sent = !(error instanceof RemoteScriptTimeout) || error.sent;

  return new SetupFailed(
    sent
      ? `Live didn't answer the request to add Producer Pal (${errorMessage(error)}), so it may have been added to a new MIDI track. Wait a moment, then call ppal-connect. ${DONT_RETRY} ${FILE_LEFT}`
      : `ran out of time before the request reached Live, so nothing was added to the Set. ${FILE_LEFT} Call add-producer-pal again.`,
    { cause: error },
  );
}

/**
 * @param reply - A /load answer that wasn't a success
 * @returns The failure to report
 */
function loadFailure(reply: RemoteScriptAnswer): SetupFailed {
  const text = replyError(reply);

  if (reply.status === 409 && /already in this Live Set/i.test(text)) {
    return new SetupFailed(
      `${text}. But its server isn't answering. Ask the user to check that device in Live (it may be switched off or still loading), then call ppal-connect. Don't add another.`,
    );
  }

  if (mayHaveAdded(reply)) {
    return new SetupFailed(
      `Live reported a problem while adding Producer Pal (${text}), so it may have been added to a new MIDI track. Wait a moment, then call ppal-connect. ${DONT_RETRY} ${FILE_LEFT}`,
    );
  }

  if (reply.status === 404) {
    return new SetupFailed(
      `Live's browser hasn't found the device file yet (${text}). Nothing was added to the Set. ${FILE_LEFT} Call add-producer-pal again in a moment.`,
    );
  }

  return new SetupFailed(
    `Live couldn't add Producer Pal: ${text}. Nothing was added to the Set. ${FILE_LEFT}`,
  );
}

/**
 * The remote script refuses (400, 404, 409) before it touches the Set, and a
 * 504 without `started` means Live never ran the job. Any other failure came
 * after Live may have begun, unless the remote script says it cleaned up
 * (`changed: false`).
 * @param reply - The failure
 * @returns True when the device may have been added
 */
function mayHaveAdded(reply: RemoteScriptAnswer): boolean {
  if (reply.status === 504) {
    return reply.body.started === true;
  }

  return reply.status >= 500 && reply.body.changed !== false;
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
    ? { path: `t${index}`, name }
    : undefined;
}

/**
 * Connect to the device's server, trying until it answers.
 * @param track - Where the device was added, for the failure message
 * @param connect - Connect to the device's server; throws until it answers
 * @param deps - The clock
 * @throws SetupFailed when it never answers
 */
async function waitForServer(
  track: LoadedTrack | undefined,
  connect: () => Promise<void>,
  deps: OfflineDeps,
): Promise<void> {
  const answered = await pollUntil(async () => {
    try {
      await connect();

      return true;
    } catch {
      return false;
    }
  }, deps);

  if (answered) {
    return;
  }

  const where =
    track == null ? "a new MIDI track" : `${track.path} "${track.name}"`;

  throw new SetupFailed(
    `Producer Pal was added to ${where} but hasn't answered yet. Wait a moment, then call ppal-connect. ${DONT_RETRY}`,
  );
}
