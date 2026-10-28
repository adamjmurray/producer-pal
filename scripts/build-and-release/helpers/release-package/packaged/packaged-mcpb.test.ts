// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkMcpbPackaged, MCPB_FILENAME } from "./packaged-mcpb.ts";

const BUILD_TIME = 1_800_000_000;

let releaseDir: string;

beforeEach(() => {
  releaseDir = mkdtempSync(join(tmpdir(), "ppal-packaged-mcpb-"));
  writeFileSync(join(releaseDir, "build-info.json"), "{}");
  utimesSync(join(releaseDir, "build-info.json"), BUILD_TIME, BUILD_TIME);
});

afterEach(() => {
  rmSync(releaseDir, { recursive: true, force: true });
});

// Write the .mcpb this many seconds after the build.
function writeMcpb(ageSeconds: number): void {
  const path = join(releaseDir, MCPB_FILENAME);
  const time = BUILD_TIME + ageSeconds;

  writeFileSync(path, "mcpb");
  utimesSync(path, time, time);
}

describe("checkMcpbPackaged", () => {
  it("accepts an .mcpb packaged after the build", () => {
    writeMcpb(60);

    expect(checkMcpbPackaged(releaseDir)).toBeNull();
  });

  it("accepts an .mcpb written in the same instant as the build", () => {
    writeMcpb(0);

    expect(checkMcpbPackaged(releaseDir)).toBeNull();
  });

  it("refuses when no .mcpb was built, pointing at release:mcpb", () => {
    const refusal = checkMcpbPackaged(releaseDir);

    expect(refusal?.[0]).toBe("release/Producer_Pal.mcpb not found.");
    expect(refusal?.join("\n")).toContain("npm run release:mcpb");
  });

  it("refuses an .mcpb older than the build", () => {
    writeMcpb(-60);

    const refusal = checkMcpbPackaged(releaseDir);

    expect(refusal?.[0]).toContain("older than release/build-info.json");
    expect(refusal?.join("\n")).toContain("npm run release:mcpb");
  });
});
