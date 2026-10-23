// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Plans for `hosted: true`: each plug-in is looked up in Live's plug-in
// database, and the wrapper that suits its kind in Live's browser, before
// anything is made. A name that matches nothing fails the call with nothing
// changed.

import { REMOTE_SCRIPT_SETUP } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { resolveBrowserDevice } from "../browser-devices.ts";
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
 * @returns The plan for each name, in the order given
 * @throws Error when a name isn't an installed VST3 plug-in, or the wrapper it
 *   needs can't be found in Live's browser
 */
export async function planHostedPlugins(
  names: string[],
  deadline: number | null | undefined,
): Promise<HostedPlan[]> {
  const plans = new Map<string, HostedPlan>();

  for (const name of names) {
    if (!plans.has(name)) {
      plans.set(name, await planOne(name, deadline));
    }
  }

  return names.map((name) => plans.get(name) as HostedPlan);
}

// --- Helpers below main export ---

/**
 * @param name - A plug-in name
 * @param deadline - The request deadline
 * @returns The plug-in and its wrapper
 */
async function planOne(
  name: string,
  deadline: number | null | undefined,
): Promise<HostedPlan> {
  const plugin = await resolvePluginPlan(name);
  const item = await resolveBrowserDevice(plugin.wrapperName, deadline);

  if ("available" in item) {
    throw new Error(
      `can't host "${name}": ${
        item.outdated == null
          ? `hosting needs the Producer Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`
          : `the Producer Pal remote script is out of date: ${item.outdated}`
      }`,
    );
  }

  return { plugin, item };
}
