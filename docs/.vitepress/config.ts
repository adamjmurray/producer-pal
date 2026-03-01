import { defineConfig } from "vitepress";
import { VERSION } from "../../src/shared/version.ts";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Producer Pal",
  description:
    "AI music production assistant for Ableton Live. Works with Claude, Gemini, GPT, and local models.",

  // GitHub Pages base URL
  base: "/",

  sitemap: { hostname: "https://producer-pal.org" },

  cleanUrls: true,

  transformPageData(pageData) {
    const path = pageData.relativePath
      .replace(/\.md$/, "")
      .replace(/\/index$/, "")
      .replace(/^index$/, "");
    const canonicalUrl = `https://producer-pal.org/${path}`;
    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push([
      "link",
      { rel: "canonical", href: canonicalUrl },
    ]);
    pageData.frontmatter.version = VERSION;
  },

  head: [["link", { rel: "icon", href: "/producer-pal-logo.svg" }]],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/producer-pal-logo.svg",

    nav: [
      { text: "Home", link: "/" },
      { text: "Installation", link: "/installation" },
      { text: "Guide", link: "/guide" },
      { text: "Features", link: "/features" },
      { text: "Roadmap", link: "/roadmap" },
      {
        text: "GitHub",
        link: "https://github.com/adamjmurray/producer-pal",
      },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "User Guide", link: "/guide" },
          { text: "Device Interface", link: "/guide/device" },
          { text: "Chat UI", link: "/guide/chat-ui" },
          { text: "Usage Examples", link: "/guide/examples" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Features", link: "/features" },
          { text: "Roadmap", link: "/roadmap" },
          { text: "Known Issues", link: "/known-issues" },
          { text: "Troubleshooting", link: "/installation/troubleshooting" },
        ],
      },
      {
        text: "Installation",
        items: [
          { text: "Overview", link: "/installation" },
          { text: "Upgrading", link: "/installation/upgrading" },
        ],
      },
      {
        text: "Choose by Provider",
        items: [
          { text: "Claude / Anthropic", link: "/installation/choose-claude" },
          { text: "ChatGPT / OpenAI", link: "/installation/choose-openai" },
          { text: "Gemini / Google", link: "/installation/choose-gemini" },
          { text: "Local / Offline", link: "/installation/choose-local" },
          { text: "Multiple Providers", link: "/installation/choose-multi" },
        ],
      },
      {
        text: "Built-in Chat UI",
        items: [
          { text: "Overview", link: "/installation/chat-ui" },
          { text: "Gemini", link: "/installation/gemini" },
          { text: "Ollama", link: "/installation/ollama" },
          {
            text: "Other Providers",
            link: "/installation/chat-ui-other-providers",
          },
        ],
      },
      {
        text: "Desktop Apps",
        items: [
          { text: "Overview", link: "/installation/desktop-apps" },
          { text: "Claude Desktop", link: "/installation/claude-desktop" },
          { text: "LM Studio", link: "/installation/lm-studio" },
        ],
      },
      {
        text: "Command Line",
        items: [
          { text: "Overview", link: "/installation/cli" },
          { text: "Gemini CLI", link: "/installation/gemini-cli" },
          { text: "Codex CLI", link: "/installation/codex-cli" },
          { text: "Claude Code", link: "/installation/claude-code" },
        ],
      },
      {
        text: "Web Apps",
        items: [
          { text: "Overview", link: "/installation/web-apps" },
          { text: "claude.ai", link: "/installation/claude-web" },
          { text: "ChatGPT", link: "/installation/chatgpt-web" },
        ],
      },
      {
        text: "Advanced",
        items: [
          { text: "Other MCP LLMs", link: "/installation/other-mcp" },
          { text: "Web Tunnels", link: "/installation/web-tunnels" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/adamjmurray/producer-pal" },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the GPL-3.0 License.",
      copyright: `Copyright © ${new Date().getFullYear()} <a href="https://adammurray.link">Adam Murray</a>`,
    },
  },
});
