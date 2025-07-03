// rollup.config.mjs
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import { copyFileSync, readFileSync } from "fs";

const licenseText = readFileSync("LICENSE.md", "utf-8");
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
    copyFileSync("LICENSE.md", destination);
  },
});

export default [
  {
    input: "src/main.js",
    output: {
      file: "device/main.js",
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
      copyLicense("device/LICENSE.md"),
    ],
  },
  {
    input: "src/mcp-server.js",
    output: {
      file: "device/mcp-server.mjs",
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
    input: "src/desktop-extension/claude-ableton-connector.js",
    output: {
      file: "desktop-extension/claude-ableton-connector.js",
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
      copyLicense("desktop-extension/LICENSE.md"),
    ],
  },
];
