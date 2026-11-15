// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Same-name plug-ins from different makers: a path's vendor folder picks one,
// exactly first, else loosely.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type BrowserPlugin } from "../../../../rpc/remote-script/browser/browser-plugins.ts";
import { resolvePlugin } from "../../../query/plugins/resolve-plugin.ts";
import {
  buildPluginDb,
  type PluginSeed,
  useTempDir,
} from "./plugin-db-fixture.ts";

vi.mock(
  import("../../../../rpc/remote-script/browser/browser-plugins.ts"),
  () => ({ listBrowserPlugins: vi.fn() }),
);

vi.mock(import("../../../live-db-path.ts"), () => ({
  findLiveFilesDbPath: vi.fn(),
  findLivePluginsDbPath: vi.fn(),
  liveDatabaseDir: vi.fn(),
}));

const dbPathMod = await import("../../../live-db-path.ts");
const browserMod =
  await import("../../../../rpc/remote-script/browser/browser-plugins.ts");

const DIR = "/Library/Audio/Plug-Ins";

const SEEDS: PluginSeed[] = [
  ["Verb", "Acme", 1, "device:vst3:audiofx:a", `${DIR}/VST3/VerbA.vst3`],
  ["Verb", "Beta", 1, "device:vst3:audiofx:b", `${DIR}/VST3/VerbB.vst3`],
  ["Hall", "Acme", 1, "device:vst:audiofx:1", `${DIR}/VST/HallA.vst`],
  ["Hall", "Beta", 1, "device:vst:audiofx:2", `${DIR}/VST/HallB.vst`],
  ["Room", "Acme Audio", 1, "device:vst3:audiofx:c", `${DIR}/VST3/RoomA.vst3`],
  ["Echo", "Acme", 1, "device:vst3:audiofx:i", `${DIR}/VST3/EchoA.vst3`],
  ["Echo", "Acme Audio", 1, "device:vst3:audiofx:j", `${DIR}/VST3/EchoB.vst3`],
  ["Room", "Beta", 1, "device:vst3:audiofx:d", `${DIR}/VST3/RoomB.vst3`],
];

/**
 * @param name - Its name
 * @param vendor - Its vendor folder (a VST2 has none)
 * @param format - Its format
 * @returns A plug-in in the browser's list
 */
function listed(
  name: string,
  vendor: string | null,
  format: BrowserPlugin["format"],
): BrowserPlugin {
  return { name, vendor, format };
}

describe("resolvePlugin with several makers of one name", () => {
  const tempDir = useTempDir("ppal-resolve-makers-");
  let auDir: string;
  let db: string;

  /**
   * Put a `.component` bundle in the fake AU folder.
   * @param bundle - Bundle name
   * @param name - The AU's name in its plist: "Vendor: Name"
   */
  function addBundle(bundle: string, name: string): void {
    const contents = join(auDir, `${bundle}.component`, "Contents");

    mkdirSync(contents, { recursive: true });
    writeFileSync(
      join(contents, "Info.plist"),
      `<plist><dict><key>AudioComponents</key><array><dict>
        <key>name</key><string>${name}</string><key>type</key><string>aufx</string>
      </dict></array></dict></plist>`,
    );
  }

  /**
   * @param plugins - What Live's browser lists
   */
  function browserLists(...plugins: BrowserPlugin[]): void {
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue(plugins);
  }

  beforeAll(() => {
    const dir = tempDir();

    auDir = join(dir, "Components");
    db = buildPluginDb(dir, SEEDS, true);
    addBundle("ChimeA", "Acme: Chime");
    addBundle("ChimeB", "Beta: Chime");
    addBundle("GongA", "Acme: Gong");
    addBundle("GongB", "Acme Audio: Gong");
  });

  beforeEach(() => {
    vi.mocked(dbPathMod.findLivePluginsDbPath).mockResolvedValue(db);
    vi.mocked(dbPathMod.findLiveFilesDbPath).mockResolvedValue(null);
    vi.mocked(browserMod.listBrowserPlugins).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("a path's vendor picks among them", () => {
    it.each([
      ["VST3", "Verb", "Acme", "VerbA.vst3"],
      ["VST3", "Verb", "Beta", "VerbB.vst3"],
    ])("in %s: %s by %s", async (_, name, vendor, file) => {
      browserLists(
        listed("Verb", "Acme", "VST3"),
        listed("Verb", "Beta", "VST3"),
      );

      await expect(
        resolvePlugin({ name: `Plug-Ins/VST3/${vendor}/${name}` }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({ vendor, file: `${DIR}/VST3/${file}` }),
      );
    });

    it("in VST2", async () => {
      browserLists(
        listed("Hall", "Acme", "VST"),
        listed("Hall", "Beta", "VST"),
      );

      await expect(
        resolvePlugin({ name: "Plug-Ins/VST/Beta/Hall" }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({ vendor: "Beta", format: "VST" }),
      );
    });

    it("in AU", async () => {
      browserLists(
        listed("Chime", "Acme", "AU"),
        listed("Chime", "Beta", "AU"),
      );

      await expect(
        resolvePlugin({ name: "Plug-Ins/AU/Beta/Chime" }, [auDir]),
      ).resolves.toStrictEqual(
        expect.objectContaining({
          vendor: "Beta",
          file: join(auDir, "ChimeB.component"),
        }),
      );
    });

    it("when the folder and the database spell the vendor a little apart", async () => {
      browserLists(
        listed("Room", "Acme", "VST3"),
        listed("Room", "Beta", "VST3"),
      );

      await expect(
        resolvePlugin({ name: "Plug-Ins/VST3/Acme/Room" }),
      ).resolves.toStrictEqual(
        expect.objectContaining({ vendor: "Acme Audio" }),
      );
    });

    it.each([
      ["Acme", "EchoA.vst3"],
      ["Acme Audio", "EchoB.vst3"],
    ])(
      "takes the exact vendor over a loose match in VST3: %s",
      async (vendor, file) => {
        browserLists(
          listed("Echo", "Acme", "VST3"),
          listed("Echo", "Acme Audio", "VST3"),
        );

        await expect(
          resolvePlugin({ name: `Plug-Ins/VST3/${vendor}/Echo` }),
        ).resolves.toStrictEqual(
          expect.objectContaining({ vendor, file: `${DIR}/VST3/${file}` }),
        );
      },
    );

    it.each([
      ["Acme", "GongA.component"],
      ["Acme Audio", "GongB.component"],
    ])(
      "takes the exact vendor over a loose match in AU: %s",
      async (vendor, bundle) => {
        browserLists(
          listed("Gong", "Acme", "AU"),
          listed("Gong", "Acme Audio", "AU"),
        );

        await expect(
          resolvePlugin({ name: `Plug-Ins/AU/${vendor}/Gong` }, [auDir]),
        ).resolves.toStrictEqual(
          expect.objectContaining({ file: join(auDir, bundle) }),
        );
      },
    );

    it("keeps today's error when the folder matches no maker", async () => {
      browserLists(
        listed("Verb", "Acme", "VST3"),
        listed("Verb", "Beta", "VST3"),
        listed("Verb", "Gamma", "VST3"),
      );

      await expect(
        resolvePlugin({ name: "Plug-Ins/VST3/Gamma/Verb" }),
      ).rejects.toThrow(
        'More than one VST3 plug-in is named "Verb" (vendors: Acme, Beta)',
      );
    });

    it("still refuses a bare name", async () => {
      browserLists(
        listed("Chime", "Acme", "AU"),
        listed("Chime", "Beta", "AU"),
      );

      await expect(resolvePlugin({ name: "Verb" })).rejects.toThrow(
        'More than one VST3 plug-in is named "Verb"',
      );
      await expect(resolvePlugin({ name: "Hall" })).rejects.toThrow(
        'More than one VST2 plug-in is named "Hall"',
      );
      await expect(resolvePlugin({ name: "Chime" }, [auDir])).rejects.toThrow(
        'More than one AU plug-in is named "Chime"',
      );
    });
  });
});
