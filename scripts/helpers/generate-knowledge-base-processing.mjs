import fs from "fs/promises";
import path from "path";

/**
 * Recursively finds all files in a directory, excluding specified paths
 * @param {string} dir - Directory to search
 * @param {string[]} excludePaths - Array of relative paths to exclude
 * @param {string} baseDir - Base directory for computing relative paths
 * @param {RegExp[]} ignorePatterns - Array of patterns to skip
 * @returns {Promise<string[]>} - Array of file paths
 */
export async function findAllFiles(
  dir,
  excludePaths = [],
  baseDir = dir,
  ignorePatterns = [],
) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    // Skip files matching ignore patterns
    if (ignorePatterns.some((pattern) => pattern.test(entry.name))) {
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
        ...(await findAllFiles(
          fullPath,
          excludePaths,
          baseDir,
          ignorePatterns,
        )),
      );
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Copies a file, prepending path comment for code files
 * @param {string} sourcePath - Source file path
 * @param {string} targetPath - Target file path
 * @param {string} projectRoot - Project root directory for relative paths
 * @param {string[]} codeExts - Array of code file extensions
 */
export async function copyFile(sourcePath, targetPath, projectRoot, codeExts) {
  const ext = path.extname(sourcePath);

  if (codeExts.includes(ext)) {
    // Read original content
    const originalContent = await fs.readFile(sourcePath, "utf8");

    // Generate path comment based on source path relative to project root
    const relativePath = path.relative(projectRoot, sourcePath);
    const pathComment = `// ${relativePath}\n`;

    // Prepend path comment and write to target
    const contentWithComment = pathComment + originalContent;
    await fs.writeFile(targetPath, contentWithComment, "utf8");
  } else {
    // Regular copy for non-JS files or files that shouldn't have path comments
    await fs.copyFile(sourcePath, targetPath);
  }
}

/**
 * Processes directory copying with flat file naming
 * @param {object} item - Configuration item from itemsToCopy
 * @param {string} sourcePath - Source directory path
 * @param {string} outputDir - Output directory path
 * @param {string} projectRoot - Project root directory
 * @param {Set} excludeGroups - Set of group names to exclude
 * @param {string} flatSep - Separator for flat naming
 * @param {string[]} codeExts - Array of code file extensions
 * @param {RegExp[]} ignorePatterns - Array of patterns to skip
 * @param {Function} computeGroupName - Function to compute group name
 * @param {Function} flattenPath - Function to flatten path
 */
export async function processCopyDirectory(
  item,
  sourcePath,
  outputDir,
  projectRoot,
  excludeGroups,
  flatSep,
  codeExts,
  ignorePatterns,
  computeGroupName,
  flattenPath,
) {
  const files = await findAllFiles(
    sourcePath,
    item.exclude || [],
    sourcePath,
    ignorePatterns,
  );
  const dirName = item.targetDirName || path.basename(item.src);

  for (const filePath of files) {
    // Check if this file's group should be excluded
    const groupName = computeGroupName(item, filePath, projectRoot);
    if (excludeGroups.has(groupName)) {
      continue;
    }

    const relativePath = path.relative(sourcePath, filePath);
    const flatName = dirName + flatSep + flattenPath(relativePath);
    const targetPath = path.join(outputDir, flatName);
    await copyFile(filePath, targetPath, projectRoot, codeExts);
    console.log(
      `  ${path.relative(projectRoot, filePath)} → ${path.relative(projectRoot, targetPath)}`,
    );
  }
}

/**
 * Processes single file copying with flat file naming
 * @param {object} item - Configuration item from itemsToCopy
 * @param {string} sourcePath - Source file path
 * @param {string} outputDir - Output directory path
 * @param {string} projectRoot - Project root directory
 * @param {Set} excludeGroups - Set of group names to exclude
 * @param {string[]} codeExts - Array of code file extensions
 * @param {Function} computeGroupName - Function to compute group name
 * @param {Function} flattenPath - Function to flatten path
 */
export async function processCopyFile(
  item,
  sourcePath,
  outputDir,
  projectRoot,
  excludeGroups,
  codeExts,
  computeGroupName,
  flattenPath,
) {
  // Check if this file's group should be excluded
  const groupName = computeGroupName(item, sourcePath, projectRoot);
  if (excludeGroups.has(groupName)) {
    return;
  }

  // Copy single file
  const targetName = item.flatName || flattenPath(item.src);
  const targetPath = path.join(outputDir, targetName);
  await copyFile(sourcePath, targetPath, projectRoot, codeExts);
  console.log(`  ${item.src} → ${targetName}`);
}

/**
 * Processes directory for concatenation mode, grouping files
 * @param {object} item - Configuration item from itemsToCopy
 * @param {string} sourcePath - Source directory path
 * @param {string} projectRoot - Project root directory
 * @param {Map} fileGroups - Map of group names to file arrays
 * @param {RegExp[]} ignorePatterns - Array of patterns to skip
 * @param {Function} addToGroup - Function to add items to group
 */
export async function processConcatenateDirectory(
  item,
  sourcePath,
  projectRoot,
  fileGroups,
  ignorePatterns,
  addToGroup,
) {
  const files = await findAllFiles(
    sourcePath,
    item.exclude || [],
    sourcePath,
    ignorePatterns,
  );
  const dirName = item.targetDirName || path.basename(item.src);

  if (typeof item.group === "function") {
    // Dynamic grouping - call function for each file
    for (const filePath of files) {
      const relativePath = path.relative(projectRoot, filePath);
      const groupName =
        item.group({
          config: item,
          file: filePath,
          relativePath,
        }) || dirName;
      addToGroup(fileGroups, groupName, filePath);
    }
  } else {
    // Static grouping - use string or default
    const groupName = item.group || dirName;
    addToGroup(fileGroups, groupName, ...files);
  }
}

/**
 * Processes single file for concatenation mode, adding to group
 * @param {object} item - Configuration item from itemsToCopy
 * @param {string} sourcePath - Source file path
 * @param {string} projectRoot - Project root directory
 * @param {Map} fileGroups - Map of group names to file arrays
 * @param {Function} addToGroup - Function to add items to group
 */
export async function processConcatenateFile(
  item,
  sourcePath,
  projectRoot,
  fileGroups,
  addToGroup,
) {
  const relativePath = path.relative(projectRoot, sourcePath);
  const groupName =
    (typeof item.group === "function"
      ? item.group({
          config: item,
          file: sourcePath,
          relativePath,
        })
      : item.group) || "misc";
  addToGroup(fileGroups, groupName, sourcePath);
}

/**
 * Writes concatenated files for each group
 * @param {Map} fileGroups - Map of group names to file arrays
 * @param {string} outputDir - Output directory path
 * @param {string} projectRoot - Project root directory
 * @param {Set} excludeGroups - Set of group names to exclude
 * @param {string[]} codeExts - Array of code file extensions
 */
export async function writeGroupFiles(
  fileGroups,
  outputDir,
  projectRoot,
  excludeGroups,
  codeExts,
) {
  // Write the concatenated files
  for (const [groupName, sourceFiles] of fileGroups) {
    if (sourceFiles.length === 0) continue;

    // Skip excluded groups
    if (excludeGroups.has(groupName)) {
      console.log(
        `  Skipping group: ${groupName} (${sourceFiles.length} files)`,
      );
      continue;
    }

    let concatenatedContent = "";
    let fileCount = 0;

    for (const sourcePath of sourceFiles) {
      const relativePath = path.relative(projectRoot, sourcePath);
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

    // Determine appropriate extension based on content
    let outputFileName = groupName;
    if (!outputFileName.includes(".")) {
      // Add extension based on primary content type
      const hasCodeFile = sourceFiles.some((f) =>
        codeExts.includes(path.extname(f)),
      );
      outputFileName += hasCodeFile ? ".js" : ".md";
    }

    const targetPath = path.join(outputDir, outputFileName);
    await fs.writeFile(targetPath, concatenatedContent, "utf8");
    console.log(`  Created ${outputFileName} (${fileCount} files)`);
  }
}
