#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.join(projectRoot, "knowledge-base");

const FLAT_SEP = "--";

function flattenPath(pathStr) {
  return pathStr.replace(/[/\\]/g, FLAT_SEP);
}

function addToGroup(groups, groupName, ...item) {
  if (!groups.has(groupName)) {
    groups.set(groupName, []);
  }
  groups.get(groupName).push(...item);
}

async function cleanAndCreateOutputDir() {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
    console.log(`Removed existing outputDir: ${outputDir}`);
  } catch (error) {
    // Directory doesn't exist, which is fine
  }
  await fs.mkdir(outputDir, { recursive: true });
}

const codeExts = [".js", ".mjs", ".ts", ".jsx", ".tsx"];

async function copyFile(sourcePath, targetPath) {
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

const itemsToCopy = [
  // Directories (automatically get directory prefix)
  { src: ".github", isDir: true, targetDirName: "_github" },
  { src: "config", isDir: true },
  { src: "doc", isDir: true, exclude: ["img"] },
  { src: "licenses", isDir: true },
  { src: "scripts", isDir: true },
  { src: "src", isDir: true, groupSubfolders: true },

  // Individual files
  { src: ".gitignore", flatName: "gitignore" },
  { src: "AGENTS.md" },
  { src: "CLAUDE.md" },
  { src: "GEMINI.md" },
  { src: "DEVELOPERS.md" },
  { src: "FEATURES.md" },
  { src: "INSTALLATION.md" },
  { src: "LICENSE" },
  { src: "package.json" },
  { src: "README.md" },
  { src: "ROADMAP.md" },
  {
    src: "coverage/coverage-summary.txt",
    flatName: "test-coverage-summary.txt",
  },
  { src: "claude-desktop-extension/.mcpbignore" },
  { src: "claude-desktop-extension/manifest.template.json" },
  { src: "claude-desktop-extension/package.json" },
];

async function copyDirectoriesAndFiles() {
  console.log("Copying files...");

  for (const item of itemsToCopy) {
    const sourcePath = path.join(projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        // Copy all files from directory with automatic prefix
        const files = await findAllFiles(sourcePath, item.exclude || []);

        const dirName = item.targetDirName || path.basename(item.src);

        for (const filePath of files) {
          const relativePath = path.relative(sourcePath, filePath);
          const flatName = dirName + FLAT_SEP + flattenPath(relativePath);
          const targetPath = path.join(outputDir, flatName);
          await copyFile(filePath, targetPath);
          console.log(
            `  ${path.relative(projectRoot, filePath)} → ${path.relative(projectRoot, targetPath)}`,
          );
        }
      } else if (stat.isFile()) {
        // Copy single file
        const targetName = item.flatName || flattenPath(item.src);
        const targetPath = path.join(outputDir, targetName);
        await copyFile(sourcePath, targetPath);
        console.log(`  ${item.src} → ${targetName}`);
      }
    } catch (error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }
}

async function findAllFiles(dir, excludePaths = [], baseDir = dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    // Skip .DS_Store files
    if (entry.name === ".DS_Store") {
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
      files.push(...(await findAllFiles(fullPath, excludePaths, baseDir)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function copyDirectoriesAndFilesConcatenated() {
  console.log("Concatenating files into groups...");

  const fileGroups = new Map(); // Map of output filename -> array of source files

  // Process each item to group files appropriately
  for (const item of itemsToCopy) {
    const sourcePath = path.join(projectRoot, item.src);

    try {
      const stat = await fs.stat(sourcePath);

      if (item.isDir && stat.isDirectory()) {
        const files = await findAllFiles(sourcePath, item.exclude || []);
        const dirName = item.targetDirName || path.basename(item.src);

        if (item.groupSubfolders) {
          // Group by subfolder when groupSubfolders is enabled
          for (const filePath of files) {
            const relativePath = path.relative(sourcePath, filePath);
            const parts = relativePath.split(path.sep);

            if (parts.length === 1) {
              // File directly in the directory
              const groupName = `${dirName}--root`;
              addToGroup(fileGroups, groupName, filePath);
            } else {
              // File in a subfolder
              const subfolder = parts[0];
              const groupName = `${dirName}--${subfolder}--all`;
              addToGroup(fileGroups, groupName, filePath);
            }
          }
        } else {
          // Regular directory - all files go into one concatenated file
          const groupName = `${dirName}--all`;
          addToGroup(fileGroups, groupName, ...files);
        }
      } else if (stat.isFile()) {
        // Individual files - group by folder name
        const firstSlashIndex = item.src.indexOf("/");
        let groupName;

        if (firstSlashIndex === -1) {
          // No folder, file is at root level
          groupName = "root-files";
        } else {
          // Extract folder name (everything before first slash)
          const folderName = item.src.substring(0, firstSlashIndex);
          groupName = `${folderName}--all`;
        }

        addToGroup(fileGroups, groupName, sourcePath);
      }
    } catch (error) {
      console.log(`  Skipping ${item.src} (not found)`);
    }
  }

  // Now write the concatenated files
  for (const [groupName, sourceFiles] of fileGroups) {
    if (sourceFiles.length === 0) continue;

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

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const isConcatMode = args.includes("--concat");

    if (isConcatMode) {
      console.log("Generating knowledge base files in CONCAT mode...");
    } else {
      console.log("Generating knowledge base files...");
    }

    await cleanAndCreateOutputDir();

    if (isConcatMode) {
      await copyDirectoriesAndFilesConcatenated();
    } else {
      await copyDirectoriesAndFiles();
    }

    console.log(
      `\nComplete! Knowledge base files ${isConcatMode ? "concatenated" : "copied"} to: ${path.relative(projectRoot, outputDir)}`,
    );

    const files = await fs.readdir(outputDir);
    console.log(`Total files: ${files.length}`);
  } catch (error) {
    console.error("Error generating knowledge base files:", error);
    process.exit(1);
  }
}

main();
