// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it } from "vitest";
import {
  lookUpBrowserDevice,
  normalizedName,
} from "../browser-device-lookup.ts";
import { RemoteScriptTimeout } from "../../remote-script-errors.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  OUTDATED_ANSWER,
  type ReceivedRequest,
  queriesAsked,
  startFakeRemoteScript,
  unknownRouteAnswer,
} from "../../tests/remote-script-test-helpers.ts";

/** Item paths under each remote script `type`. */
type Browser = Partial<Record<string, string[]>>;

let fake: FakeRemoteScript | undefined;

/** A deadline far enough off that no test hits it by accident. */
function inAMinute(): number {
  return Date.now() + 60_000;
}

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

  return await lookUpBrowserDevice(deviceName, inAMinute());
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
        format: "VST3",
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
      "AUv2/FabFilter/Pro-Q 4",
      "VST3/FabFilter/Pro-Q 4",
    ];

    expect(await lookUpIn({ plugin }, "Pro-Q 4")).toStrictEqual({
      available: true,
      item: {
        type: "plugin",
        path: "VST3/FabFilter/Pro-Q 4",
        name: "Pro-Q 4",
        format: "VST3",
      },
    });
  });

  it("loads a plug-in's AU over its VST", async () => {
    const plugin = ["VST/FabFilter/Pro-L 2", "AUv2/FabFilter/Pro-L 2"];

    expect(await lookUpIn({ plugin }, "Pro-L 2")).toStrictEqual({
      available: true,
      item: {
        type: "plugin",
        path: "AUv2/FabFilter/Pro-L 2",
        name: "Pro-L 2",
        format: "AU",
      },
    });
  });

  it("refuses a name different things share, spelling each as a device", async () => {
    const browser = { plugin: ["VST3/Acme/Echo"], "audio-effect": ["Echo"] };

    expect(await lookUpIn(browser, "Echo")).toStrictEqual({
      available: true,
      error:
        'deviceName "Echo" matches 2 devices; pass one of these as deviceName: "Plug-Ins/VST3/Acme/Echo", "Audio Effects/Echo"',
      candidates: [
        {
          type: "plugin",
          path: "VST3/Acme/Echo",
          name: "Echo",
          format: "VST3",
        },
        { type: "audio-effect", path: "Echo", name: "Echo" },
      ],
    });
  });

  it("refuses a name two makers' plug-ins share across formats", async () => {
    const plugin = ["VST3/Acme/Limiter", "AUv2/Other Co/Limiter"];

    expect(await lookUpIn({ plugin }, "Limiter")).toHaveProperty(
      "error",
      expect.stringContaining("matches 2 devices"),
    );

    await fake?.close();

    // A VST sits in no maker's folder, so it can't tell the makers apart.
    const withVst = ["VST/Limiter", "VST3/Acme/Limiter"];

    expect(await lookUpIn({ plugin: withVst }, "Limiter")).toHaveProperty(
      "item.path",
      "VST3/Acme/Limiter",
    );
  });

  it.each([
    ["Acme Audio", "Acme"],
    ["ACME", "Acme"],
  ])(
    "loads the VST3 when one maker's folders are spelled apart: %s, %s",
    async (vst3Maker, auMaker) => {
      const plugin = [`VST3/${vst3Maker}/Limiter`, `AUv2/${auMaker}/Limiter`];

      expect(await lookUpIn({ plugin }, "Limiter")).toHaveProperty(
        "item.path",
        `VST3/${vst3Maker}/Limiter`,
      );
    },
  );

  it("still refuses makers whose names only start alike", async () => {
    const plugin = ["VST3/Acmetone/Limiter", "AUv2/Acme/Limiter"];

    expect(await lookUpIn({ plugin }, "Limiter")).toHaveProperty(
      "error",
      expect.stringContaining("matches 2 devices"),
    );
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
        /^deviceName "delay" matches 12 devices; .*"Audio Effects\/Delay 10", and 2 more$/,
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
      notFound: true,
    });
  });

  it("marks only a name nothing has as not found, not an ambiguous one", async () => {
    expect(
      await lookUpIn({ "audio-effect": ["Delay A", "Delay B"] }, "delay"),
    ).not.toHaveProperty("notFound");
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

    expect(await lookUpBrowserDevice("Reverb", inAMinute())).toHaveProperty(
      "error",
      expect.stringContaining("invalid device"),
    );
  });

  it("reports a search the remote script failed", async () => {
    fake = await startFakeRemoteScript(() => ({
      status: 500,
      body: { error: "boom" },
    }));

    expect(await lookUpBrowserDevice("Reverb", inAMinute())).toStrictEqual({
      available: true,
      error: 'could not search Live\'s browser for "Reverb": boom',
    });
  });

  it("gives every section's search the one deadline", async () => {
    const remote = await startFakeRemoteScript(() => ({ body: { items: [] } }));

    fake = remote;

    const endsAt = Date.now() + 20_000;

    await lookUpBrowserDevice("Reverb", endsAt);

    const expiries = remote.requests.map(({ query }) =>
      Number(query.expires_in_ms),
    );

    expect(expiries).toHaveLength(5);

    for (const expiry of expiries) {
      expect(expiry).toBeGreaterThan(19_000);
      expect(expiry).toBeLessThanOrEqual(20_000);
    }
  });

  it("asks nothing once the deadline has passed", async () => {
    const remote = await startFakeRemoteScript(() => ({ body: { items: [] } }));

    fake = remote;

    await expect(
      lookUpBrowserDevice("Reverb", Date.now() - 1),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    await expect(
      lookUpBrowserDevice("Plug-Ins/VST3/X", Date.now() - 1),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
    expect(remote.requests).toStrictEqual([]);
  });

  it("times out when the remote script skips or abandons a listing", async () => {
    for (const error of [
      "the request expired before Live ran it; nothing changed, re-run it",
      "Live started the request but didn't finish it within 30.0s",
    ]) {
      fake = await startFakeRemoteScript(() => ({
        status: 504,
        body: { error },
      }));

      await expect(lookUpBrowserDevice("Reverb", inAMinute())).rejects.toThrow(
        error,
      );

      await fake.close();
    }
  });

  it("times out when the remote script doesn't answer in time", async () => {
    fake = await startFakeRemoteScript(() => null);

    await expect(
      lookUpBrowserDevice("Reverb", Date.now() + 100),
    ).rejects.toBeInstanceOf(RemoteScriptTimeout);
  });

  it("says so when the remote script isn't running", async () => {
    expect(await lookUpBrowserDevice("Reverb", inAMinute())).toStrictEqual({
      available: false,
    });
  });

  it("says so when the remote script is too old to have the route, not that nothing matched", async () => {
    fake = await startFakeRemoteScript(() => unknownRouteAnswer("/list"));

    expect(await lookUpBrowserDevice("Reverb", inAMinute())).toStrictEqual(
      OUTDATED_ANSWER,
    );
    expect(
      await lookUpBrowserDevice("Plug-Ins/VST3/X", inAMinute()),
    ).toStrictEqual(OUTDATED_ANSWER);
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
          format: "VST",
        },
      });
      expect(queriesAsked(fake)).toStrictEqual([
        { type: "plugin", recursive: "false", path: "VST/FabFilter" },
      ]);
    });

    describe("naming the format", () => {
      const installed = [
        "VST3/Xfer Records/Serum 2 FX",
        "AUv2/Xfer Records/Serum 2 FX",
        "VST/Serum 2 FX",
      ];
      const au = {
        available: true,
        item: {
          type: "plugin",
          path: "AUv2/Xfer Records/Serum 2 FX",
          name: "Serum 2 FX",
          format: "AU",
        },
      };

      it("reaches Live's AUv2 folder as AU, in any case", async () => {
        for (const spelled of ["AU", "au", "AUv2", "auv2"]) {
          expect(
            await lookUpIn(
              { plugin: installed },
              `Plug-Ins/${spelled}/Xfer Records/Serum 2 FX`,
            ),
          ).toStrictEqual(au);

          await fake?.close();
        }
      });

      it("lists the top folders only for a spelling Live doesn't use", async () => {
        await lookUpIn(
          { plugin: installed },
          "Plug-Ins/AU/Xfer Records/Serum 2 FX",
        );

        expect(queriesAsked(fake)).toStrictEqual([
          { type: "plugin", recursive: "false" },
          { type: "plugin", recursive: "false", path: "AUv2/Xfer Records" },
        ]);

        await fake?.close();
        await lookUpIn(
          { plugin: installed },
          "Plug-Ins/AUv2/Xfer Records/Serum 2 FX",
        );

        expect(queriesAsked(fake)).toStrictEqual([
          { type: "plugin", recursive: "false", path: "AUv2/Xfer Records" },
        ]);
      });

      it("loads the VST2, which has no vendor folder, by its folder", async () => {
        expect(
          await lookUpIn({ plugin: installed }, "Plug-Ins/VST/Serum 2 FX"),
        ).toStrictEqual({
          available: true,
          item: {
            type: "plugin",
            path: "VST/Serum 2 FX",
            name: "Serum 2 FX",
            format: "VST",
          },
        });
      });

      it("reads VST2 as the VST folder", async () => {
        expect(
          await lookUpIn({ plugin: installed }, "Plug-Ins/VST2/Serum 2 FX"),
        ).toStrictEqual({
          available: true,
          item: {
            type: "plugin",
            path: "VST/Serum 2 FX",
            name: "Serum 2 FX",
            format: "VST",
          },
        });
      });

      it("doesn't read a vendor that starts with AU as the format", async () => {
        await lookUpIn({ plugin: installed }, "Plug-Ins/Audio Damage/Dazzle");

        expect(queriesAsked(fake)).toStrictEqual([
          { type: "plugin", recursive: "false", path: "Audio Damage" },
          { type: "plugin", q: "dazzle" },
        ]);
      });

      it("lists every format's copy when the first folder is a vendor", async () => {
        const both = ["VST3/Audio Damage/Dazzle", "AUv2/Audio Damage/Dazzle"];

        expect(
          await lookUpIn({ plugin: both }, "Plug-Ins/Audio Damage/Dazzle"),
        ).toHaveProperty(
          "error",
          'invalid device "Plug-Ins/Audio Damage/Dazzle": no plug-in is at that path; Live lists it at "Plug-Ins/VST3/Audio Damage/Dazzle", "Plug-Ins/AUv2/Audio Damage/Dazzle"',
        );
      });

      it("refuses a format that isn't installed", async () => {
        const onlyVst3 = ["VST3/Xfer Records/Serum 2 FX"];

        expect(
          await lookUpIn(
            { plugin: onlyVst3 },
            "Plug-Ins/AU/Xfer Records/Serum 2 FX",
          ),
        ).toStrictEqual({
          available: true,
          error:
            'invalid device "Plug-Ins/AU/Xfer Records/Serum 2 FX": no plug-in is at that path; Live lists it at "Plug-Ins/VST3/Xfer Records/Serum 2 FX"',
          notFound: true,
        });
      });

      it("names the path in that format when the vendor folder is wrong", async () => {
        expect(
          await lookUpIn({ plugin: installed }, "Plug-Ins/AU/Serum/Serum 2 FX"),
        ).toStrictEqual({
          available: true,
          error:
            'invalid device "Plug-Ins/AU/Serum/Serum 2 FX": no plug-in is at that path; Live lists it at "Plug-Ins/AUv2/Xfer Records/Serum 2 FX"',
          notFound: true,
        });
      });

      it("keeps the plain refusal when the search for it fails", async () => {
        const name = "Plug-Ins/VST3/Serum/Serum 2 FX";
        const plain = {
          available: true,
          error: `invalid device "${name}": no native device, plug-in, or Max for Live device has that name`,
          notFound: true,
        };

        for (const status of [500, 504]) {
          fake = await startFakeRemoteScript((request) =>
            request.query.q == null
              ? listing({ plugin: installed }, request)
              : { status, body: { error: "boom" } },
          );

          expect(await lookUpBrowserDevice(name, inAMinute())).toStrictEqual(
            plain,
          );

          await fake.close();
        }
      });

      it("leaves a path under another section alone", async () => {
        await lookUpIn(
          { "audio-effect": ["AU/Reverb"] },
          "Audio Effects/AU/Reverb",
        );

        expect(queriesAsked(fake)).toStrictEqual([
          { type: "audio-effect", recursive: "false", path: "AU" },
        ]);
      });

      it("fails the way any listing does when the top folders can't be listed", async () => {
        fake = await startFakeRemoteScript(() => ({
          status: 500,
          body: { error: "boom" },
        }));

        const name = "Plug-Ins/AU/Xfer Records/Serum 2 FX";

        expect(await lookUpBrowserDevice(name, inAMinute())).toStrictEqual({
          available: true,
          error: `could not search Live's browser for "${name}": boom`,
        });

        await fake.close();
        fake = await startFakeRemoteScript(() => ({
          status: 504,
          body: { error: "the request expired before Live ran it" },
        }));

        await expect(lookUpBrowserDevice(name, inAMinute())).rejects.toThrow(
          "the request expired before Live ran it",
        );

        await fake.close();
        fake = undefined;

        expect(await lookUpBrowserDevice(name, inAMinute())).toStrictEqual({
          available: false,
        });
      });
    });

    it("reads the section and name in any case", async () => {
      expect(
        await lookUpIn({ "audio-effect": ["Reverb"] }, "audio effects/reverb"),
      ).toStrictEqual({
        available: true,
        item: { type: "audio-effect", path: "Reverb", name: "Reverb" },
      });
      expect(queriesAsked(fake)).toStrictEqual([
        { type: "audio-effect", recursive: "false" },
      ]);
    });

    it("refuses a folder, a missing folder, or nothing after the section", async () => {
      for (const deviceName of [
        "Plug-Ins/VST3/FabFilter",
        "Plug-Ins/VST4/Nothing",
        "Plug-Ins/ ",
      ]) {
        expect(await lookUpIn({ plugin }, deviceName)).toStrictEqual({
          available: true,
          error: `invalid device "${deviceName}": no native device, plug-in, or Max for Live device has that name`,
          notFound: true,
        });

        await fake?.close();
      }
    });

    it("reports a listing the remote script failed", async () => {
      fake = await startFakeRemoteScript(() => ({
        status: 500,
        body: { error: "boom" },
      }));

      expect(
        await lookUpBrowserDevice("Plug-Ins/VST3/X", inAMinute()),
      ).toStrictEqual({
        available: true,
        error: 'could not search Live\'s browser for "Plug-Ins/VST3/X": boom',
      });
    });

    it("says so when the remote script isn't running", async () => {
      expect(
        await lookUpBrowserDevice("Plug-Ins/VST3/X", inAMinute()),
      ).toStrictEqual({
        available: false,
      });
    });
  });
});

describe("normalizedName", () => {
  it("matches a name's '/' to the ':' a path writes for it", () => {
    expect(normalizedName("PP Test (3/4).adv")).toBe("pp test (3:4)");
    expect(normalizedName(" PP Test (3:4) ")).toBe("pp test (3:4)");
  });

  it("matches decomposed and composed accents", () => {
    expect(normalizedName("Te\u0301st.adg")).toBe(normalizedName("T\u00e9st"));
  });
});
