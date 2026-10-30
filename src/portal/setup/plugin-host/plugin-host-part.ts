// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type PluginHostPart } from "#src/tools/core/helpers/manage-contract.ts";
import { EMBEDDED_PLUGIN_HOST_WRAPPERS } from "./embedded-plugin-host-wrappers.ts";
import {
  type PluginHostResult,
  type PluginHostState,
  installPluginHostWrappers,
  pluginHostStatus,
} from "./plugin-host-install.ts";

/** How a failed wrapper's message tells the reader to try again. */
const TOOL_RETRY = "run install-producer-pal again";

/** The chat UI has no tool to run: it has an Install button. */
export const UI_RETRY = "click Install";

/** How one installed wrapper compares with the one this build carries. */
export interface PluginHostWrapperState {
  name: string;
  path: string;
  state: PluginHostState;
}

/**
 * Install the plug-in host wrappers that ship with this build, as the install
 * tools report them. A build without ENABLE_HOSTED_PLUGINS installs nothing.
 * A wrapper that fails is reported and never throws, so it can't fail the
 * install it rides on.
 *
 * @param library - Absolute path to the User Library
 * @param retry - How a failure says to try again; the install tools' wording by default
 * @returns One part per wrapper, or none when the build doesn't host plug-ins
 */
export function installPluginHostParts(
  library: string,
  retry = TOOL_RETRY,
): PluginHostPart[] {
  if (process.env.ENABLE_HOSTED_PLUGINS !== "true") {
    return [];
  }

  return pluginHostPartsOf(
    installPluginHostWrappers(library, EMBEDDED_PLUGIN_HOST_WRAPPERS),
    retry,
  );
}

/**
 * How each installed wrapper compares with the one this build carries. Changes
 * nothing.
 *
 * @param library - Absolute path to the User Library, or null when there is none
 * @returns One entry per wrapper, or null when the build doesn't host plug-ins
 *   or there is no User Library
 */
export function pluginHostStates(
  library: string | null,
): PluginHostWrapperState[] | null {
  if (process.env.ENABLE_HOSTED_PLUGINS !== "true" || library == null) {
    return null;
  }

  return pluginHostStatus(library, EMBEDDED_PLUGIN_HOST_WRAPPERS);
}

/**
 * @param results - What the wrapper install did
 * @param retry - How a failure says to try again; the install tools' wording by default
 * @returns The same, as the install tools report it
 */
export function pluginHostPartsOf(
  results: PluginHostResult[],
  retry = TOOL_RETRY,
): PluginHostPart[] {
  return results.map((result): PluginHostPart => {
    const { name, path } = result;

    switch (result.outcome) {
      case "updated":
        return {
          name,
          status: "updated",
          path,
          detail:
            "Replaced the installed wrapper. A Set that's already open keeps the old one until it's reopened.",
        };
      case "failed":
        return { name, ok: false, path, detail: failureDetail(result, retry) };
      default:
        return { name, status: result.outcome, path };
    }
  });
}

/**
 * Say what happened to the wrappers in one line, for a place that has no
 * structured field for them.
 *
 * @param parts - The wrappers' parts
 * @returns A sentence, or an empty string when there are none
 */
export function describePluginHostParts(parts: PluginHostPart[]): string {
  if (parts.length === 0) {
    return "";
  }

  const each = parts.map((part) =>
    part.ok === false
      ? `${part.name} failed: ${part.detail.replace(/\.$/, "")}`
      : `${part.name} ${part.status === "current" ? "already installed" : part.status}`,
  );

  return `Plug-in host wrappers: ${each.join("; ")}.`;
}

function failureDetail(
  result: Extract<PluginHostResult, { outcome: "failed" }>,
  retry: string,
): string {
  const parts = [
    `Couldn't install the wrapper (${result.error}). The wrapper file was not changed.`,
  ];

  if (result.inUse) {
    parts.push(
      `It may be open in Live: close any Set that uses it, or quit Live, then ${retry}.`,
    );
  } else {
    parts.push(`Try again: ${retry}.`);
  }

  if (result.tempFileLeft != null) {
    parts.push(`A temp file couldn't be deleted: ${result.tempFileLeft}.`);
  }

  return parts.join(" ");
}
