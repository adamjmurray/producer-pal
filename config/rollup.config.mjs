// config/rollup.config.mjs
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { copyFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const licenseText = readFileSync(join(rootDir, "LICENSE.md"), "utf-8");
const licenseHeader = `/*\n${licenseText}\n*/\n\n`;

const terserOptions = {
  compress: false,
  mangle: false,
  format: {
    comments: false,
    beautify: true,
    indent_level: 2,
  },
};

const addLicenseHeader = () => ({
  name: "add-license-header",
  renderChunk(code) {
    return licenseHeader + code;
  },
});

const copyLicense = (destination) => ({
  name: "copy-license",
  writeBundle() {
    copyFileSync(join(rootDir, "LICENSE.md"), destination);
  },
});

export default [
  {
    input: join(rootDir, "src/main.js"),
    output: {
      file: join(rootDir, "device/main.js"),
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
      copyLicense(join(rootDir, "device/LICENSE.md")),
    ],
  },
  {
    input: join(rootDir, "src/mcp-server.js"),
    output: {
      file: join(rootDir, "device/mcp-server.mjs"),
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
      resolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      json(),
      terser(terserOptions),
    ],
  },
  {
    input: join(rootDir, "src/desktop-extension/claude-ableton-connector.js"),
    output: {
      file: join(rootDir, "desktop-extension/claude-ableton-connector.js"),
      format: "es",
    },
    plugins: [
      replace({
        "process.env.ENABLE_RAW_LIVE_API": JSON.stringify(
          process.env.ENABLE_RAW_LIVE_API,
        ),
        delimiters: ["", ""],
        'import pkceChallenge from "pkce-challenge";':
          'const pkceChallenge = () => { throw new Error("Authorization not supported - Producer Pal uses local HTTP communication only"); };',
        preventAssignment: true,
      }),
      resolve({
        preferBuiltins: true,
        browser: false,
      }),
      commonjs(),
      json(),
      terser(terserOptions),
      copyLicense(join(rootDir, "desktop-extension/LICENSE.md")),
    ],
  },
];
