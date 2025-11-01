import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Rollup plugin to inline chat-ui.html as a virtual module.
 * This allows the MCP server bundle to work in frozen .amxd builds
 * where external file access is not available.
 */
export function inlineChatUI() {
  return {
    name: "inline-chat-ui",
    resolveId(id) {
      if (id === "virtual:chat-ui-html") {
        return id; // Mark as virtual module
      }
    },
    load(id) {
      if (id === "virtual:chat-ui-html") {
        const htmlPath = join(__dirname, "../max-for-live-device/chat-ui.html");
        try {
          const htmlContent = readFileSync(htmlPath, "utf-8");
          // Escape backticks, backslashes, and dollar signs for template literal
          const escaped = htmlContent
            .replace(/\\/g, "\\\\")
            .replace(/`/g, "\\`")
            .replace(/\$/g, "\\$");
          return `export default \`${escaped}\`;`;
        } catch (error) {
          throw new Error(
            `Failed to read chat-ui.html: ${error.message}\n` +
              `Run "npm run ui:build" first to generate the chat UI.`,
          );
        }
      }
    },
  };
}
