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

const licenseText = readFileSync(join(rootDir, "LICENSE"), "utf-8");
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
    copyFileSync(join(rootDir, "LICENSE"), destination);
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
      copyLicense(join(rootDir, "max-for-live-device/LICENSE")),
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
    ],
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
      copyLicense(join(rootDir, "claude-desktop-extension/LICENSE")),
    ],
  },
];
