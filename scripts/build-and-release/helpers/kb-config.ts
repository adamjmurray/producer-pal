import path from "node:path";

export interface KbGroupContext {
  relativePath: string;
  config?: KbItem;
  file?: string;
}

export interface KbItem {
  src: string;
  isDir?: boolean;
  targetDirName?: string;
  group?: string | ((ctx: KbGroupContext) => string);
  flatName?: string;
  exclude?: string[];
}

export interface KbConfig {
  projectRoot: string;
  outputDir: string;
  FLAT_SEP: string;
  codeExts: string[];
  ignorePatterns: RegExp[];
  items: KbItem[];
  flattenPath: (pathStr: string) => string;
  addToGroup: (
    groups: Map<string, string[]>,
    groupName: string,
    ...item: string[]
  ) => void;
  computeGroupName: (item: KbItem, filePath: string) => string;
}

/**
 * Creates the items array defining what to include in knowledge base
 * @returns Array of item configurations
 */
function createItemsArray(): KbItem[] {
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
    { src: "licenses", isDir: true, group: "third-party-licenses" },
    { src: "scripts", isDir: true },
    {
      src: "evals",
      isDir: true,
      group: ({ relativePath }) => {
        const isTestFile =
          Boolean(relativePath.match(/\.test\.\w+$/)) ||
          Boolean(relativePath.match(/-test-helpers\.\w+$/));

        if (isTestFile) {
          return "evals--tests";
        }

        return "evals";
      },
    },
    {
      src: "src",
      isDir: true,
      group: ({ relativePath }) => {
        const isTestFile =
          Boolean(relativePath.match(/\.test\.\w+$/)) ||
          Boolean(relativePath.match(/-test-helpers\.\w+$/)) ||
          relativePath.includes("/tests/");

        if (isTestFile) {
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
        const isTestFile =
          Boolean(relativePath.match(/\.test\.\w+$/)) ||
          Boolean(relativePath.match(/-test-helpers\.\w+$/)) ||
          Boolean(relativePath.match(/-test-case\.ts$/)) ||
          relativePath.includes("/test-cases/") ||
          relativePath.includes("/test-utils/");

        if (isTestFile) {
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
    { src: "LICENSE", group: "doc" },
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
 * @param projectRoot - Root directory of the project
 * @returns Configuration object with paths, constants, items, and utilities
 */
export function createKnowledgeBaseConfig(projectRoot: string): KbConfig {
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
   * @param pathStr - The path string to flatten
   * @returns Flattened path string
   */
  function flattenPath(pathStr: string): string {
    return pathStr.replaceAll(/[/\\]/g, FLAT_SEP);
  }

  /**
   * Adds items to a named group in the groups map
   * @param groups - Map of group names to arrays of items
   * @param groupName - Name of the group to add to
   * @param item - Items to add to the group
   */
  function addToGroup(
    groups: Map<string, string[]>,
    groupName: string,
    ...item: string[]
  ): void {
    const existing = groups.get(groupName);

    if (existing) {
      existing.push(...item);
    } else {
      groups.set(groupName, [...item]);
    }
  }

  /**
   * Computes the group name for a file based on item configuration
   * @param item - Configuration item from items array
   * @param filePath - Absolute path to the file
   * @returns Computed group name
   */
  function computeGroupName(item: KbItem, filePath: string): string {
    const itemGroup =
      typeof item.group === "function"
        ? item.group({
            config: item,
            file: filePath,
            relativePath: path.relative(projectRoot, filePath),
          })
        : item.group;

    return itemGroup ?? item.targetDirName ?? path.basename(item.src);
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
