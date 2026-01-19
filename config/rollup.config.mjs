import alias from "@rollup/plugin-alias";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import esbuild from "rollup-plugin-esbuild";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import copy from "rollup-plugin-copy";
import { inlineChatUI } from "./rollup-plugin-inline-chat-ui.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const licensePath = join(rootDir, "LICENSE");
const licenseText = readFileSync(licensePath, "utf-8");

const thirdPartyLicensesFolder = join(rootDir, "licenses");

const terserOptions = {
  compress: false,
  mangle: false,
  format: {
    comments: false,
    beautify: true,
    indent_level: 2,
  },
};

const addLicenseHeader = (options = {}) => ({
  name: "add-license-header",
  renderChunk(code) {
    const shebang = options.shebang ? `${options.shebang}\n` : "";
    return `${shebang}/*\n${licenseText}${
      options.includeThirdPartyLicenses
        ? "\nThis file includes bundled dependencies.\nSee https://github.com/adamjmurray/producer-pal/tree/main/licenses for third-party licenses."
        : ""
    }\n*/\n\n${code}`;
  },
});

export default [
  {
    input: join(rootDir, "src/live-api-adapter/live-api-adapter.ts"),
    output: {
      file: join(rootDir, "max-for-live-device/live-api-adapter.js"),
      format: "es",
    },
    plugins: [
      alias({
        entries: [{ find: "#src", replacement: join(rootDir, "src") }],
        customResolver: (source) => {
          // Resolve .js imports to .ts files in TypeScript-migrated directories
          // but exclude Peggy-generated parser files (*-parser.js)
          if (
            (source.includes("/skills/") ||
              source.includes("/notation/") ||
              source.includes("/tools/operations/delete/") ||
              source.includes("/tools/samples/") ||
              source.includes("/tools/workflow/") ||
              source.includes("/tools/live-set/") ||
              source.includes("/tools/scene/")) &&
            source.endsWith(".js") &&
            !source.endsWith("-parser.js")
          ) {
            return source.replace(/\.js$/, ".ts");
          }
          return null;
        },
      }),
      replace({
        "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
          process.env.ENABLE_RAW_LIVE_API,
        ),
        preventAssignment: true,
      }),
      esbuild({
        include: /\.[jt]sx?$/,
        target: "es2024",
        tsconfig: join(rootDir, "src/live-api-adapter/tsconfig.json"),
      }),
      resolve({
        extensions: [".mjs", ".js", ".json", ".node", ".ts"],
        preferBuiltins: true,
        browser: false,
      }),
      { renderChunk: (code) => code.replace(/\nexport.*/, "") }, // remove top-level exports
      terser(terserOptions),
      addLicenseHeader(),
    ],
  },
  {
    input: join(rootDir, "src/mcp-server/mcp-server.ts"),
    output: {
      file: join(rootDir, "max-for-live-device/mcp-server.mjs"),
      format: "es",
    },
    external: ["max-api"],
    plugins: [
      // These plugins bundle up the runtime dependencies (@modelcontextprotocol/sdk, express, and zod) for distribution.
      // Note: these build warnings are expected and harmless:
      // (!) Circular dependencies in node_modules/zod-to-json-schema
      // and
      // (!) "this" has been rewritten to "undefined" in node_modules/zod
      alias({
        entries: [{ find: "#src", replacement: join(rootDir, "src") }],
      }),
      replace({
        "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
          process.env.ENABLE_RAW_LIVE_API,
        ),
        preventAssignment: true,
      }),
      esbuild({
        include: /\.[jt]sx?$/,
        target: "es2024",
        tsconfig: join(rootDir, "src/mcp-server/tsconfig.json"),
      }),
      inlineChatUI(), // Inline chat-ui.html for frozen .amxd builds
      resolve({
        extensions: [".mjs", ".js", ".json", ".node", ".ts"],
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      json(),
      terser(terserOptions),
      addLicenseHeader({ includeThirdPartyLicenses: true }),
    ],
  },
  {
    input: join(rootDir, "src/portal/producer-pal-portal.ts"),
    output: [
      {
        file: join(rootDir, "claude-desktop-extension/producer-pal-portal.js"),
        format: "es",
      },
      {
        file: join(rootDir, "release/producer-pal-portal.js"),
        format: "es",
      },
      {
        file: join(rootDir, "npm/producer-pal-portal.js"),
        format: "es",
      },
    ],
    plugins: [
      alias({
        entries: [{ find: "#src", replacement: join(rootDir, "src") }],
      }),
      esbuild({
        include: /\.[jt]sx?$/,
        target: "es2024",
        tsconfig: join(rootDir, "src/portal/tsconfig.json"),
      }),
      resolve({
        extensions: [".mjs", ".js", ".json", ".node", ".ts"],
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      json(),
      terser(terserOptions),
      addLicenseHeader({
        includeThirdPartyLicenses: true,
        shebang: "#!/usr/bin/env node",
      }),
      replace({
        "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
          process.env.ENABLE_RAW_LIVE_API,
        ),
        delimiters: ["", ""],
        'import pkceChallenge from "pkce-challenge";':
          'const pkceChallenge = () => { throw new Error("Authorization not supported - Producer Pal uses local HTTP communication only"); };',
        preventAssignment: true,
      }),
      copy({
        targets: [
          { src: licensePath, dest: "claude-desktop-extension" },
          {
            src: thirdPartyLicensesFolder,
            dest: "claude-desktop-extension",
          },
          { src: licensePath, dest: "npm" },
          {
            src: [
              join(thirdPartyLicensesFolder, "mcp-typescript-sdk-license"),
              join(thirdPartyLicensesFolder, "zod-license"),
              join(thirdPartyLicensesFolder, "README.md"),
            ],
            dest: "npm/licenses",
          },
          {
            src: join(rootDir, "assets/image/producer-pal-logo.svg"),
            dest: "npm",
          },
        ],
      }),
    ],
  },
];
