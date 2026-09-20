// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it } from "vitest";
import { lookUpBrowserDevice } from "../browser-device-lookup.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  type ReceivedRequest,
  startFakeRemoteScript,
} from "./remote-script-test-helpers.ts";

/** Item paths under each remote script `type`. */
type Browser = Partial<Record<string, string[]>>;

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

/**
 * Answer /list the way the remote script does: every item matching `q` at any
 * depth, or one level of a folder with `recursive=false`.
 * @param browser - Item paths per type
 * @param request - The request
 * @returns The answer
 */
function listing(browser: Browser, { query }: ReceivedRequest): FakeAnswer {
  const paths = browser[query.type ?? ""] ?? [];

  if (query.recursive !== "false") {
    const q = (query.q ?? "").toLowerCase();
    const items = paths
      .map((path) => ({ name: path.split("/").at(-1) ?? "", path }))
      .filter((item) => item.name.toLowerCase().includes(q));

    return { body: { items } };
  }

  const prefix = query.path == null ? "" : `${query.path}/`;
  const below = paths.filter((path) => path.startsWith(prefix));

  if (below.length === 0) {
    return { status: 404, body: { error: `no '${query.path}'` } };
  }

  const items = new Map<string, object>();

  for (const path of below) {
    const [name = "", ...deeper] = path.slice(prefix.length).split("/");

    items.set(name, {
      name,
      path: `${prefix}${name}`,
      loadable: deeper.length === 0,
    });
  }

  return { body: { items: [...items.values()] } };
}

/**
 * Look a name up in a stand-in browser.
 * @param browser - Item paths per type
 * @param deviceName - The name to look up
 * @returns The resolution
 */
async function lookUpIn(
  browser: Browser,
  deviceName: string,
): Promise<Awaited<ReturnType<typeof lookUpBrowserDevice>>> {
  fake = await startFakeRemoteScript((request) => listing(browser, request));

  return await lookUpBrowserDevice(deviceName);
}

describe("lookUpBrowserDevice", () => {
  it("searches every section for the name", async () => {
    expect(
      await lookUpIn({ "audio-effect": ["Reverb"] }, "Reverb"),
    ).toStrictEqual({
      available: true,
      item: { type: "audio-effect", path: "Reverb", name: "Reverb" },
    });
    expect(
      fake?.requests
        .map(({ query }) => `${query.type}?q=${query.q}`)
        .toSorted(),
    ).toStrictEqual([
      "audio-effect?q=reverb",
      "instrument?q=reverb",
      "mfl-device?q=reverb",
      "midi-effect?q=reverb",
      "plugin?q=reverb",
    ]);
  });

  it("prefers an exact name to one containing it", async () => {
    const browser = {
      plugin: ["VST3/Valhalla/ValhallaReverb"],
      "audio-effect": ["Reverb"],
    };

    expect(await lookUpIn(browser, "reverb")).toStrictEqual({
      available: true,
      item: { type: "audio-effect", path: "Reverb", name: "Reverb" },
    });
  });

  it("falls back to a name containing it", async () => {
    expect(
      await lookUpIn({ plugin: ["VST3/Valhalla/ValhallaReverb"] }, "Valhalla"),
    ).toStrictEqual({
      available: true,
      item: {
        type: "plugin",
        path: "VST3/Valhalla/ValhallaReverb",
        name: "ValhallaReverb",
      },
    });
  });

  it("ignores a file suffix on either side", async () => {
    const browser = { "mfl-device": ["Max MIDI Effect/Mod Table.amxd"] };

    expect(await lookUpIn(browser, "Mod Table")).toStrictEqual({
      available: true,
      item: {
        type: "mfl-device",
        path: "Max MIDI Effect/Mod Table.amxd",
        name: "Mod Table.amxd",
      },
    });

    await fake?.close();

    expect(
      await lookUpIn({ "audio-effect": ["LFO"] }, "LFO.amxd"),
    ).toStrictEqual({
      available: true,
      item: { type: "audio-effect", path: "LFO", name: "LFO" },
    });
  });

  it("loads a plug-in's VST3 over its AU and VST", async () => {
    const plugin = [
      "VST/FabFilter/Pro-Q 4",
      "Audio Units/FabFilter/Pro-Q 4",
      "VST3/FabFilter/Pro-Q 4",
    ];

    expect(await lookUpIn({ plugin }, "Pro-Q 4")).toStrictEqual({
      available: true,
      item: { type: "plugin", path: "VST3/FabFilter/Pro-Q 4", name: "Pro-Q 4" },
    });
  });

  it("loads a plug-in's AU over its VST", async () => {
    const plugin = ["VST/FabFilter/Pro-L 2", "Audio Units/FabFilter/Pro-L 2"];

    expect(await lookUpIn({ plugin }, "Pro-L 2")).toStrictEqual({
      available: true,
      item: {
        type: "plugin",
        path: "Audio Units/FabFilter/Pro-L 2",
        name: "Pro-L 2",
      },
    });
  });

  it("refuses a name different things share, spelling each as a device", async () => {
    const browser = { plugin: ["VST3/Acme/Echo"], "audio-effect": ["Echo"] };

    expect(await lookUpIn(browser, "Echo")).toStrictEqual({
      available: true,
      error:
        'device "Echo" matches 2 devices; pass one of these as device: "Plug-Ins/VST3/Acme/Echo", "Audio Effects/Echo"',
    });
  });

  it("refuses two copies of a plug-in in one format, or in no format", async () => {
    const twoVst3 = { plugin: ["VST3/A/Pro-Q 4", "VST3/B/Pro-Q 4"] };

    expect(await lookUpIn(twoVst3, "Pro-Q 4")).toHaveProperty(
      "error",
      expect.stringContaining("matches 2 devices"),
    );

    await fake?.close();

    const noFormat = { plugin: ["VST3/A/Pro-Q 4", "Other/A/Pro-Q 4"] };

    expect(await lookUpIn(noFormat, "Pro-Q 4")).toHaveProperty(
      "error",
      expect.stringContaining("matches 2 devices"),
    );

    await fake?.close();

    // Sitting at the top of Plug-Ins, with no format folder to read at all.
    const noFolder = { plugin: ["VST3/A/Pro-Q 4", "Pro-Q 4"] };

    expect(await lookUpIn(noFolder, "Pro-Q 4")).toHaveProperty(
      "error",
      expect.stringContaining("matches 2 devices"),
    );
  });

  it("names only the first ten of a long list", async () => {
    const delays = Array.from({ length: 12 }, (_, i) => `Delay ${i + 1}`);
    const result = await lookUpIn({ "audio-effect": delays }, "delay");

    expect(result).toHaveProperty(
      "error",
      expect.stringMatching(
        /^device "delay" matches 12 devices; .*"Audio Effects\/Delay 10", and 2 more$/,
      ),
    );
  });

  it("refuses a name nothing has", async () => {
    expect(
      await lookUpIn({ "audio-effect": ["Reverb"] }, "Nope"),
    ).toStrictEqual({
      available: true,
      error:
        'invalid device "Nope": no native device, plug-in, or Max for Live device has that name',
    });
  });

  it("refuses a blank name without asking", async () => {
    expect(await lookUpIn({}, "  ")).toHaveProperty(
      "error",
      expect.stringContaining("invalid device"),
    );
    expect(fake?.requests).toStrictEqual([]);
  });

  it("ignores listing entries it can't use", async () => {
    fake = await startFakeRemoteScript(({ query }) => ({
      body: { items: query.type === "plugin" ? [{ name: "Reverb" }] : "none" },
    }));

    expect(await lookUpBrowserDevice("Reverb")).toHaveProperty(
      "error",
      expect.stringContaining("invalid device"),
    );
  });

  it("reports a search the remote script failed", async () => {
    fake = await startFakeRemoteScript(() => ({
      status: 504,
      body: { error: "Live did not run the request within 30.0s" },
    }));

    expect(await lookUpBrowserDevice("Reverb")).toStrictEqual({
      available: true,
      error:
        'could not search Live\'s browser for "Reverb": Live did not run the request within 30.0s',
    });
  });

  it("says so when the remote script isn't running", async () => {
    expect(await lookUpBrowserDevice("Reverb")).toStrictEqual({
      available: false,
    });
  });

  describe("a name starting with a browser section", () => {
    const plugin = ["VST/FabFilter/Pro-Q 4", "VST3/FabFilter/Pro-Q 4"];

    it("loads the item it spells, without searching", async () => {
      expect(
        await lookUpIn({ plugin }, "Plug-Ins/VST/FabFilter/Pro-Q 4"),
      ).toStrictEqual({
        available: true,
        item: {
          type: "plugin",
          path: "VST/FabFilter/Pro-Q 4",
          name: "Pro-Q 4",
        },
      });
      expect(fake?.requests.map(({ query }) => query)).toStrictEqual([
        { type: "plugin", recursive: "false", path: "VST/FabFilter" },
      ]);
    });

    it("reads the section and name in any case", async () => {
      expect(
        await lookUpIn({ "audio-effect": ["Reverb"] }, "audio effects/reverb"),
      ).toStrictEqual({
        available: true,
        item: { type: "audio-effect", path: "Reverb", name: "Reverb" },
      });
      expect(fake?.requests.map(({ query }) => query)).toStrictEqual([
        { type: "audio-effect", recursive: "false" },
      ]);
    });

    it("refuses a folder, a missing folder, or nothing after the section", async () => {
      for (const deviceName of [
        "Plug-Ins/VST3/FabFilter",
        "Plug-Ins/VST4/Pro-Q 4",
        "Plug-Ins/ ",
      ]) {
        expect(await lookUpIn({ plugin }, deviceName)).toStrictEqual({
          available: true,
          error: `invalid device "${deviceName}": no native device, plug-in, or Max for Live device has that name`,
        });

        await fake?.close();
      }
    });

    it("reports a listing the remote script failed", async () => {
      fake = await startFakeRemoteScript(() => ({
        status: 500,
        body: { error: "boom" },
      }));

      expect(await lookUpBrowserDevice("Plug-Ins/VST3/X")).toStrictEqual({
        available: true,
        error: 'could not search Live\'s browser for "Plug-Ins/VST3/X": boom',
      });
    });

    it("says so when the remote script isn't running", async () => {
      expect(await lookUpBrowserDevice("Plug-Ins/VST3/X")).toStrictEqual({
        available: false,
      });
    });
  });
});
