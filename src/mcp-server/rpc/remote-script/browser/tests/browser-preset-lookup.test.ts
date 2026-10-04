// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";
import { RemoteScriptTimeout } from "../../remote-script-client.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  type ReceivedRequest,
  queriesAsked,
  startFakeRemoteScript,
} from "../../tests/remote-script-test-helpers.ts";

// A name the browser doesn't have is looked up in Live's database, which a test
// can't stand in for. The database's own queries are tested beside it.
vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));

/** Preset paths under each remote script `type`. */
type Browser = Partial<Record<string, string[]>>;

const BROWSER: Browser = {
  instrument: [
    "Wavetable/Bass/Abdominal Bass.adv",
    "Wavetable/Pad/Warm Pad.adv",
    "Analog/Pad/Warm Pad.adv",
    "Drift/Bass/808 Drifter.adg",
  ],
  "audio-effect": ["Reverb/Hall/Concert Hall.adv"],
};

const WAVETABLE: PresetScope = {
  type: "instrument",
  path: "Wavetable",
  device: "Wavetable",
};

let fake: FakeRemoteScript | undefined;

beforeEach(() => {
  vi.mocked(findPresetFiles).mockResolvedValue(null);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fake?.close();
  fake = undefined;
});

/**
 * Answer /list the way the remote script does: with `presets=true`, every
 * preset under `path` matching `q`; with `recursive=false`, one level.
 * @param browser - Preset paths per type
 * @param request - The request
 * @returns The answer
 */
function listing(browser: Browser, { query }: ReceivedRequest): FakeAnswer {
  const prefix = query.path == null ? "" : `${query.path}/`;
  const below = (browser[query.type ?? ""] ?? []).filter((path) =>
    path.startsWith(prefix),
  );

  if (below.length === 0 && prefix !== "") {
    return { status: 404, body: { error: `no '${query.path}'` } };
  }

  if (query.recursive === "false") {
    const names = new Set(
      below.map((path) => path.slice(prefix.length).split("/")[0] as string),
    );

    return {
      body: {
        items: [...names].map((name) => ({ name, path: `${prefix}${name}` })),
      },
    };
  }

  const q = (query.q ?? "").toLowerCase();
  const items = below
    .map((path) => ({ name: path.split("/").at(-1) as string, path }))
    .filter((item) => item.name.toLowerCase().includes(q));

  return { body: { items } };
}

/**
 * The resolution for a preset found at a path.
 * @param type - Its remote script type
 * @param path - Its path
 * @returns The resolution
 */
function found(type: string, path: string): unknown {
  return {
    available: true,
    item: { type, path, name: path.split(/[\\/]/).at(-1) },
  };
}

/**
 * Look a preset up in a stand-in browser.
 * @param preset - The preset arg
 * @param scope - The device to search under
 * @returns The resolution
 */
async function lookUp(
  preset: string,
  scope?: PresetScope,
): Promise<Awaited<ReturnType<typeof lookUpBrowserPreset>>> {
  fake ??= await startFakeRemoteScript((request) => listing(BROWSER, request));

  return await lookUpBrowserPreset(preset, scope, Date.now() + 60_000);
}

describe("lookUpBrowserPreset — a name", () => {
  it("finds a preset in any section, asking only for presets", async () => {
    expect(await lookUp("Concert Hall")).toStrictEqual({
      available: true,
      item: {
        type: "audio-effect",
        path: "Reverb/Hall/Concert Hall.adv",
        name: "Concert Hall.adv",
      },
    });
    // Every section but Plug-Ins, which lists no presets.
    expect(queriesAsked(fake)).toStrictEqual(
      ["mfl-device", "instrument", "audio-effect", "midi-effect"].map(
        (type) => ({ type, presets: "true", q: "concert hall" }),
      ),
    );
  });

  it("searches only under the device a call named", async () => {
    expect(await lookUp("Warm Pad", WAVETABLE)).toStrictEqual({
      available: true,
      item: {
        type: "instrument",
        path: "Wavetable/Pad/Warm Pad.adv",
        name: "Warm Pad.adv",
      },
    });
    expect(fake?.requests).toHaveLength(1);
    expect(queriesAsked(fake)[0]).toStrictEqual({
      type: "instrument",
      presets: "true",
      q: "warm pad",
      path: "Wavetable",
    });
  });

  it("lists the candidates, spelled as preset args, for several matches", async () => {
    expect(await lookUp("warm pad")).toStrictEqual({
      available: true,
      error:
        'preset "warm pad" matches 2 presets; pass one of these as preset: ' +
        '"Instruments/Wavetable/Pad/Warm Pad.adv", "Instruments/Analog/Pad/Warm Pad.adv"',
    });
  });

  it("loads nothing for a name that is only part of a preset's", async () => {
    expect(await lookUp("Abdominal")).toStrictEqual({
      available: true,
      error:
        'no preset "Abdominal". Close matches, to pass as preset: "Instruments/Wavetable/Bass/Abdominal Bass.adv"',
    });
  });

  it("offers the close matches from everywhere after falling back", async () => {
    expect(
      await lookUp("Drifter", { ...WAVETABLE, orAnywhere: true }),
    ).toStrictEqual({
      available: true,
      error:
        'no preset "Drifter". Close matches, to pass as preset: "Instruments/Drift/Bass/808 Drifter.adg"',
    });
  });

  it("says a device has no such preset, and where to look", async () => {
    expect(await lookUp("Concert Hall", WAVETABLE)).toStrictEqual({
      available: true,
      error:
        'no preset "Concert Hall" for Wavetable. Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("reads a device with no preset folder as having no presets", async () => {
    const result = await lookUp("Warm Pad", {
      type: "instrument",
      path: "Drum Sampler",
      device: "DrumSampler",
    });

    expect(result).toStrictEqual({
      available: true,
      error:
        'no preset "Warm Pad" for DrumSampler. Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("falls back to every preset when the device has none by that name", async () => {
    expect(
      await lookUp("808 Drifter", { ...WAVETABLE, orAnywhere: true }),
    ).toStrictEqual(found("instrument", "Drift/Bass/808 Drifter.adg"));
    expect(fake?.requests).toHaveLength(5);
  });

  it("stops at the device when the fallback isn't needed", async () => {
    await lookUp("Abdominal Bass", { ...WAVETABLE, orAnywhere: true });

    expect(fake?.requests).toHaveLength(1);
  });

  it("names no device when the fallback finds nothing either", async () => {
    expect(
      await lookUp("Nope", { ...WAVETABLE, orAnywhere: true }),
    ).toStrictEqual({
      available: true,
      error:
        'no preset "Nope". Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("refuses a blank name without asking the remote script", async () => {
    expect(await lookUp(" .adv ")).toStrictEqual({
      available: true,
      error:
        'no preset " .adv ". Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
    expect(fake?.requests).toHaveLength(0);
  });

  it("reports a search the remote script failed", async () => {
    fake = await startFakeRemoteScript(() => ({
      status: 500,
      body: { error: "boom" },
    }));

    expect(await lookUp("Warm Pad")).toStrictEqual({
      available: true,
      error: `could not search Live's browser for "Warm Pad": boom`,
    });
  });

  it("answers unavailable when nothing is listening", async () => {
    expect(
      await lookUpBrowserPreset("Warm Pad", undefined, Date.now() + 60_000),
    ).toStrictEqual({
      available: false,
    });
  });

  it("reports a fallback search the remote script failed", async () => {
    fake = await startFakeRemoteScript((request) =>
      request.query.path == null
        ? { status: 500, body: { error: "boom" } }
        : listing(BROWSER, request),
    );

    expect(
      await lookUp("808 Drifter", { ...WAVETABLE, orAnywhere: true }),
    ).toStrictEqual({
      available: true,
      error: `could not search Live's browser for "808 Drifter": boom`,
    });
  });

  it("searches nothing for a device whose type lists no presets", async () => {
    const result = await lookUp("Warm Pad", {
      type: "plugin",
      path: "Serum",
      device: "Serum",
    });

    expect(result).toStrictEqual({
      available: true,
      error:
        'no preset "Warm Pad" for Serum. Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
    expect(fake?.requests).toHaveLength(0);
  });
});

describe("lookUpBrowserPreset — a name only the library has", () => {
  const KIT = {
    name: "505 Classic Kit.adg",
    path: "/Users/me/Music/Ableton/Factory Packs/Drum Essentials/Drums/Drum Machines/505 Classic Kit.adg",
  };

  it("loads the one file with that name", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([KIT]);

    expect(await lookUp("505 Classic Kit")).toStrictEqual({
      available: true,
      item: { type: "file", path: KIT.path, name: KIT.name },
    });
    expect(findPresetFiles).toHaveBeenCalledWith({ name: "505 classic kit" });
  });

  it("looks the name up as the browser compares it", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([KIT]);
    await lookUp("  505 CLASSIC Kit.adg ");

    expect(findPresetFiles).toHaveBeenCalledWith({ name: "505 classic kit" });
  });

  it("lists the files, spelled as preset args, for several", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([
      KIT,
      { name: "505 Classic Kit.adg", path: "/Users/me/User Library/Kit.adg" },
    ]);

    expect(await lookUp("505 Classic Kit")).toStrictEqual({
      available: true,
      error:
        'preset "505 Classic Kit" matches 2 presets; pass one of these as preset: ' +
        `"${KIT.path}", "/Users/me/User Library/Kit.adg"`,
    });
  });

  it("keeps the no-preset error when the library has none", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(await lookUp("505 Classic Kit")).toStrictEqual({
      available: true,
      error:
        'no preset "505 Classic Kit". Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("keeps the no-preset error when the library can't be read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue(null);

    expect(await lookUp("505 Classic Kit")).toStrictEqual({
      available: true,
      error:
        'no preset "505 Classic Kit". Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("offers the browser's close matches when the library has none", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(await lookUp("Abdominal")).toStrictEqual({
      available: true,
      error:
        'no preset "Abdominal". Close matches, to pass as preset: "Instruments/Wavetable/Bass/Abdominal Bass.adv"',
    });
  });

  it("doesn't ask the library when the browser has the name", async () => {
    await lookUp("Concert Hall");

    expect(findPresetFiles).not.toHaveBeenCalled();
  });

  it("asks only for presets for the device a call named", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([KIT]);

    const rack: PresetScope = {
      type: "instrument",
      path: "Drum Rack",
      device: "Drum Rack",
    };

    expect(await lookUp("505 Classic Kit", rack)).toStrictEqual({
      available: true,
      item: { type: "file", path: KIT.path, name: KIT.name },
    });
    expect(findPresetFiles).toHaveBeenCalledWith({
      name: "505 classic kit",
      device: { name: "Drum Rack", kind: "instrument" },
    });
  });

  it("reads each kind of device as its own kind of presets", async () => {
    await lookUp("Nope", {
      type: "audio-effect",
      path: "Reverb",
      device: "Reverb",
    });
    await lookUp("Nope", {
      type: "midi-effect",
      path: "Arpeggiator",
      device: "Arpeggiator",
    });

    expect(
      vi
        .mocked(findPresetFiles)
        .mock.calls.map(([query]) => query.device?.kind),
    ).toStrictEqual(["audiofx", "midifx"]);
  });

  it("asks for the device's presets first when updating a device", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([KIT]);
    await lookUp("505 Classic Kit", { ...WAVETABLE, orAnywhere: true });

    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "505 classic kit",
      device: { name: "Wavetable", kind: "instrument" },
    });
  });

  it("asks for any preset only when the device has none by that name", async () => {
    vi.mocked(findPresetFiles)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([KIT]);

    expect(
      await lookUp("505 Classic Kit", { ...WAVETABLE, orAnywhere: true }),
    ).toStrictEqual({
      available: true,
      item: { type: "file", path: KIT.path, name: KIT.name },
    });
    expect(vi.mocked(findPresetFiles).mock.calls).toStrictEqual([
      [
        {
          name: "505 classic kit",
          device: { name: "Wavetable", kind: "instrument" },
        },
      ],
      [{ name: "505 classic kit" }],
    ]);
  });

  it("asks for any preset on a plug-in in the Set, which has no class to filter by", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([KIT]);
    await lookUp("505 Classic Kit", {
      type: "plugin",
      path: "VST3/Pro-Q 4",
      device: "Pro-Q 4",
      orAnywhere: true,
    });

    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "505 classic kit",
    });
  });

  it("names no device in the error when updating a device finds nothing", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(
      await lookUp("Nope", { ...WAVETABLE, orAnywhere: true }),
    ).toStrictEqual({
      available: true,
      error:
        'no preset "Nope". Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("leaves a plug-in's or Max device's presets to the browser", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([KIT]);

    expect(
      await lookUp("505 Classic Kit", {
        type: "plugin",
        path: "VST3/Pro-Q 4",
        device: "Pro-Q 4",
      }),
    ).toStrictEqual({
      available: true,
      error:
        'no preset "505 Classic Kit" for Pro-Q 4. Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
    expect(findPresetFiles).not.toHaveBeenCalled();
  });

  it("stops when the deadline passes before the library is read", async () => {
    // The browser answers after the lookup's time is up, but within the wait
    // the client allows, so the search itself succeeds.
    fake = await startFakeRemoteScript((request) => {
      const until = Date.now() + 250;

      while (Date.now() < until) {
        // Wait out the deadline.
      }

      return listing(BROWSER, request);
    });

    await expect(
      lookUpBrowserPreset("Nope", undefined, Date.now() + 200),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    expect(findPresetFiles).not.toHaveBeenCalled();
  });
});

describe("lookUpBrowserPreset — time", () => {
  it("shares one deadline between the scoped and the anywhere search", async () => {
    // Nothing under Wavetable matches, so the second search runs: both draw on
    // the same deadline, not a fresh one each.
    const remote = await startFakeRemoteScript(() => ({ body: { items: [] } }));

    fake = remote;

    await lookUpBrowserPreset(
      "Warm Pad",
      { ...WAVETABLE, orAnywhere: true },
      Date.now() + 20_000,
    );

    const expiries = remote.requests
      .filter(({ route }) => route === "/list")
      .map(({ query }) => Number(query.expires_in_ms));

    expect(expiries.length).toBeGreaterThan(1);
    expect(expiries.every((ms) => ms > 19_000 && ms <= 20_000)).toBe(true);
  });

  it("asks nothing once the deadline has passed", async () => {
    const remote = await startFakeRemoteScript(() => ({ body: { items: [] } }));

    fake = remote;

    await expect(
      lookUpBrowserPreset("Warm Pad", undefined, Date.now() - 1),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    expect(remote.requests).toStrictEqual([]);
  });

  it("times out when the remote script skips a search", async () => {
    fake = await startFakeRemoteScript(() => ({
      status: 504,
      body: { error: "the request expired before Live ran it" },
    }));

    await expect(lookUp("Warm Pad")).rejects.toThrow("expired before Live");
  });
});

describe("lookUpBrowserPreset — a browser path", () => {
  it("finds the preset a section-prefixed path spells", async () => {
    expect(
      await lookUp("Instruments/Wavetable/Pad/Warm Pad", WAVETABLE),
    ).toStrictEqual(found("instrument", "Wavetable/Pad/Warm Pad.adv"));
  });

  it("says so when nothing is at the path", async () => {
    expect(
      await lookUp("Instruments/Wavetable/Pad/Nope", WAVETABLE),
    ).toStrictEqual({
      available: true,
      error:
        'no preset "Instruments/Wavetable/Pad/Nope" for Wavetable. Search ppal-library (kind: preset or device-group) and pass a result\'s path as preset',
    });
  });

  it("refuses a path under another device than the call named", async () => {
    expect(
      await lookUp("Instruments/Analog/Pad/Warm Pad", WAVETABLE),
    ).toStrictEqual({
      available: true,
      error:
        'preset "Instruments/Analog/Pad/Warm Pad" is not a preset for Wavetable',
    });
  });

  it("takes a path under any device for a device in the Set", async () => {
    expect(
      await lookUp("Instruments/Analog/Pad/Warm Pad", {
        ...WAVETABLE,
        orAnywhere: true,
      }),
    ).toStrictEqual(found("instrument", "Analog/Pad/Warm Pad.adv"));
  });
});

describe("lookUpBrowserPreset — a file", () => {
  it("passes a preset file through for the remote script to find", async () => {
    expect(
      await lookUpBrowserPreset(
        "/Packs/Drums/808 Kit.adg",
        undefined,
        Date.now(),
      ),
    ).toStrictEqual({
      available: true,
      item: {
        type: "file",
        path: "/Packs/Drums/808 Kit.adg",
        name: "808 Kit.adg",
      },
    });
  });

  it("takes a Windows path", async () => {
    expect(
      await lookUpBrowserPreset("C:\\Packs\\Pad.adv", undefined, Date.now()),
    ).toStrictEqual(found("file", "C:\\Packs\\Pad.adv"));
  });

  it("refuses a file that isn't a preset", async () => {
    expect(
      await lookUpBrowserPreset("/Samples/kick.wav", undefined, Date.now()),
    ).toStrictEqual({
      available: true,
      error: 'preset "/Samples/kick.wav" is not a preset file (.adv or .adg)',
    });
  });
});
