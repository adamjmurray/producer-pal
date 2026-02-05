// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs/promises";
import path from "node:path";
import type { KbConfig } from "./kb-config.ts";

export interface FindFilesOptions {
  excludePaths?: string[];
  filter?: RegExp;
}

/**
 * Recursively finds all files in a directory
 * @param config - Configuration object with ignorePatterns
 * @param dir - Directory to search
 * @param options - Options for excluding paths and filtering files
 * @param baseDir - Base directory for computing relative paths (defaults to dir)
 * @returns Array of file paths
 */
export async function findAllFiles(
  config: KbConfig,
  dir: string,
  options: FindFilesOptions = {},
  baseDir: string = dir,
): Promise<string[]> {
  const { excludePaths = [], filter } = options;
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    // Skip files matching ignore patterns
    if (config.ignorePatterns.some((pattern) => pattern.test(entry.name))) {
      continue;
    }

    // Check if this path should be excluded
    if (
      excludePaths.some(
        (excludePath) =>
          relativePath === excludePath ||
          relativePath.startsWith(excludePath + path.sep),
      )
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await findAllFiles(config, fullPath, options, baseDir)));
    } else if (entry.isFile()) {
      // Apply filter if specified
      if (filter && !filter.test(entry.name)) {
        continue;
      }

      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Copies a file, prepending path comment for code files
 * @param config - Configuration object with codeExts and projectRoot
 * @param sourcePath - Source file path
 * @param targetPath - Target file path
 */
export async function copyFile(
  config: KbConfig,
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  const ext = path.extname(sourcePath);

  if (config.codeExts.includes(ext)) {
    // Read original content
    const originalContent = await fs.readFile(sourcePath, "utf8");

    // Generate path comment based on source path relative to project root
    const relativePath = path.relative(config.projectRoot, sourcePath);
    const pathComment = `// ${relativePath}\n`;

    // Prepend path comment and write to target
    const contentWithComment = pathComment + originalContent;

    await fs.writeFile(targetPath, contentWithComment, "utf8");
  } else {
    // Regular copy for non-code files
    await fs.copyFile(sourcePath, targetPath);
  }
}
