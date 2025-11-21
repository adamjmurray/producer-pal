import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

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
    input: join(rootDir, "src/live-api-adapter/live-api-adapter.js"),
    output: {
      file: join(rootDir, "max-for-live-device/live-api-adapter.js"),
      format: "es",
    },
    plugins: [
      replace({
        "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
          process.env.ENABLE_RAW_LIVE_API,
        ),
        preventAssignment: true,
      }),
      { renderChunk: (code) => code.replace(/\nexport.*/, "") }, // remove top-level exports
      terser(terserOptions),
      addLicenseHeader(),
    ],
  },
  {
    input: join(rootDir, "src/mcp-server/mcp-server.js"),
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
      replace({
        "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
          process.env.ENABLE_RAW_LIVE_API,
        ),
        preventAssignment: true,
      }),
      inlineChatUI(), // Inline chat-ui.html for frozen .amxd builds
      resolve({
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
    input: join(rootDir, "src/portal/producer-pal-portal.js"),
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
      resolve({
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
              join(thirdPartyLicensesFolder, "zod-to-json-schema-license"),
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
