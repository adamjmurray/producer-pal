// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The plug-ins Live's browser lists, read through the remote script. The
 * browser is current while Live's plugin DB lags behind new installs, so
 * `list-plugins` merges the two (see live-library/query/plugins/merge-browser-plugins.ts).
 */

import { listBrowser, listedItems } from "./browser-device-lookup.ts";
import { type PluginFormat } from "../../../live-library/library-types.ts";
import { pluginFolderFormat } from "./plugin-folder-format.ts";

/** How long to wait for the browser. The first listing can be slow. */
const BROWSER_WAIT_MS = 5000;

/** A plug-in as the browser lists it. */
export interface BrowserPlugin {
  name: string;
  /** The vendor folder's name, or null when the plug-in sits in no vendor folder. */
  vendor: string | null;
  /** Null when the format folder isn't one we know. */
  format: PluginFormat | null;
}

/**
 * List the plug-ins in Live's browser.
 *
 * @returns The plug-ins, or null when the remote script can't answer
 *   (not running, too old, busy or erroring), so the caller falls back to the DB
 */
export async function listBrowserPlugins(): Promise<BrowserPlugin[] | null> {
  try {
    const reply = await listBrowser(
      { type: "plugin", plugins_only: "true" },
      Date.now() + BROWSER_WAIT_MS,
    );

    // An older script ignores plugins_only and lists every preset too, so only
    // a reply that echoes it is a plug-in list.
    if (
      !reply.available ||
      reply.status !== 200 ||
      reply.body.plugins_only !== true
    ) {
      return null;
    }

    return listedItems(reply).map(({ name, path }) => {
      const folders = path.split("/").slice(0, -1);

      return {
        name,
        vendor: folders[1] ?? null,
        format: pluginFolderFormat(folders[0]),
      };
    });
  } catch {
    return null;
  }
}
