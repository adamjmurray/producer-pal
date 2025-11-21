import fs from "fs/promises";
import path from "path";
import {
  findAllFiles,
  copyFile,
  writeConcatenatedFile,
  determineOutputFilename,
} from "./kb-file-operations.mjs";

/**
 * Processes items in flat copy mode
 * @param {object} config - Configuration object
 * @param {Set<string>} excludeGroups - Groups to exclude
 */
export async function processFlatMode(config, excludeGroups) {
  console.log("Copying files...");

  for (const item of config.items) {
    const sourcePath = path.join(config.projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        await processDirectoryFlat(config, item, sourcePath, excludeGroups);
      } else if (stat.isFile()) {
        await processFileFlat(config, item, sourcePath, excludeGroups);
      }
    } catch (_error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }
}

/**
 * Processes items in concatenation mode
 * @param {object} config - Configuration object
 * @param {Set<string>} excludeGroups - Groups to exclude
 */
export async function processConcatMode(config, excludeGroups) {
  console.log("Concatenating files into groups...");

  const fileGroups = new Map(); // Map of output filename -> array of source files

  // Process each item to group files appropriately
  for (const item of config.items) {
    const sourcePath = path.join(config.projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        await processDirectoryConcat(config, item, sourcePath, fileGroups);
      } else if (stat.isFile()) {
        await processFileConcat(config, item, sourcePath, fileGroups);
      }
    } catch (_error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }

  await writeGroupedFiles(config, fileGroups, excludeGroups);
}

/**
 * Processes directory copying with flat file naming
 * @param {object} config - Configuration object
 * @param {object} item - Configuration item
 * @param {string} sourcePath - Source directory path
 * @param {Set} excludeGroups - Set of group names to exclude
 */
async function processDirectoryFlat(config, item, sourcePath, excludeGroups) {
  const files = await findAllFiles(config, sourcePath, item.exclude || []);
  const dirName = item.targetDirName || path.basename(item.src);

  for (const filePath of files) {
    // Check if this file's group should be excluded
    const groupName = config.computeGroupName(item, filePath);
    if (excludeGroups.has(groupName)) {
      continue;
    }

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
 * Processes single file copying with flat file naming
 * @param {object} config - Configuration object
 * @param {object} item - Configuration item
 * @param {string} sourcePath - Source file path
 * @param {Set} excludeGroups - Set of group names to exclude
 */
async function processFileFlat(config, item, sourcePath, excludeGroups) {
  // Check if this file's group should be excluded
  const groupName = config.computeGroupName(item, sourcePath);
  if (excludeGroups.has(groupName)) {
    return;
  }

  // Copy single file
  const targetName = item.flatName || config.flattenPath(item.src);
  const targetPath = path.join(config.outputDir, targetName);
  await copyFile(config, sourcePath, targetPath);
  console.log(`  ${item.src} → ${targetName}`);
}

/**
 * Processes directory for concatenation mode, grouping files
 * @param {object} config - Configuration object
 * @param {object} item - Configuration item
 * @param {string} sourcePath - Source directory path
 * @param {Map} fileGroups - Map of group names to file arrays
 */
async function processDirectoryConcat(config, item, sourcePath, fileGroups) {
  const files = await findAllFiles(config, sourcePath, item.exclude || []);
  const dirName = item.targetDirName || path.basename(item.src);

  if (typeof item.group === "function") {
    // Dynamic grouping - call function for each file
    for (const filePath of files) {
      const relativePath = path.relative(config.projectRoot, filePath);
      const groupName =
        item.group({
          config: item,
          file: filePath,
          relativePath,
        }) || dirName;
      config.addToGroup(fileGroups, groupName, filePath);
    }
  } else {
    // Static grouping - use string or default
    const groupName = item.group || dirName;
    config.addToGroup(fileGroups, groupName, ...files);
  }
}

/**
 * Processes single file for concatenation mode, adding to group
 * @param {object} config - Configuration object
 * @param {object} item - Configuration item
 * @param {string} sourcePath - Source file path
 * @param {Map} fileGroups - Map of group names to file arrays
 */
async function processFileConcat(config, item, sourcePath, fileGroups) {
  const relativePath = path.relative(config.projectRoot, sourcePath);
  const groupName =
    (typeof item.group === "function"
      ? item.group({
          config: item,
          file: sourcePath,
          relativePath,
        })
      : item.group) || "misc";
  config.addToGroup(fileGroups, groupName, sourcePath);
}

/**
 * Writes concatenated files for each group
 * @param {object} config - Configuration object
 * @param {Map} fileGroups - Map of group names to file arrays
 * @param {Set} excludeGroups - Set of group names to exclude
 */
async function writeGroupedFiles(config, fileGroups, excludeGroups) {
  for (const [groupName, sourceFiles] of fileGroups) {
    if (sourceFiles.length === 0) continue;

    // Skip excluded groups
    if (excludeGroups.has(groupName)) {
      console.log(
        `  Skipping group: ${groupName} (${sourceFiles.length} files)`,
      );
      continue;
    }

    const outputFileName = determineOutputFilename(
      config,
      groupName,
      sourceFiles,
    );
    const targetPath = path.join(config.outputDir, outputFileName);
    const fileCount = await writeConcatenatedFile(
      config,
      targetPath,
      sourceFiles,
    );
    console.log(`  Created ${outputFileName} (${fileCount} files)`);
  }
}
