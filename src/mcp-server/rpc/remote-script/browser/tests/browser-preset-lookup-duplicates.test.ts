// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { describe, expect, it, vi } from "vitest";
import { lookUpBrowserPreset } from "../browser-preset-lookup.ts";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import {
  type FakeAnswer,
  type ReceivedRequest,
} from "../../tests/remote-script-test-helpers.ts";
import { usePresetLookupStandIn } from "./preset-lookup-test-helpers.ts";

// The browser lists one "Transmission", under Shifter; the library has another
// in a pack, which the browser doesn't list.
vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));
// The pack-name mapping reads the machine's own library; keep paths as given.
vi.mock(import("../../../../live-library/query/pack-folder-names.ts"), () => ({
  browserNamedPackPath: (path: string) => Promise.resolve(path),
}));

const SHIFTER_FILE = {
  name: "Transmission.adv",
  path: "/Applications/Live/Core Library/Devices/Audio Effects/Shifter/Transmission.adv",
};
const PACK_FILE = {
  name: "Transmission.adv",
  path: "/Users/me/Factory Packs/Wasted Space/Presets/Transmission.adv",
};
const BROWSER_PATH = "Shifter/Transmission.adv";
const BOTH_REFUSED = {
  available: true,
  error:
    'preset "Transmission" matches 2 presets; pass one of these as preset: ' +
    `"${SHIFTER_FILE.path}", "${PACK_FILE.path}"`,
};
const BROWSER_MATCH = {
  available: true,
  item: { type: "audio-effect", path: BROWSER_PATH, name: "Transmission.adv" },
};

const SHIFTER: PresetScope = {
  type: "audio-effect",
  path: "Shifter",
  device: "Shifter",
};
const REVERB: PresetScope = {
  type: "audio-effect",
  path: "Reverb",
  device: "Reverb",
};
const MAX_DEVICE: PresetScope = {
  type: "mfl-device",
  path: "Foo",
  device: "Foo",
};

const standIn = usePresetLookupStandIn();

/**
 * Answer /list: Transmission is listed under Shifter only.
 * @param request - The request
 * @param request.query - Its query
 * @returns The answer
 */
function browserAnswer({ query }: ReceivedRequest): FakeAnswer {
  const underShifter =
    query.type === "audio-effect" &&
    (query.path == null || query.path === "Shifter");

  if (underShifter) {
    return {
      body: { items: [{ name: "Transmission.adv", path: BROWSER_PATH }] },
    };
  }

  return query.path == null
    ? { body: { items: [] } }
    : { status: 404, body: { error: `no '${query.path}'` } };
}

/**
 * Look a preset up in a browser that lists Transmission under Shifter only.
 * @param scope - The device to search under
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The resolution
 */
async function lookUp(
  scope?: PresetScope,
  endsAt = Date.now() + 60_000,
): Promise<Awaited<ReturnType<typeof lookUpBrowserPreset>>> {
  if (standIn.current() == null) {
    await standIn.start(browserAnswer);
  }

  return await lookUpBrowserPreset("Transmission", scope, endsAt);
}

describe("lookUpBrowserPreset — a name the browser lists once", () => {
  it("refuses when the library has several files by that name", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([SHIFTER_FILE, PACK_FILE]);

    expect(await lookUp()).toStrictEqual(BOTH_REFUSED);
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "transmission",
    });
  });

  it("refuses for a named device when it has several files by that name", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([SHIFTER_FILE, PACK_FILE]);

    expect(await lookUp(SHIFTER)).toStrictEqual(BOTH_REFUSED);
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "transmission",
      device: { name: "Shifter", kind: "audiofx" },
    });
  });

  it("loads the browser's match when the library has just the one", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([SHIFTER_FILE]);

    expect(await lookUp()).toStrictEqual(BROWSER_MATCH);
  });

  it("loads the browser's match when the library has none", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(await lookUp(SHIFTER)).toStrictEqual(BROWSER_MATCH);
  });

  it("loads the browser's match when the library can't be read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue(null);

    expect(await lookUp()).toStrictEqual(BROWSER_MATCH);
  });

  it("filters by the device when updating it finds the preset under it", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([SHIFTER_FILE]);

    expect(await lookUp({ ...SHIFTER, orAnywhere: true })).toStrictEqual(
      BROWSER_MATCH,
    );
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "transmission",
      device: { name: "Shifter", kind: "audiofx" },
    });
  });

  it("filters by nothing when updating a device found the preset anywhere", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([SHIFTER_FILE, PACK_FILE]);

    expect(await lookUp({ ...REVERB, orAnywhere: true })).toStrictEqual(
      BOTH_REFUSED,
    );
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "transmission",
    });
  });

  it("skips the library for a Max device, whose presets can't be told apart", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([SHIFTER_FILE, PACK_FILE]);
    await standIn.start(() => ({
      body: {
        items: [{ name: "Transmission.adv", path: "Foo/Transmission.adv" }],
      },
    }));

    expect(await lookUp(MAX_DEVICE)).toStrictEqual({
      available: true,
      item: {
        type: "mfl-device",
        path: "Foo/Transmission.adv",
        name: "Transmission.adv",
      },
    });
    expect(findPresetFiles).not.toHaveBeenCalled();
  });

  it("stops when the deadline passes before the library is checked", async () => {
    // The browser answers just after the deadline, within the wait the client
    // allows, so its search succeeds.
    let waited = false;

    await standIn.start((request) => {
      const until = waited ? 0 : Date.now() + 250;

      waited = true;

      while (Date.now() < until) {
        // Spin until the lookup's time is up.
      }

      return browserAnswer(request);
    });

    await expect(lookUp(undefined, Date.now() + 200)).rejects.toThrow(
      "ran out of time before the library was searched",
    );
    expect(findPresetFiles).not.toHaveBeenCalled();
  });
});
