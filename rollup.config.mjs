// rollup.config.mjs
export default [
  {
    input: "src/main.js",
    output: {
      file: "device/main.js",
      format: "es",
    },
    plugins: [
      { renderChunk: (code) => code.replace(/\nexport.*/, "") }, // remove top-level exports
    ],
  },
  {
    input: "src/mcp-server.js",
    output: {
      file: "device/mcp-server.js",
      format: "es",
    },
    external: [
      "@modelcontextprotocol/sdk",
      "@modelcontextprotocol/sdk/server/mcp.js",
      "@modelcontextprotocol/sdk/server/streamableHttp.js",
      "@modelcontextprotocol/sdk/types.js",
      "express",
      "max-api",
      "node:crypto",
      "zod",
    ],
  },
];
