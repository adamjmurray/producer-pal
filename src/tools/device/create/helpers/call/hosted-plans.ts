// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Plans for `hosted: true`: each plug-in is looked up in Live's plug-in
// database, and the wrapper that suits its kind in Live's browser, before
// anything is made. A name that matches nothing fails the call with nothing
// changed.

import { outdatedFor } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { pluginHostSetup } from "./plugin-host-setup.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import {
  BrowserDeviceNotFoundError,
  resolveBrowserDevice,
} from "../browser-devices.ts";
import { type PluginPlan, resolvePluginPlan } from "../plugin-host-load.ts";
import { type BrowserItem } from "../remote-script-contract.ts";

/** A plug-in to host, and the wrapper device that loads it. */
export interface HostedPlan {
  plugin: PluginPlan;
  /** The wrapper's item in Live's browser */
  item: BrowserItem;
}

/**
 * Look up each plug-in a call names, once however many paths want it.
 * @param names - The plug-in name for each path
 * @param deadline - The request deadline
 * @param manage - Whether the caller can use ppal-manage
 * @returns The plan for each name, in the order given
 * @throws Error when a name isn't an installed plug-in, or the wrapper it
 *   needs isn't in Live's browser or can't be looked up
 */
export async function planHostedPlugins(
  names: string[],
  deadline: number | null | undefined,
  manage: boolean,
): Promise<HostedPlan[]> {
  const plans = new Map<string, HostedPlan>();

  for (const name of names) {
    if (!plans.has(name)) {
      plans.set(name, await planOne(name, deadline, manage));
    }
  }

  return names.map((name) => plans.get(name) as HostedPlan);
}

// --- Helpers below main export ---

/**
 * @param name - A plug-in name
 * @param deadline - The request deadline
 * @param manage - Whether the caller can use ppal-manage
 * @returns The plug-in and its wrapper
 */
async function planOne(
  name: string,
  deadline: number | null | undefined,
  manage: boolean,
): Promise<HostedPlan> {
  const plugin = await resolvePluginPlan(name);
  const item = await resolveWrapper(name, plugin.wrapperName, deadline, manage);

  if ("available" in item) {
    const outdated = outdatedFor(item, manage);

    throw new Error(
      `can't host "${name}": ${
        outdated == null
          ? `hosting needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(manage)}`
          : `the Producer Pal remote script is out of date: ${outdated}`
      }`,
    );
  }

  return { plugin, item };
}

/**
 * @param name - The plug-in name
 * @param wrapperName - The wrapper device's browser name
 * @param deadline - The request deadline
 * @param manage - Whether the caller can use ppal-manage
 * @returns The wrapper's item, or `available: false` when the remote script
 *   isn't answering
 * @throws Error saying how to install the wrapper when Live's browser has none
 */
async function resolveWrapper(
  name: string,
  wrapperName: string,
  deadline: number | null | undefined,
  manage: boolean,
): ReturnType<typeof resolveBrowserDevice> {
  try {
    return await resolveBrowserDevice(wrapperName, deadline);
  } catch (error) {
    if (!(error instanceof BrowserDeviceNotFoundError)) {
      throw error;
    }

    throw new Error(
      `can't host "${name}": the "${wrapperName}" wrapper isn't installed; ${pluginHostSetup(manage)}`,
      { cause: error },
    );
  }
}
