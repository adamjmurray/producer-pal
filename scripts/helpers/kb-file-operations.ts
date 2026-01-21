import fs from "node:fs/promises";
import path from "node:path";
import type { KbConfig } from "./kb-config.ts";

/**
 * Recursively finds all files in a directory, excluding specified paths
 * @param config - Configuration object with ignorePatterns
 * @param dir - Directory to search
 * @param excludePaths - Array of relative paths to exclude
 * @param baseDir - Base directory for computing relative paths (defaults to dir)
 * @returns Array of file paths
 */
export async function findAllFiles(
  config: KbConfig,
  dir: string,
  excludePaths: string[] = [],
  baseDir: string = dir,
): Promise<string[]> {
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
      files.push(
        ...(await findAllFiles(config, fullPath, excludePaths, baseDir)),
      );
    } else if (entry.isFile()) {
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

/**
 * Writes a concatenated file from multiple source files
 * @param config - Configuration object with codeExts and projectRoot
 * @param outputPath - Output file path
 * @param sourceFiles - Array of source file paths
 * @returns Number of files concatenated
 */
export async function writeConcatenatedFile(
  config: KbConfig,
  outputPath: string,
  sourceFiles: string[],
): Promise<number> {
  let concatenatedContent = "";
  let fileCount = 0;

  for (const sourcePath of sourceFiles) {
    const relativePath = path.relative(config.projectRoot, sourcePath);
    const fileContent = await fs.readFile(sourcePath, "utf8");

    if (fileCount > 0) {
      concatenatedContent += "\n\n";
    }

    concatenatedContent += `// ========================================\n`;
    concatenatedContent += `// FILE: ${relativePath}\n`;
    concatenatedContent += `// ----------------------------------------\n`;
    concatenatedContent += fileContent;

    fileCount++;
  }

  await fs.writeFile(outputPath, concatenatedContent, "utf8");

  return fileCount;
}

/**
 * Determines output filename with appropriate extension
 * @param config - Configuration object with codeExts
 * @param groupName - Group name
 * @param sourceFiles - Source files in the group
 * @returns Output filename with extension
 */
export function determineOutputFilename(
  config: KbConfig,
  groupName: string,
  sourceFiles: string[],
): string {
  let outputFileName = groupName;

  if (!outputFileName.includes(".")) {
    // Add extension based on primary content type
    const hasCodeFile = sourceFiles.some((f) =>
      config.codeExts.includes(path.extname(f)),
    );

    outputFileName += hasCodeFile ? ".js" : ".md";
  }

  return outputFileName;
}
