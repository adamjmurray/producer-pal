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
  type ToolOverrideContext,
} from "#evals/scenarios/run-scenario/tool-override-proxy.ts";
import {
  remoteScriptLine,
  type RemoteScriptCaller,
} from "#src/mcp-server/helpers/connect/remote-script-line.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { type RunningDevice } from "#src/portal/update/running-device.ts";
import { withUpdateHint } from "#src/portal/update/update-connect-hint.ts";
import { updatedNextSteps } from "#src/portal/update/full-connect-advice.ts";
import { toCompactJSLiteral } from "#src/shared/compact/compact-serializer.ts";
import { VERSION } from "#src/shared/config.ts";
import { manageToolOffered } from "#src/shared/tool-groups.ts";
import { UP_TO_DATE_NEW_CHAT } from "#src/shared/version-check.ts";
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
  liveVersion: null,
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
 * everything else with `otherwise`. The canned result carries the Live version
 * the real version check reports, which only reads versions.
 * @param otherwise - Handles a plain connect; the real call by default
 * @returns The `ppal-connect` override
 */
export function connectOverride(
  otherwise: ToolOverride = (_args, callReal) => callReal(),
): ToolOverride {
  return async (args, callReal, context) =>
    args.versionCheck === true
      ? versionCheckUpToDate(liveVersionOf(await callReal()), context)
      : await otherwise(args, callReal, context);
}

/**
 * A full connect with the portal's note that the device is older appended, if
 * the portal would add one: the real `withUpdateHint` decides, over a device
 * that reports OLD_VERSION and this run's small-model mode.
 * @param _args - The call's arguments
 * @param callReal - Makes the real call
 * @param context - The run's small-model mode and tools
 * @returns The real result, plus the note when the portal adds it
 */
export async function connectWithOlderDevice(
  _args: Record<string, unknown>,
  callReal: () => Promise<McpContent>,
  context: ToolOverrideContext,
): Promise<McpContent> {
  const { content } = await withUpdateHint(
    { content: await callReal() },
    {
      name: "ppal-connect",
      manageOffered: callerOf(context).manage,
      remoteHost: null,
    },
    olderDevice(context),
  );

  return content;
}

/**
 * A full connect where the remote script line says the installed copy is behind
 * this device.
 * @param _args - The call's arguments
 * @param callReal - Makes the real call
 * @param context - The run's small-model mode and tools
 * @returns The real result with its remote script line replaced
 */
export async function connectWithBehindScript(
  _args: Record<string, unknown>,
  callReal: () => Promise<McpContent>,
  context: ToolOverrideContext,
): Promise<McpContent> {
  const content = await callReal();

  return [
    ...content.filter((block) => !block.text?.startsWith(SCRIPT_PREFIX)),
    { type: "text", text: remoteScriptLine(BEHIND_SCRIPT, callerOf(context)) },
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
 * @param fullConnectSeen - Whether the portal has seen a plain ppal-connect
 *   (a mid-chat update); false when the update is the chat's first action
 * @returns What `ppal-manage update-producer-pal` answers on success
 */
export function updateSuccess(fullConnectSeen = true): McpContent {
  return textContent(
    toCompactJSLiteral({
      device: { from: OLD_VERSION, to: VERSION },
      track: { path: "t1", name: "Producer Pal" },
      nextSteps: updatedNextSteps(fullConnectSeen),
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
 * @param abletonLiveVersion - The Live version the real connect reports
 * @param context - The run's small-model mode and tools
 * @returns What `ppal-connect` with `versionCheck: true` answers when nothing
 *   needs fixing
 */
export function versionCheckUpToDate(
  abletonLiveVersion: string,
  context: ToolOverrideContext,
): McpContent {
  return [
    ...textContent(
      toCompactJSLiteral({
        connected: true,
        producerPalVersion: VERSION,
        abletonLiveVersion,
      }),
    ),
    { type: "text", text: remoteScriptLine(CURRENT_SCRIPT, callerOf(context)) },
    { type: "text", text: UP_TO_DATE_NEW_CHAT },
  ];
}

/**
 * What the product decides about the caller, from the run.
 * @param context - The run's small-model mode and tools
 * @returns Whether ppal-manage is offered, and the mode
 */
function callerOf(context: ToolOverrideContext): RemoteScriptCaller {
  return {
    manage: manageToolOffered(context.smallModelMode, context.tools),
    smallModel: context.smallModelMode,
  };
}

/**
 * @param context - The run's small-model mode and tools
 * @returns A device that reports OLD_VERSION and the run's small-model mode
 */
function olderDevice(context: ToolOverrideContext): RunningDevice {
  return {
    connect: () => Promise.resolve(),
    version: () => OLD_VERSION,
    reset: () => {},
    fullConnectSeen: () => false,
    smallModelMode: () => Promise.resolve(context.smallModelMode),
    toolsChanged: () => {},
  };
}

/**
 * @param content - A real `ppal-connect` result
 * @returns The Live version it reports
 */
function liveVersionOf(content: McpContent): string {
  const text = content[0]?.text ?? "";
  const version = /abletonLiveVersion:"([^"]+)"/.exec(text)?.[1];

  if (version == null) {
    throw new Error(`No Live version in the real version check: ${text}`);
  }

  return version;
}

/**
 * @param text - A block's text
 * @returns A one-block MCP result
 */
function textContent(text: string): McpContent {
  return [{ type: "text", text }];
}
