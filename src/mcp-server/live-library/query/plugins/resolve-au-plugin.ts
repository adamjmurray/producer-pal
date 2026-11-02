// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Find an Audio Unit to host. Live's browser says which AUs exist (and honors
 * Live's "Use Audio Units v2" setting); the bundles' Info.plists say whether
 * each is an instrument or an effect.
 */

import { type BrowserPlugin } from "../../../rpc/remote-script/browser/browser-plugins.ts";
import {
  type PluginCategory,
  type ResolvedPlugin,
} from "../../library-types.ts";
import { type AuComponent, readAuComponents } from "./read-au-components.ts";
import { samePluginName } from "./same-plugin-name.ts";

/** Apple's AU types for the two kinds we can host. */
const AU_CATEGORIES: Record<string, PluginCategory> = {
  aumu: "instrument",
  aufx: "audiofx",
  aumf: "audiofx",
};

/**
 * Find the Audio Unit named `wanted`.
 *
 * @param browserAus - The AUs Live's browser lists with this name
 * @param wanted - The name asked for
 * @param auDirs - Folders to read the AU bundles from
 * @returns The match, or null when the browser lists none
 * @throws When several vendors have one, or its kind can't be told or hosted
 */
export async function resolveAuPlugin(
  browserAus: BrowserPlugin[],
  wanted: string,
  auDirs?: string[],
): Promise<ResolvedPlugin | null> {
  const [listed] = browserAus;

  if (listed == null) {
    return null;
  }

  const vendors = [
    ...new Set(browserAus.map((item) => item.vendor ?? "unknown")),
  ];

  if (vendors.length > 1) {
    throw new Error(
      `More than one AU plug-in is named "${wanted}" (vendors: ${vendors.join(", ")})`,
    );
  }

  const installed = await readAuComponents(auDirs);
  const component = pickComponent(
    installed.filter((candidate) =>
      samePluginName(candidate.name, listed.name),
    ),
    listed.vendor,
  );

  if (component == null) {
    throw new Error(
      `Can't tell whether "${listed.name}" is an instrument or an audio effect`,
    );
  }

  const category = AU_CATEGORIES[component.type];

  if (category == null) {
    throw new Error(
      `"${component.name}" is neither an instrument nor an audio effect, and only those can be hosted`,
    );
  }

  return {
    name: component.name,
    vendor: listed.vendor ?? component.vendor,
    category,
    format: "AU",
    file: component.bundle,
    shared: false,
  };
}

/**
 * @param components - Bundle entries with the right name
 * @param vendor - The vendor folder Live's browser shows, if any
 * @returns The entry of that vendor, else the first
 */
function pickComponent(
  components: AuComponent[],
  vendor: string | null,
): AuComponent | undefined {
  const wanted = vendor?.trim().toLowerCase();

  return (
    components.find((item) => item.vendor?.trim().toLowerCase() === wanted) ??
    components[0]
  );
}
