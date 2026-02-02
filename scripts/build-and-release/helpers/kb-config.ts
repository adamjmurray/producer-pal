import path from "node:path";

export interface KbItem {
  src: string;
  isDir?: boolean;
  flatName?: string;
  exclude?: string[];
  /** Only include files matching this pattern (for directory items) */
  filter?: RegExp;
}

export interface KbConfig {
  projectRoot: string;
  outputDir: string;
  FLAT_SEP: string;
  codeExts: string[];
  ignorePatterns: RegExp[];
  items: KbItem[];
  flattenPath: (pathStr: string) => string;
}

/**
 * Creates the items array defining what to include in knowledge base
 * @returns Array of item configurations
 */
function createItemsArray(): KbItem[] {
  return [
    // Project overview
    { src: "AGENTS.md" },
    { src: "DEVELOPERS.md" },
    { src: "README.md" },
    { src: "LICENSE" },
    { src: "SECURITY.md" },
    { src: "package.json" },

    // Dev docs (entire directory, exclude img and AI-Chat-Project-Instructions)
    {
      src: "dev-docs",
      isDir: true,
      exclude: ["img", "AI-Chat-Project-Instructions.md"],
    },

    // User docs (entire directory, exclude .vitepress)
    { src: "docs", isDir: true, exclude: [".vitepress"] },

    // Tool definitions (all .def.ts files in src/tools)
    { src: "src/tools", isDir: true, filter: /\.def\.ts$/ },

    // E2E test documentation
    { src: "e2e/mcp/README.md" },
    { src: "e2e/webui/README.md" },
    { src: "e2e/docs/README.md" },
    { src: "e2e/live-sets/e2e-test-set-spec.md" },

    // Eval scenarios
    { src: "evals/eval/scenario-defs", isDir: true },
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

  return {
    projectRoot,
    outputDir,
    FLAT_SEP,
    codeExts,
    ignorePatterns,
    items,
    flattenPath,
  };
}
