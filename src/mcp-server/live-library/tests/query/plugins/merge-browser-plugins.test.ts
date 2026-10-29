// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type BrowserPlugin } from "../../../../rpc/remote-script/browser/browser-plugins.ts";
import { type PluginItem } from "../../../library-types.ts";
import { mergeBrowserPlugins } from "../../../query/plugins/merge-browser-plugins.ts";

function dbPlugin(overrides: Partial<PluginItem>): PluginItem {
  return {
    name: "ValhallaRoom",
    vendor: "Valhalla DSP, LLC",
    version: "1.6.1",
    format: "VST3",
    category: "audiofx",
    subcategories: ["Reverb"],
    ...overrides,
  };
}

function browserPlugin(overrides: Partial<BrowserPlugin>): BrowserPlugin {
  return {
    name: "ValhallaRoom",
    vendor: "Valhalla DSP",
    format: "VST3",
    ...overrides,
  };
}

describe("mergeBrowserPlugins", () => {
  it("joins on format and name, taking version and subcategories from the DB", () => {
    const merged = mergeBrowserPlugins([dbPlugin({})], [browserPlugin({})]);

    expect(merged).toStrictEqual([
      {
        name: "ValhallaRoom",
        vendor: "Valhalla DSP",
        version: "1.6.1",
        format: "VST3",
        category: "audiofx",
        subcategories: ["Reverb"],
      },
    ]);
  });

  it("uses the browser's vendor, not the DB's", () => {
    const [merged] = mergeBrowserPlugins([dbPlugin({})], [browserPlugin({})]);

    expect(merged?.vendor).toBe("Valhalla DSP");
  });

  it("does not join plug-ins of the same name in another format", () => {
    const merged = mergeBrowserPlugins(
      [dbPlugin({ format: "VST" })],
      [browserPlugin({ format: "VST3" })],
    );

    expect(merged).toStrictEqual([
      {
        name: "ValhallaRoom",
        vendor: "Valhalla DSP",
        version: null,
        format: "VST3",
        category: null,
        subcategories: [],
      },
    ]);
  });

  it("drops DB rows the browser doesn't list", () => {
    const merged = mergeBrowserPlugins(
      [dbPlugin({}), dbPlugin({ name: "Serum", format: "VST" })],
      [browserPlugin({})],
    );

    expect(merged.map((p) => p.name)).toStrictEqual(["ValhallaRoom"]);
  });

  it("keeps browser-only plug-ins with just name, format and vendor", () => {
    const merged = mergeBrowserPlugins(
      [],
      [browserPlugin({ name: "New One", vendor: "New Co", format: "AU" })],
    );

    expect(merged).toStrictEqual([
      {
        name: "New One",
        vendor: "New Co",
        version: null,
        format: "AU",
        category: null,
        subcategories: [],
      },
    ]);
  });

  it("picks the DB row whose vendor matches when two share a name", () => {
    const merged = mergeBrowserPlugins(
      [
        dbPlugin({ vendor: "Other Co", version: "9.9" }),
        dbPlugin({ vendor: "Valhalla DSP, LLC", version: "1.6.1" }),
      ],
      [browserPlugin({})],
    );

    expect(merged[0]?.version).toBe("1.6.1");
  });

  it("attaches no DB row when no vendor matches", () => {
    const [merged] = mergeBrowserPlugins(
      [dbPlugin({ vendor: "Other Co", version: "9.9" })],
      [browserPlugin({})],
    );

    expect(merged).toStrictEqual({
      name: "ValhallaRoom",
      vendor: "Valhalla DSP",
      version: null,
      format: "VST3",
      category: null,
      subcategories: [],
    });
  });

  it("matches vendors ignoring case, with either one the longer", () => {
    const longerBrowser = mergeBrowserPlugins(
      [dbPlugin({ vendor: "valhalla" })],
      [browserPlugin({ vendor: "Valhalla DSP" })],
    );
    const shorterBrowser = mergeBrowserPlugins(
      [dbPlugin({})],
      [browserPlugin({ vendor: "VALHALLA dsp" })],
    );

    expect(longerBrowser[0]?.version).toBe("1.6.1");
    expect(shorterBrowser[0]?.version).toBe("1.6.1");
  });

  it("doesn't match a DB row that has no vendor to a browser vendor", () => {
    const [merged] = mergeBrowserPlugins(
      [dbPlugin({ vendor: null })],
      [browserPlugin({})],
    );

    expect(merged?.version).toBeNull();
  });

  it("takes the first DB row, and its vendor, when the browser has no vendor", () => {
    const [merged] = mergeBrowserPlugins(
      [dbPlugin({ vendor: "Other Co", version: "9.9" })],
      [browserPlugin({ vendor: null })],
    );

    expect(merged?.version).toBe("9.9");
    expect(merged?.vendor).toBe("Other Co");
  });

  it("joins names ignoring case and surrounding spaces, showing the browser's name", () => {
    const [merged] = mergeBrowserPlugins(
      [dbPlugin({ name: " VALHALLAROOM " })],
      [browserPlugin({})],
    );

    expect(merged?.name).toBe("ValhallaRoom");
    expect(merged?.version).toBe("1.6.1");
  });

  it("sorts by name, ignoring case", () => {
    const merged = mergeBrowserPlugins(
      [],
      [
        browserPlugin({ name: "zebra" }),
        browserPlugin({ name: "Apple" }),
        browserPlugin({ name: "mango" }),
      ],
    );

    expect(merged.map((p) => p.name)).toStrictEqual([
      "Apple",
      "mango",
      "zebra",
    ]);
  });
});
