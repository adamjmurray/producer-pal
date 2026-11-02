// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listDeviceFiles } from "./device-file-list.ts";
import { type PatcherBox } from "./patcher-references.ts";

let root: string;
let deviceDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ppal-device-files-"));
  deviceDir = join(root, "device");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Write files (any text) under the root.
function write(...paths: string[]): void {
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "x");
  }
}

// Write a .maxpat that uses the given boxes.
function writePatcher(name: string, ...boxes: PatcherBox[]): void {
  mkdirSync(deviceDir, { recursive: true });
  writeFileSync(
    join(deviceDir, name),
    JSON.stringify({ patcher: { boxes: boxes.map((box) => ({ box })) } }),
  );
}

// Build a project manifest. Names with a slash in `other` get a singleton path.
function patcherWith(sections: {
  patchers?: string[];
  media?: string[];
  other?: string[];
}): Parameters<typeof listDeviceFiles>[1] {
  const entries = (names: string[] = []): Record<string, object> =>
    Object.fromEntries(
      names.map((n) => {
        const [folder, name] = n.includes("|") ? n.split("|") : [undefined, n];

        return [
          name,
          folder == null ? {} : { singleton: { projectrelativepath: folder } },
        ];
      }),
    );

  return {
    boxes: [
      { box: { maxclass: "newobj", text: "v8 ./adapter.js" } },
      { box: { maxclass: "newobj", text: "node.script ./srv.mjs @watch 1" } },
    ],
    project: {
      contents: {
        patchers: entries(sections.patchers),
        media: entries(sections.media),
        other: entries(sections.other),
      },
    },
  };
}

describe("listDeviceFiles", () => {
  it("lists patchers, then box scripts, then media and other files, each reversed", () => {
    writePatcher("a.maxpat");
    writePatcher("b.maxpat");
    write(
      "device/srv.mjs",
      "device/adapter.js",
      "device/m1.png",
      "device/m2.png",
    );
    write("device/o1", "lic/o2", "device/o3");
    const { files } = listDeviceFiles(
      deviceDir,
      patcherWith({
        patchers: ["a.maxpat", "b.maxpat"],
        media: ["m1.png", "m2.png"],
        other: ["o1", "../lic|o2", "o3"],
      }),
    );

    expect(files.map((f) => f.name)).toStrictEqual([
      "b.maxpat",
      "a.maxpat",
      "srv.mjs",
      "adapter.js",
      "m2.png",
      "m1.png",
      "o3",
      "o2",
      "o1",
    ]);
    expect(files.find((f) => f.name === "o2")?.path).toBe(
      join(deviceDir, "../lic", "o2"),
    );
  });

  it("puts a patcher's references right after it, following nested patchers", () => {
    writePatcher("top.maxpat", { maxclass: "bpatcher", name: "mid.maxpat" });
    writePatcher(
      "mid.maxpat",
      { maxclass: "fpic", pic: "a.svg" },
      { maxclass: "bpatcher", name: "leaf.maxpat" },
    );
    writePatcher("leaf.maxpat");
    writePatcher("other.maxpat");
    write("device/a.svg", "device/srv.mjs", "device/adapter.js");
    const { files } = listDeviceFiles(
      deviceDir,
      patcherWith({ patchers: ["other.maxpat", "top.maxpat"] }),
    );

    expect(files.map((f) => f.name)).toStrictEqual([
      "top.maxpat",
      "mid.maxpat",
      "leaf.maxpat",
      "a.svg",
      "other.maxpat",
      "srv.mjs",
      "adapter.js",
    ]);
  });

  it("lists a shared file once and marks the node.script file", () => {
    writePatcher("p.maxpat", { maxclass: "newobj", text: "v8 ./adapter.js" });
    write("device/srv.mjs", "device/adapter.js");
    const { files } = listDeviceFiles(
      deviceDir,
      patcherWith({ patchers: ["p.maxpat"] }),
    );

    expect(files.map((f) => f.name)).toStrictEqual([
      "p.maxpat",
      "adapter.js",
      "srv.mjs",
    ]);
    expect(files.map((f) => f.nodeScript)).toStrictEqual([false, false, true]);
  });

  it.each(["patchers", "media", "other"] as const)(
    "refuses a %s project entry that is not on disk",
    (section) => {
      write("device/srv.mjs", "device/adapter.js");

      expect(() =>
        listDeviceFiles(deviceDir, patcherWith({ [section]: ["gone-file"] })),
      ).toThrow(/gone-file is in the device's project but not at .*gone-file/);
    },
  );

  it("refuses a script a box uses that is not built, and says how to build", () => {
    write("device/adapter.js");

    expect(() => listDeviceFiles(deviceDir, patcherWith({}))).toThrow(
      /Producer_Pal\.amxd uses srv\.mjs.*npm run build:debug/,
    );
  });

  it("names the patcher that uses a missing file", () => {
    writePatcher("p.maxpat", { maxclass: "fpic", pic: "gone.svg" });
    write("device/srv.mjs", "device/adapter.js");

    expect(() =>
      listDeviceFiles(deviceDir, patcherWith({ patchers: ["p.maxpat"] })),
    ).toThrow("p.maxpat uses gone.svg");
  });

  it("refuses two different files with the same name", () => {
    write("device/srv.mjs", "device/adapter.js", "device/dup", "lic/dup");

    expect(() =>
      listDeviceFiles(
        deviceDir,
        patcherWith({ media: ["dup"], other: ["../lic|dup"] }),
      ),
    ).toThrow("Two files are named dup");
  });

  it("copes with a patcher that has no project", () => {
    write("device/srv.mjs", "device/adapter.js");

    expect(
      listDeviceFiles(deviceDir, {
        boxes: [{ box: { maxclass: "newobj", text: "v8 adapter.js" } }],
      }).files.map((f) => f.name),
    ).toStrictEqual(["adapter.js"]);
  });
});
