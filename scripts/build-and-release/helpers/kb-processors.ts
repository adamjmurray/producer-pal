// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs/promises";
import path from "node:path";
import { type KbConfig, type KbItem } from "./kb-config.ts";
import { findAllFiles, copyFile } from "./kb-file-operations.ts";

/**
 * Processes all items in the configuration
 * @param config - Configuration object
 */
export async function processItems(config: KbConfig): Promise<void> {
  console.log("Copying files...");

  for (const item of config.items) {
    const sourcePath = path.join(config.projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        await processDirectory(config, item, sourcePath);
      } else if (stat.isFile()) {
        await processSingleFile(config, item, sourcePath);
      }
    } catch {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }
}

/**
 * Processes a directory, copying all files with flat naming
 * @param config - Configuration object
 * @param item - Configuration item
 * @param sourcePath - Source directory path
 */
async function processDirectory(
  config: KbConfig,
  item: KbItem,
  sourcePath: string,
): Promise<void> {
  const files = await findAllFiles(config, sourcePath, {
    excludePaths: item.exclude,
    filter: item.filter,
  });
  const dirName = path.basename(item.src);

  for (const filePath of files) {
    const relativePath = path.relative(sourcePath, filePath);
    const flatName =
      dirName + config.FLAT_SEP + config.flattenPath(relativePath);
    const targetPath = path.join(config.outputDir, flatName);

    await copyFile(config, filePath, targetPath);
    console.log(
      `  ${path.relative(config.projectRoot, filePath)} → ${path.relative(config.projectRoot, targetPath)}`,
    );
  }
}

/**
 * Processes a single file, copying with flat naming
 * @param config - Configuration object
 * @param item - Configuration item
 * @param sourcePath - Source file path
 */
async function processSingleFile(
  config: KbConfig,
  item: KbItem,
  sourcePath: string,
): Promise<void> {
  const targetName = item.flatName ?? config.flattenPath(item.src);
  const targetPath = path.join(config.outputDir, targetName);

  await copyFile(config, sourcePath, targetPath);
  console.log(`  ${item.src} → ${targetName}`);
}
