// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";
import { presetFileIsFor } from "../preset-file-device.ts";
import { RemoteScriptTimeout } from "../../remote-script-errors.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  type ReceivedRequest,
  startFakeRemoteScript,
} from "../../tests/remote-script-test-helpers.ts";

// The browser lists a rack under every device it is built around, so a name
// can have several browser matches for one file, or for files that share a
// browser path. The library says which files there are.
vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));
vi.mock(import("../preset-file-device.ts"), () => ({
  presetFileIsFor: vi.fn(),
}));

const CORE = {
  name: "Vibraphone.adg",
  path: "/Live/Core Library/Racks/Instrument Racks/Mallets/Vibraphone.adg",
};
const PACK = {
  name: "Vibraphone.adg",
  path: "/Packs/Cinematic Percussion/Presets/Orchestral Percussion/Mallets/Vibraphone.adg",
};
const BASS = {
  name: "Electric Bass.adg",
  path: "/Live/Core Library/Racks/Instrument Racks/Bass/Electric Bass.adg",
};
const BASS_PATHS = [
  "Instrument Rack/Bass/Electric Bass.adg",
  "Sampler/Bass/Electric Bass.adg",
];
const BOTH_REFUSED = {
  available: true,
  error:
    'preset "Vibraphone" matches 2 presets; pass one of these as preset: ' +
    `"${CORE.path}", "${PACK.path}"`,
};
const BROWSER_REFUSED = {
  available: true,
  error:
    'preset "Vibraphone" matches 4 presets; pass one of these as preset: ' +
    '"Instruments/Instrument Rack/Mallets/Vibraphone.adg", ' +
    '"Instruments/Instrument Rack/Mallets/Vibraphone.adg", ' +
    '"Instruments/Simpler/Mallets/Vibraphone.adg", ' +
    '"Instruments/Simpler/Mallets/Vibraphone.adg"',
};

const SIMPLER: PresetScope = {
  type: "instrument",
  path: "Simpler",
  device: "Simpler",
};

let fake: FakeRemoteScript | undefined;

beforeEach(() => {
  vi.mocked(findPresetFiles).mockReset();
  vi.mocked(findPresetFiles).mockResolvedValue(null);
  vi.mocked(presetFileIsFor).mockReset();
  vi.mocked(presetFileIsFor).mockResolvedValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fake?.close();
  fake = undefined;
});

/**
 * Answer /list: Vibraphone is listed twice under each of two racks' devices.
 * @param request - The request
 * @param request.query - Its query
 * @returns The answer
 */
function browserAnswer({ query }: ReceivedRequest): FakeAnswer {
  if (query.type !== "instrument") {
    return query.path == null
      ? { body: { items: [] } }
      : { status: 404, body: { error: `no '${query.path}'` } };
  }

  const under = (device: string): Array<{ name: string; path: string }> =>
    query.path == null || query.path === device
      ? [1, 2].map(() => ({
          name: "Vibraphone.adg",
          path: `${device}/Mallets/Vibraphone.adg`,
        }))
      : [];

  return {
    body: {
      items: [
        ...under(query.path === "Simpler" ? "Simpler" : "Instrument Rack"),
        ...(query.path == null ? under("Simpler") : []),
      ],
    },
  };
}

/**
 * Look Vibraphone up in a browser that lists it several times.
 * @param scope - The device to search under
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The resolution
 */
async function lookUp(
  scope?: PresetScope,
  endsAt = Date.now() + 60_000,
): Promise<Awaited<ReturnType<typeof lookUpBrowserPreset>>> {
  fake ??= await startFakeRemoteScript(browserAnswer);

  return await lookUpBrowserPreset("Vibraphone", scope, endsAt);
}

/**
 * Look Electric Bass up in a browser that lists the given instrument paths.
 * @param paths - The browser paths it lists
 * @returns The resolution
 */
async function lookUpBass(
  paths: string[],
): Promise<Awaited<ReturnType<typeof lookUpBrowserPreset>>> {
  fake = await startFakeRemoteScript(({ query }) => ({
    body: {
      items:
        query.type === "instrument"
          ? paths.map((path) => ({ name: "Electric Bass.adg", path }))
          : [],
    },
  }));

  return await lookUpBrowserPreset(
    "Electric Bass",
    undefined,
    Date.now() + 60_000,
  );
}

describe("lookUpBrowserPreset — a name the browser lists several times", () => {
  it("lists the library's files when there are several", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);

    expect(await lookUp()).toStrictEqual(BOTH_REFUSED);
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "vibraphone",
    });
    expect(presetFileIsFor).not.toHaveBeenCalled();
  });

  it("keeps the browser's paths for one library file when a folder lists the name twice", async () => {
    // Two matches at one browser path are two files; the library has one.
    vi.mocked(findPresetFiles).mockResolvedValue([CORE]);

    expect(await lookUp()).toStrictEqual(BROWSER_REFUSED);
  });

  it("loads the one file the library has, which the browser listed under two devices", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([BASS]);

    expect(await lookUpBass(BASS_PATHS)).toStrictEqual({
      available: true,
      item: { type: "file", path: BASS.path, name: BASS.name },
    });
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "electric bass",
    });
  });

  it("matches the file's ending in any case, and a Windows path", async () => {
    const path = "C:\\Live\\racks\\BASS\\electric bass.ADG";

    vi.mocked(findPresetFiles).mockResolvedValue([{ ...BASS, path }]);

    expect(await lookUpBass(BASS_PATHS)).toStrictEqual({
      available: true,
      item: { type: "file", path, name: "electric bass.ADG" },
    });
  });

  it("keeps the browser's paths when the matches differ below their device folders", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([BASS]);

    expect(
      await lookUpBass([
        "Instrument Rack/Bass/Electric Bass.adg",
        "Sampler/Old/Electric Bass.adg",
      ]),
    ).toStrictEqual({
      available: true,
      error:
        'preset "Electric Bass" matches 2 presets; pass one of these as preset: ' +
        '"Instruments/Instrument Rack/Bass/Electric Bass.adg", "Instruments/Sampler/Old/Electric Bass.adg"',
    });
  });

  it("keeps the browser's paths when the library file doesn't end with their shared path", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([
      { name: "Electric Bass.adg", path: "/Live/racks/Pad/Electric Bass.adg" },
    ]);

    expect(await lookUpBass(BASS_PATHS)).toStrictEqual({
      available: true,
      error:
        'preset "Electric Bass" matches 2 presets; pass one of these as preset: ' +
        '"Instruments/Instrument Rack/Bass/Electric Bass.adg", "Instruments/Sampler/Bass/Electric Bass.adg"',
    });
  });

  it("keeps the browser's paths when the library has none", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(await lookUp()).toStrictEqual(BROWSER_REFUSED);
  });

  it("keeps the browser's paths when the library can't be read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue(null);

    expect(await lookUp()).toStrictEqual(BROWSER_REFUSED);
  });

  it("keeps files for the named device, asking the library for every device's", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);
    vi.mocked(presetFileIsFor).mockImplementation(
      async (path) => path === CORE.path,
    );

    // One file stays, but the browser's two matches are in one folder.
    expect(await lookUp(SIMPLER)).toStrictEqual({
      available: true,
      error:
        'preset "Vibraphone" matches 2 presets; pass one of these as preset: ' +
        '"Instruments/Simpler/Mallets/Vibraphone.adg", "Instruments/Simpler/Mallets/Vibraphone.adg"',
    });
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "vibraphone",
    });
    expect(vi.mocked(presetFileIsFor).mock.calls).toStrictEqual([
      [CORE.path, "Simpler"],
      [PACK.path, "Simpler"],
    ]);
  });

  it("lists every file for the named device", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);

    expect(await lookUp(SIMPLER)).toStrictEqual(BOTH_REFUSED);
  });

  it("filters the same way for a device found while updating it, keeping the browser's paths when none stay", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);
    vi.mocked(presetFileIsFor).mockResolvedValue(false);

    expect(await lookUp({ ...SIMPLER, orAnywhere: true })).toStrictEqual({
      available: true,
      error:
        'preset "Vibraphone" matches 2 presets; pass one of these as preset: ' +
        '"Instruments/Simpler/Mallets/Vibraphone.adg", "Instruments/Simpler/Mallets/Vibraphone.adg"',
    });
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "vibraphone",
    });
  });

  it("does not filter when updating found the name anywhere", async () => {
    // Nothing under Reverb matches, so the search ran everywhere.
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);

    expect(
      await lookUp({
        type: "audio-effect",
        path: "Reverb",
        device: "Reverb",
        orAnywhere: true,
      }),
    ).toStrictEqual(BOTH_REFUSED);
    expect(presetFileIsFor).not.toHaveBeenCalled();
  });

  it("leaves a Max device's presets to the browser", async () => {
    fake = await startFakeRemoteScript(() => ({
      body: {
        items: [
          { name: "Vibraphone.adg", path: "Foo/Vibraphone.adg" },
          { name: "Vibraphone.adg", path: "Foo/Other/Vibraphone.adg" },
        ],
      },
    }));
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);

    expect(
      await lookUp({ type: "mfl-device", path: "Foo", device: "Foo" }),
    ).toStrictEqual({
      available: true,
      error:
        'preset "Vibraphone" matches 2 presets; pass one of these as preset: ' +
        '"Max for Live/Foo/Vibraphone.adg", "Max for Live/Foo/Other/Vibraphone.adg"',
    });
    expect(findPresetFiles).not.toHaveBeenCalled();
  });

  it("stops when the deadline passes after the browser answers", async () => {
    // The clock jumps once the stand-in has answered, so the search succeeds.
    const realNow = Date.now.bind(Date);
    let answered = false;

    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (answered ? 60_000 : 0),
    );
    fake = await startFakeRemoteScript((request) => {
      answered = true;

      return browserAnswer(request);
    });

    await expect(lookUp(undefined, realNow() + 30_000)).rejects.toBeInstanceOf(
      RemoteScriptTimeout,
    );
    expect(findPresetFiles).not.toHaveBeenCalled();
  });

  it("stops when the deadline passes while the files are read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([CORE, PACK]);

    const realNow = Date.now.bind(Date);
    let read = false;

    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (read ? 60_000 : 0),
    );
    vi.mocked(presetFileIsFor).mockImplementation(async () => {
      read = true;

      return true;
    });

    await expect(lookUp(SIMPLER, realNow() + 30_000)).rejects.toThrow(
      "ran out of time before the library's files were read",
    );
  });
});
