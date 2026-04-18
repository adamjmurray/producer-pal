import { defineConfig } from "vitepress";
import { VERSION } from "../../src/shared/version.ts";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Producer Pal",
  titleTemplate: ":title | Producer Pal — Ableton MCP for AI music production",
  description:
    "Producer Pal is an Ableton MCP server — AI for Ableton Live that works with Claude, Gemini, ChatGPT, and local models.",

  // GitHub Pages base URL
  base: "/",

  sitemap: { hostname: "https://producer-pal.org" },

  cleanUrls: true,

  srcExclude: ["_generated/**", "public/markdown/**"],

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

  head: [
    ["link", { rel: "icon", href: "/producer-pal-logo.svg" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "Ableton MCP, AI for Ableton, Ableton Live MCP, Ableton AI, AI music production, Max for Live MCP server, Claude Ableton, Gemini Ableton, ChatGPT Ableton",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Producer Pal" }],
    [
      "meta",
      {
        property: "og:title",
        content: "Producer Pal — Ableton MCP for AI music production",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Producer Pal is an Ableton MCP server — AI for Ableton Live that works with Claude, Gemini, ChatGPT, and local models.",
      },
    ],
    ["meta", { property: "og:url", content: "https://producer-pal.org" }],
    [
      "meta",
      {
        property: "og:image",
        content: "https://producer-pal.org/producer-pal-logo.png",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    [
      "meta",
      {
        name: "twitter:title",
        content: "Producer Pal — Ableton MCP for AI music production",
      },
    ],
    [
      "meta",
      {
        name: "twitter:description",
        content:
          "Producer Pal is an Ableton MCP server — AI for Ableton Live that works with Claude, Gemini, ChatGPT, and local models.",
      },
    ],
    [
      "meta",
      {
        name: "twitter:image",
        content: "https://producer-pal.org/producer-pal-logo.png",
      },
    ],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/producer-pal-logo.svg",

    nav: [
      { text: "Features", link: "/features" },
      { text: "Installation", link: "/installation" },
      { text: "Guide", link: "/guide" },
      { text: "Support", link: "/support" },
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
          { text: "REST API", link: "/guide/rest-api" },
        ],
      },
      {
        text: "Features",
        items: [
          { text: "Feature List", link: "/features" },
          { text: "Extending", link: "/extending" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "Support",
        items: [
          { text: "Overview", link: "/support" },
          { text: "Troubleshooting", link: "/support/troubleshooting" },
          { text: "Known Issues", link: "/support/known-issues" },
        ],
      },
      {
        text: "Installation",
        items: [
          { text: "Overview", link: "/installation" },
          { text: "Upgrading", link: "/installation/upgrading" },
          {
            text: "Choose by Provider",
            collapsed: false,
            items: [
              {
                text: "Claude / Anthropic",
                link: "/installation/choose-claude",
              },
              {
                text: "ChatGPT / OpenAI",
                link: "/installation/choose-openai",
              },
              {
                text: "Gemini / Google",
                link: "/installation/choose-gemini",
              },
              {
                text: "Mistral / Mistral AI",
                link: "/installation/choose-mistral",
              },
              { text: "Local / Offline", link: "/installation/choose-local" },
              {
                text: "Multiple Providers",
                link: "/installation/choose-multi",
              },
            ],
          },
          {
            text: "Built-in Chat UI",
            collapsed: false,
            items: [
              { text: "Overview", link: "/installation/chat-ui" },
              { text: "Gemini", link: "/installation/gemini" },
              { text: "OpenAI", link: "/installation/openai" },
              { text: "Ollama", link: "/installation/ollama" },
              {
                text: "Other Providers",
                link: "/installation/chat-ui-other-providers",
              },
            ],
          },
          {
            text: "Desktop Apps",
            collapsed: false,
            items: [
              { text: "Overview", link: "/installation/desktop-apps" },
              {
                text: "Claude Desktop",
                link: "/installation/claude-desktop",
              },
              { text: "Codex App", link: "/installation/codex-app" },
              { text: "LM Studio", link: "/installation/lm-studio" },
            ],
          },
          {
            text: "Command Line",
            collapsed: false,
            items: [
              { text: "Overview", link: "/installation/cli" },
              { text: "Gemini CLI", link: "/installation/gemini-cli" },
              { text: "Codex CLI", link: "/installation/codex-cli" },
              { text: "Claude Code", link: "/installation/claude-code" },
              { text: "Mistral Vibe", link: "/installation/mistral-vibe" },
            ],
          },
          {
            text: "Web Apps",
            collapsed: false,
            items: [
              { text: "Overview", link: "/installation/web-apps" },
              { text: "claude.ai", link: "/installation/claude-web" },
              { text: "ChatGPT", link: "/installation/chatgpt-web" },
              { text: "Le Chat", link: "/installation/mistral-le-chat" },
            ],
          },
          {
            text: "Advanced",
            collapsed: false,
            items: [
              { text: "Other MCP LLMs", link: "/installation/other-mcp" },
              { text: "Web Tunnels", link: "/installation/web-tunnels" },
            ],
          },
        ],
      },
    ],

    socialLinks: [
      { icon: "discord", link: "https://discord.gg/rmU3DSzgwH" },
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
