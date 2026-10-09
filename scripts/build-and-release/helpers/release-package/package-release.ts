#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Run after `npm run release` and the manual Max freeze. Builds the portal and
// the .mcpb with the frozen device beside them, and leaves the same files in
// npm/ ready to pack. See dev/process/releasing.md.
//
// `--verify-npm` only checks that npm/ holds this version's device. It is what
// `npm run guard:device` and npm/package.json's prepack run, so a tarball can't
// be packed after a plain build has wiped the device.

import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFlagGuard } from "../build-flag-guard.ts";
import {
  checkBuildMatchesCheckout,
  readBuildInfo,
  readCheckout,
} from "./build-info.ts";
import {
  assertDeviceCopies,
  checkDeviceVersion,
  checkFrozenDevice,
  FROZEN_DEVICE_FILENAME,
} from "./frozen-device.ts";
import { describePackageFailure, runPackageSteps } from "./package-steps.ts";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const releaseDir = join(rootDir, "release");
const extensionDir = join(rootDir, "claude-desktop-extension");
const npmDir = join(rootDir, "npm");
const frozenDevice = join(releaseDir, FROZEN_DEVICE_FILENAME);

const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
  version: string;
};

if (process.argv.includes("--verify-npm")) {
  verifyNpm();
} else {
  packageRelease();
}

/** Refuse unless npm/ is ready to publish. */
function verifyNpm(): void {
  const refusal = checkDeviceVersion(
    join(npmDir, FROZEN_DEVICE_FILENAME),
    pkg.version,
  );

  if (refusal != null) {
    console.error(`\n❌ npm/ is not ready to publish.\n${refusal}`);
    console.error("Run `npm run release:package` (after freezing) first.\n");
    process.exit(1);
  }

  console.log(`npm/${FROZEN_DEVICE_FILENAME} matches ${pkg.version}.`);
}

/** Check the frozen device, then build and copy everything that ships it. */
function packageRelease(): void {
  const flagRefusal = buildFlagGuard(process.env);

  if (flagRefusal != null) {
    console.error(flagRefusal);
    process.exit(1);
  }

  const build = readBuildInfo(releaseDir);

  const checkoutRefusal = checkBuildMatchesCheckout({
    build,
    version: pkg.version,
    checkout: readCheckout((...args) =>
      execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim(),
    ),
  });
  const refusal =
    checkoutRefusal?.join("\n") ??
    checkFrozenDevice({ releaseDir, version: pkg.version });

  if (refusal != null || build == null) {
    console.error(`\n❌ Not packaging.\n${refusal ?? ""}\n`);
    process.exit(1);
  }

  console.log(`Packaging ${pkg.version} (build ${build.commit})...\n`);

  const run = (command: string, env: Record<string, string> = {}): void => {
    execSync(command, {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env, BUILD_SHA: build.commit, ...env },
    });
  };

  const result = runPackageSteps([
    {
      name: "build portal with the device beside it",
      writes: [
        "claude-desktop-extension/producer-pal-portal.js",
        `claude-desktop-extension/${FROZEN_DEVICE_FILENAME}`,
        "npm/producer-pal-portal.js",
        `npm/${FROZEN_DEVICE_FILENAME}`,
      ],
      run: () =>
        run("npm run build:bundles", {
          PRODUCER_PAL_DEVICE_FILE: frozenDevice,
        }),
    },
    {
      name: "check the bundled copies",
      writes: [],
      run: () => assertDeviceCopies(frozenDevice, [extensionDir, npmDir]),
    },
    {
      name: "make the mcpb",
      writes: ["claude-desktop-extension/Producer_Pal.mcpb"],
      run: () => run("npm run dxt:build"),
    },
    {
      name: "copy the mcpb to release/",
      writes: ["release/Producer_Pal.mcpb"],
      run: () =>
        copyFileSync(
          join(extensionDir, "Producer_Pal.mcpb"),
          join(releaseDir, "Producer_Pal.mcpb"),
        ),
    },
  ]);

  if (result.failed != null) {
    console.error(`\n❌ ${describePackageFailure(result)}\n`);
    process.exit(1);
  }

  console.log(`\n✅ Packaged ${pkg.version}. Written:`);

  for (const path of result.written) {
    console.log(`   ${path}`);
  }

  console.log(
    "\nDon't run a plain `npm run build` before publishing: it removes the",
    "device from npm/ and the extension folder.",
    "\nNext: tag (npm run tag), test, and pack from npm/ per dev/process/releasing.md.\n",
  );
}
