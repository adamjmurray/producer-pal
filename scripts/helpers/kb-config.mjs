import path from "path";

/**
 * Creates the items array defining what to include in knowledge base
 * @returns {Array} Array of item configurations
 */
function createItemsArray() {
  return [
    // Directories (automatically get directory prefix)
    { src: ".github", isDir: true, targetDirName: "_github", group: "config" },
    { src: "config", isDir: true },
    { src: "dev-docs", isDir: true, exclude: ["img"] },
    {
      src: "docs",
      isDir: true,
      exclude: [".vitepress/cache", ".vitepress/dist"],
      group: "docs",
    },
    { src: "licenses", isDir: true },
    { src: "scripts", isDir: true },
    {
      src: "src",
      isDir: true,
      group: ({ relativePath }) => {
        if (relativePath.match(/\.test\.\w+$/)) {
          if (relativePath.startsWith("src/tools/")) {
            return "src--tools--tests";
          }
          if (relativePath.startsWith("src/notation/")) {
            return "src--notation--tests";
          }
          return "src--tests";
        }
        if (relativePath.startsWith("src/tools/")) {
          return "src--tools";
        }
        if (relativePath.startsWith("src/notation/")) {
          return "src--notation";
        }
        return "src";
      },
    },
    {
      src: "webui",
      isDir: true,
      exclude: ["node_modules", "dist"],
      group: ({ relativePath }) => {
        // Test case files (data fixtures for tests)
        if (relativePath.includes("/test-cases/")) {
          return "webui--test.ts";
        }
        // Test files
        if (relativePath.match(/\.test\.\w+$/)) {
          return "webui--test.ts";
        }
        // TSX files (React components)
        if (relativePath.endsWith(".tsx")) {
          return "webui--tsx";
        }
        // TS files (hooks, utilities, etc.)
        if (relativePath.endsWith(".ts")) {
          return "webui--ts";
        }
        // Everything else (CSS, HTML, SVG, etc.)
        return "webui--other";
      },
    },

    // Individual files
    {
      src: ".claude/skills/refactoring/SKILL.md",
      flatName: "claude-refactoring-SKILL.md",
      group: "config",
    },
    { src: ".gitignore", flatName: "gitignore", group: "config" },
    { src: "AGENTS.md", group: "config" },
    { src: "CLAUDE.md", group: "config" },
    { src: "GEMINI.md", group: "config" },
    { src: "DEVELOPERS.md", group: "doc" },
    { src: "LICENSE", group: "licenses" },
    { src: "package.json", group: "config" },
    { src: "README.md", group: "doc" },
    {
      src: "coverage/coverage-summary.txt",
      flatName: "test-coverage-summary.txt",
      group: "test-coverage",
    },
    { src: "claude-desktop-extension/.mcpbignore", group: "config" },
    {
      src: "claude-desktop-extension/manifest.template.json",
      group: "config",
    },
    { src: "claude-desktop-extension/package.json", group: "config" },
  ];
}

/**
 * Creates configuration object for knowledge base generation
 * @param {string} projectRoot - Root directory of the project
 * @returns {object} Configuration object with paths, constants, items, and utilities
 */
export function createKnowledgeBaseConfig(projectRoot) {
  const outputDir = path.join(projectRoot, "knowledge-base");
  const FLAT_SEP = "--";
  const codeExts = [".js", ".mjs", ".ts", ".jsx", ".tsx"];

  const ignorePatterns = [
    /^\.DS_Store$/,
    /\.bak$/,
    /\.svg$/,
    /\.png$/,
    /\.gif$/,
    /\.jpg$/,
    /\.af$/,
    /\.afdesign$/,
    /^BingSiteAuth\.xml$/,
    /^CNAME$/,
  ];

  const items = createItemsArray();

  /**
   * Converts filesystem path separators to flat separator for file naming
   * @param {string} pathStr - The path string to flatten
   * @returns {string} - Flattened path string
   */
  function flattenPath(pathStr) {
    return pathStr.replace(/[/\\]/g, FLAT_SEP);
  }

  /**
   * Adds items to a named group in the groups map
   * @param {Map} groups - Map of group names to arrays of items
   * @param {string} groupName - Name of the group to add to
   * @param {...any} item - Items to add to the group
   */
  function addToGroup(groups, groupName, ...item) {
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(...item);
  }

  /**
   * Computes the group name for a file based on item configuration
   * @param {object} item - Configuration item from items array
   * @param {string} filePath - Absolute path to the file
   * @returns {string} - Computed group name
   */
  function computeGroupName(item, filePath) {
    const itemGroup =
      typeof item.group === "function"
        ? item.group({
            config: item,
            file: filePath,
            relativePath: path.relative(projectRoot, filePath),
          })
        : item.group;

    return itemGroup || item.targetDirName || path.basename(item.src) || "misc";
  }

  return {
    projectRoot,
    outputDir,
    FLAT_SEP,
    codeExts,
    ignorePatterns,
    items,
    flattenPath,
    addToGroup,
    computeGroupName,
  };
}
