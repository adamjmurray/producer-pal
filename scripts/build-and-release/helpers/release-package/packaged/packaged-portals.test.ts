// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEV_BUILD_MARKER } from "../../build-flag-guard.ts";
import { checkPackagedPortals, PORTAL_FILENAME } from "./packaged-portals.ts";

let root: string;
let extensionDir: string;
let npmDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ppal-packaged-portals-"));
  extensionDir = join(root, "claude-desktop-extension");
  npmDir = join(root, "npm");
  mkdirSync(extensionDir);
  mkdirSync(npmDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writePortal = (dir: string, body: string): void =>
  writeFileSync(join(dir, PORTAL_FILENAME), body);

describe("checkPackagedPortals", () => {
  it("accepts release portals in every folder", () => {
    writePortal(extensionDir, "/*\nlicense\n*/\nbody");
    writePortal(npmDir, "/*\nlicense\n*/\nbody");

    expect(checkPackagedPortals([extensionDir, npmDir])).toBeNull();
  });

  it("refuses a dev-built portal in the extension folder", () => {
    writePortal(extensionDir, `/* ${DEV_BUILD_MARKER} */\nbody`);
    writePortal(npmDir, "body");

    const refusal = checkPackagedPortals([extensionDir, npmDir]);

    expect(refusal).toContain(join(extensionDir, PORTAL_FILENAME));
    expect(refusal).toContain("must not ship");
    expect(refusal).toContain("npm run release");
  });

  it("refuses a dev-built portal in npm/", () => {
    writePortal(extensionDir, "body");
    writePortal(npmDir, `#!/usr/bin/env node\n/* ${DEV_BUILD_MARKER} */\nbody`);

    expect(checkPackagedPortals([extensionDir, npmDir])).toContain(
      join(npmDir, PORTAL_FILENAME),
    );
  });

  it("refuses a missing portal", () => {
    writePortal(extensionDir, "body");

    const refusal = checkPackagedPortals([extensionDir, npmDir]);

    expect(refusal).toContain("not found");
    expect(refusal).toContain("npm run release:mcpb");
  });
});
