// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it } from "vitest";
import { lookUpBrowserDevice } from "../browser-device-lookup.ts";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";
import {
  type FakeRemoteScript,
  startFakeRemoteScript,
} from "../../tests/remote-script-test-helpers.ts";

const PATH = "Instruments/Instrument Rack/Mallets/Vibraphone.adg";
const ITEM = {
  name: "Vibraphone.adg",
  path: "Instrument Rack/Mallets/Vibraphone.adg",
};

let fake: FakeRemoteScript | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

/**
 * Stand up a browser whose Mallets folder lists these items.
 * @param items - What the folder lists
 */
async function mallets(items: object[]): Promise<void> {
  fake = await startFakeRemoteScript(() => ({ body: { items } }));
}

/**
 * Look a path up as a preset.
 * @param path - The browser path
 * @returns The resolution
 */
async function asPreset(
  path = PATH,
): Promise<Awaited<ReturnType<typeof lookUpBrowserPreset>>> {
  return await lookUpBrowserPreset(path, undefined, Date.now() + 60_000);
}

/**
 * Look the path up as a device name.
 * @returns The resolution
 */
async function asDevice(): Promise<
  Awaited<ReturnType<typeof lookUpBrowserDevice>>
> {
  return await lookUpBrowserDevice(PATH, Date.now() + 60_000);
}

const FOUND = {
  available: true,
  item: { type: "instrument", path: ITEM.path, name: ITEM.name },
};

describe("a browser path that two items share", () => {
  it("refuses a preset instead of taking the first", async () => {
    await mallets([ITEM, { ...ITEM }]);

    expect(await asPreset()).toStrictEqual({
      available: true,
      error: `preset "${PATH}" matches 2 items at that browser path; pass a file's absolute path from ppal-library as preset`,
    });
  });

  it("refuses a device name", async () => {
    await mallets([ITEM, { ...ITEM }]);

    expect(await asDevice()).toStrictEqual({
      available: true,
      error: `deviceName "${PATH}" matches 2 items at that browser path, so none was loaded`,
    });
  });

  it("counts every match", async () => {
    await mallets([ITEM, { ...ITEM }, { ...ITEM }]);

    expect(await asPreset()).toStrictEqual({
      available: true,
      error: `preset "${PATH}" matches 3 items at that browser path; pass a file's absolute path from ppal-library as preset`,
    });
  });

  it("loads the one item a path has", async () => {
    await mallets([ITEM, { name: "Marimba.adg", path: "Marimba.adg" }]);

    expect(await asPreset()).toStrictEqual(FOUND);
    expect(await asDevice()).toStrictEqual(FOUND);
  });

  it("takes the one a suffix names when a rack and a preset share a name", async () => {
    const preset = { name: "Vibraphone.adv", path: "Drift/Vibraphone.adv" };

    await mallets([{ ...ITEM, path: "Drift/Vibraphone.adg" }, preset]);

    expect(await asPreset("Instruments/Drift/Vibraphone.adv")).toStrictEqual({
      available: true,
      item: { type: "instrument", ...preset },
    });
  });

  it("refuses a name without a suffix that both share", async () => {
    await mallets([
      { ...ITEM, path: "Drift/Vibraphone.adg" },
      { name: "Vibraphone.adv", path: "Drift/Vibraphone.adv" },
    ]);

    expect(await asPreset("Instruments/Drift/Vibraphone")).toStrictEqual({
      available: true,
      error: `preset "Instruments/Drift/Vibraphone" matches 2 items at that browser path; pass a file's absolute path from ppal-library as preset`,
    });
  });

  it("doesn't count a duplicate that isn't loadable", async () => {
    await mallets([{ ...ITEM, loadable: false }, ITEM]);

    expect(await asPreset()).toStrictEqual(FOUND);
    expect(await asDevice()).toStrictEqual(FOUND);
  });
});
