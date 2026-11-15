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
import {
  type AuComponent,
  readAppAuComponents,
  readAuComponents,
} from "./read-au-components.ts";
import { samePluginName } from "./same-plugin-name.ts";
import {
  exactVendorMatches,
  foldVendor,
  looseVendorMatches,
} from "./same-vendor.ts";

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
 * @param appDirs - Folders to read apps' AUv3 plug-ins from
 * @returns The match, or null when the browser lists none
 * @throws When several vendors have one, it's an AUv3, or its kind can't be
 *   told or hosted
 */
export async function resolveAuPlugin(
  browserAus: BrowserPlugin[],
  wanted: string,
  auDirs?: string[],
  appDirs?: string[],
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
    wanted,
  );

  if (component == null) {
    // vst~ loads nothing for an AUv3, under any name (Max 9.1.5)
    const auv3s = await readAppAuComponents(appDirs);

    if (auv3s.some((item) => samePluginName(item.name, listed.name))) {
      throw new Error(
        `"${listed.name}" is an AUv3 plug-in, and those can't be hosted`,
      );
    }

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
 * Choose among the installed bundles with the plug-in's name, never taking
 * another vendor's. In order: the browser's vendor exactly; the only vendor
 * there is; the one vendor that matches loosely (Live's folder "Acme Audio",
 * the plist's "Acme").
 *
 * @param components - Bundle entries with the right name
 * @param vendor - The vendor folder Live's browser shows, if any
 * @param wanted - The name asked for
 * @returns The entry to use, or undefined when there are none
 * @throws When the vendor can't pick one of several vendors' bundles
 */
function pickComponent(
  components: AuComponent[],
  vendor: string | null,
  wanted: string,
): AuComponent | undefined {
  const [exact] = exactVendorMatches(components, vendor, vendorOf);

  if (exact != null || components.length === 0) {
    return exact;
  }

  if (distinctVendors(components).length === 1) {
    return components[0];
  }

  const loose = looseVendorMatches(components, vendor, vendorOf);

  if (distinctVendors(loose).length === 1) {
    return loose[0];
  }

  const names = distinctVendors(components).map(
    (item) => item.vendor ?? "unknown",
  );

  throw new Error(
    `More than one AU plug-in is named "${wanted}" (vendors: ${names.join(", ")})`,
  );
}

function vendorOf(component: AuComponent): string | null {
  return component.vendor;
}

/**
 * @param components - Bundle entries
 * @returns One entry per vendor, in order
 */
function distinctVendors(components: AuComponent[]): AuComponent[] {
  const seen = new Set<string | undefined>();

  return components.filter((item) => {
    const key = foldVendor(item.vendor);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}
