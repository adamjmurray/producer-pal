// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync } from "node:fs";
import Max from "max-api";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { revealConfigDir } from "#src/mcp-server/helpers/reveal-config-dir.ts";

vi.mock(import("node:fs"), () => ({ mkdirSync: vi.fn() }));

const mkdirMock = mkdirSync as unknown as Mock;
const outletMock = Max.outlet as unknown as Mock;

const ORIGINAL_DIR = process.env.PRODUCER_PAL_CONFIG_DIR;
// Include a space to prove the file:// URL is encoded (why we build it in Node).
const DIR = "/fake/ppal config";

beforeEach(() => {
  process.env.PRODUCER_PAL_CONFIG_DIR = DIR;
});

afterEach(() => {
  if (ORIGINAL_DIR == null) {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;
  } else {
    process.env.PRODUCER_PAL_CONFIG_DIR = ORIGINAL_DIR;
  }
});

describe("revealConfigDir", () => {
  it("creates the dir and emits it as an encoded file:// URL for the patch", () => {
    revealConfigDir();

    expect(mkdirMock).toHaveBeenCalledWith(DIR, { recursive: true });
    expect(outletMock).toHaveBeenCalledWith(
      "openConfigFolder",
      "file:///fake/ppal%20config",
    );
  });

  it("does not emit when directory creation fails", () => {
    mkdirMock.mockImplementationOnce(() => {
      throw new Error("EACCES");
    });

    revealConfigDir();

    expect(outletMock).not.toHaveBeenCalled();
  });

  it("is inert under Vitest without a dir override", () => {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    revealConfigDir();

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(outletMock).not.toHaveBeenCalled();
  });
});
