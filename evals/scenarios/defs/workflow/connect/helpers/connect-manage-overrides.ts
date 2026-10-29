// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Canned tool results for the upgrade scenarios, built from the real wording so
 * they can't go stale. Nothing is installed or updated for real: the model is
 * shown what a real update, install or version check would have answered.
 */

import {
  type McpContent,
  type ToolOverride,
} from "#evals/scenarios/run-scenario/tool-override-proxy.ts";
import { remoteScriptLine } from "#src/mcp-server/helpers/connect/remote-script-line.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { hintFor } from "#src/portal/update/update-connect-hint.ts";
import { toCompactJSLiteral } from "#src/shared/compact/compact-serializer.ts";
import { MIN_LIVE_VERSION, VERSION } from "#src/shared/config.ts";
import {
  UP_TO_DATE_NEW_CHAT,
  VERSION_CHECK_OR_CONNECT,
} from "#src/shared/version-check.ts";
import { manageInstallResult } from "#src/tools/core/helpers/manage-install-result.ts";

/** The version the scenarios pretend was installed before the upgrade. */
const OLD_VERSION = "2.5.0";

const SCRIPT_PREFIX = "remoteScript:";
const USER_LIBRARY = "<User Library>";

/** A remote script that is installed and running this build. */
const CURRENT_SCRIPT: RemoteScriptStatus = {
  userLibrary: null,
  installed: true,
  installedVersion: VERSION,
  installedBuild: null,
  bundledVersion: VERSION,
  running: true,
  runningVersion: VERSION,
  runningBuild: null,
  liveVersion: MIN_LIVE_VERSION,
  otherOnPort: null,
  updateAvailable: false,
  installedNewer: false,
};

/** A remote script installed and running, but older than this device. */
const BEHIND_SCRIPT: RemoteScriptStatus = {
  ...CURRENT_SCRIPT,
  installedVersion: OLD_VERSION,
  runningVersion: OLD_VERSION,
  updateAvailable: true,
};

/**
 * Answer `ppal-connect` with `versionCheck: true` from the canned result and
 * everything else with `otherwise`.
 * @param otherwise - Handles a plain connect; the real call by default
 * @returns The `ppal-connect` override
 */
export function connectOverride(
  otherwise: ToolOverride = (_args, callReal) => callReal(),
): ToolOverride {
  return (args, callReal) =>
    args.versionCheck === true
      ? versionCheckUpToDate()
      : otherwise(args, callReal);
}

/**
 * A full connect with the portal's note that the device is older appended.
 * @param _args - The call's arguments
 * @param callReal - Makes the real call
 * @returns The real result plus the note
 */
export async function connectWithOlderDevice(
  _args: Record<string, unknown>,
  callReal: () => Promise<McpContent>,
): Promise<McpContent> {
  return [
    ...(await callReal()),
    { type: "text", text: hintFor(OLD_VERSION, true) },
  ];
}

/**
 * A full connect where the remote script line says the installed copy is behind
 * this device.
 * @param _args - The call's arguments
 * @param callReal - Makes the real call
 * @returns The real result with its remote script line replaced
 */
export async function connectWithBehindScript(
  _args: Record<string, unknown>,
  callReal: () => Promise<McpContent>,
): Promise<McpContent> {
  const content = await callReal();

  return [
    ...content.filter((block) => !block.text?.startsWith(SCRIPT_PREFIX)),
    { type: "text", text: remoteScriptLine(BEHIND_SCRIPT, true) },
  ];
}

/**
 * Answer one `ppal-manage` action from a canned result. Any other action is
 * refused: it would really run (install, add) on the machine under test.
 * @param action - The action to mock
 * @param canned - Builds the result to give
 * @returns The `ppal-manage` override
 */
export function manageOverride(
  action: "update-producer-pal" | "install-producer-pal",
  canned: () => McpContent,
): ToolOverride {
  return (args) =>
    args.action === action
      ? canned()
      : textContent("Error: that action isn't available right now.");
}

/**
 * @returns What `ppal-manage update-producer-pal` answers on success
 */
export function updateSuccess(): McpContent {
  return textContent(
    toCompactJSLiteral({
      device: { from: OLD_VERSION, to: VERSION },
      track: { path: "t1", name: "Producer Pal" },
      nextSteps: `Call ${VERSION_CHECK_OR_CONNECT}.`,
    }),
  );
}

/**
 * @returns What `ppal-manage install-producer-pal` answers after updating the
 *   remote script of a running device
 */
export function installSuccess(): McpContent {
  const result = manageInstallResult(
    {
      ran: true,
      remoteScript: {
        status: "updated",
        path: `${USER_LIBRARY}/Remote Scripts/Producer_Pal`,
        version: VERSION,
      },
      device: {
        status: "current",
        path: `${USER_LIBRARY}/Presets/Instruments/Max Instrument/Producer_Pal.amxd`,
        version: VERSION,
      },
    },
    { running: true },
  );

  return textContent(toCompactJSLiteral(result));
}

/**
 * @returns What `ppal-connect` with `versionCheck: true` answers when nothing
 *   needs fixing
 */
export function versionCheckUpToDate(): McpContent {
  return [
    ...textContent(
      toCompactJSLiteral({
        connected: true,
        producerPalVersion: VERSION,
        abletonLiveVersion: MIN_LIVE_VERSION,
      }),
    ),
    { type: "text", text: remoteScriptLine(CURRENT_SCRIPT, true) },
    { type: "text", text: UP_TO_DATE_NEW_CHAT },
  ];
}

/**
 * @param text - A block's text
 * @returns A one-block MCP result
 */
function textContent(text: string): McpContent {
  return [{ type: "text", text }];
}
