import { defineConfig } from "vitepress";
import { VERSION } from "../../src/shared/config.ts";

const SITE_URL = "https://producer-pal.org";
const SITE_TITLE = "Producer Pal — Ableton MCP for AI music production";
const SITE_DESCRIPTION =
  "The most actively developed Ableton MCP server — AI for Ableton Live, updated for the latest Live features. Works with Claude, Gemini, ChatGPT, and local models.";
const SOCIAL_IMAGE = `${SITE_URL}/producer-pal-social-card.png`;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Producer Pal",
  titleTemplate: ":title | Producer Pal — Ableton MCP for AI music production",
  description: SITE_DESCRIPTION,

  // GitHub Pages base URL
  base: "/",

  sitemap: {
    hostname: "https://producer-pal.org",
    // Keep redirect stubs out of the sitemap so crawlers index the
    // destination, not the redirect.
    transformItems: (items) =>
      items.filter(
        (item) =>
          !item.url.startsWith("guide/examples") &&
          item.url !== "installation/codex-app" &&
          item.url !== "installation/lm-studio",
      ),
  },

  cleanUrls: true,

  srcExclude: ["_generated/**", "_partials/**", "public/markdown/**"],

  transformPageData(pageData) {
    const path = pageData.relativePath
      .replace(/\.md$/, "")
      .replace(/\/index$/, "")
      .replace(/^index$/, "");

    pageData.frontmatter.head ??= [];
    const head = pageData.frontmatter.head;
    const hasMeta = (property: string) =>
      head.some(
        ([tag, attrs]) => tag === "meta" && attrs?.property === property,
      );

    // Respect a page's own canonical (redirect stubs point at their
    // replacement); two canonicals would make search engines ignore both.
    const ownCanonical = head.find(
      ([tag, attrs]) => tag === "link" && attrs?.rel === "canonical",
    )?.[1]?.href;
    const canonical = ownCanonical ?? `${SITE_URL}/${path}`;

    if (ownCanonical == null) {
      head.push(["link", { rel: "canonical", href: canonical }]);
    }

    // Per-page social tags. Without these every page inherits the site-wide
    // values from `head` below, so a shared deep link previews as the
    // homepage. og:url tracks the canonical because that's the URL Facebook
    // and Discord resolve the share to.
    head.push(["meta", { property: "og:url", content: canonical }]);

    if (!hasMeta("og:title")) {
      head.push([
        "meta",
        { property: "og:title", content: socialTitle(pageData.title) },
      ]);
    }

    if (!hasMeta("og:description")) {
      head.push([
        "meta",
        {
          property: "og:description",
          content: pageData.description || SITE_DESCRIPTION,
        },
      ]);
    }

    pageData.frontmatter.version = VERSION;
  },

  head: [
    ["link", { rel: "icon", href: "/producer-pal-logo.svg" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "Ableton MCP, AI for Ableton, Ableton Live MCP, Ableton AI, AI music production, Max for Live MCP server, Claude Ableton, Gemini Ableton, ChatGPT Ableton, Ableton REST API, Ableton Live REST API, Ableton HTTP API, Ableton Live API, Agent Skills, Claude Skills, Codex Skills, Gemini Skills, Coding Agent Skills, Ableton Live Agent Skill, SKILL.md",
      },
    ],
    // Fallbacks for pages transformPageData doesn't reach (404). Every real
    // page overrides og:title/og:description/og:url with its own.
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "Producer Pal" }],
    ["meta", { property: "og:title", content: SITE_TITLE }],
    ["meta", { property: "og:description", content: SITE_DESCRIPTION }],
    ["meta", { property: "og:url", content: SITE_URL }],
    ["meta", { property: "og:image", content: SOCIAL_IMAGE }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { property: "og:image:alt", content: SITE_TITLE }],
    // X reads og:* when the twitter:* equivalents are absent, so twitter:card
    // is the only tag worth duplicating — it picks the large card layout.
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/producer-pal-logo.svg",

    nav: [
      { text: "Installation", link: "/installation" },
      { text: "Guide", link: "/guide" },
      { text: "Features", link: "/features" },
      { text: "How It Works", link: "/how-it-works" },
      { text: "Vision", link: "/vision" },
      { text: "Support", link: "/support" },
      {
        text: "GitHub",
        link: "https://github.com/adamjmurray/producer-pal",
      },
    ],

    sidebar: [
      {
        text: "Guide",
        link: "/guide",
        items: [
          { text: "Device Interface", link: "/guide/device" },
          { text: "Chat UI", link: "/guide/chat-ui" },
          { text: "Context & Memory", link: "/guide/context" },
          { text: "Customizing Skills", link: "/guide/customizing-skills" },
          { text: "Optimizing Cost & Context", link: "/guide/optimizing" },
        ],
      },
      {
        // The three ways into the device. Keep them together and out of the
        // Guide list, or MCP reads as the only real path.
        text: "Integrations",
        items: [
          { text: "MCP (npx producer-pal)", link: "/guide/npx-cli" },
          { text: "REST API", link: "/guide/rest-api" },
          { text: "Agent Skills", link: "/guide/skills" },
          { text: "Extending", link: "/extending" },
        ],
      },
      {
        text: "Features",
        link: "/features",
        items: [
          { text: "Tool Reference", link: "/features/tools" },
          { text: "Usage Examples", link: "/features/examples" },
          { text: "MIDI Notation", link: "/features/midi-notation" },
          { text: "Limitations", link: "/features/limitations" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "How It Works",
        link: "/how-it-works",
        items: [
          {
            text: "Running Inside Live",
            link: "/how-it-works/running-inside-live",
          },
          {
            text: "JSON Over Patch Cables",
            link: "/how-it-works/the-bridge",
          },
          {
            text: "More Than a Wrapper",
            link: "/how-it-works/more-than-a-wrapper",
          },
          {
            text: "Why Not an Extension",
            link: "/how-it-works/why-not-an-extension",
          },
        ],
      },
      {
        text: "Vision",
        link: "/vision",
      },
      {
        text: "Support",
        link: "/support",
        items: [
          { text: "Troubleshooting", link: "/support/troubleshooting" },
          { text: "Known Issues", link: "/support/known-issues" },
        ],
      },
      {
        text: "Installation",
        link: "/installation",
        items: [
          { text: "Upgrading", link: "/installation/upgrading" },
          {
            text: "Built-in Chat UI",
            link: "/installation/chat-ui",
            items: [
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
            link: "/installation/desktop-apps",
            items: [
              {
                text: "Claude Desktop",
                link: "/installation/claude-desktop",
              },
              { text: "ChatGPT App", link: "/installation/chatgpt-app" },
              { text: "Antigravity", link: "/installation/antigravity" },
              { text: "LM Studio Bionic", link: "/installation/bionic" },
            ],
          },
          {
            text: "Command Line",
            link: "/installation/cli",
            items: [
              { text: "Gemini CLI", link: "/installation/gemini-cli" },
              { text: "Codex CLI", link: "/installation/codex-cli" },
              { text: "Claude Code", link: "/installation/claude-code" },
              { text: "Mistral Vibe", link: "/installation/mistral-vibe" },
            ],
          },
          {
            text: "Web Apps",
            link: "/installation/web-apps",
            items: [
              { text: "claude.ai", link: "/installation/claude-web" },
              { text: "ChatGPT Web", link: "/installation/chatgpt-web" },
              { text: "Le Chat", link: "/installation/mistral-le-chat" },
            ],
          },
          {
            text: "Choose by Provider",
            link: "/installation/choose-by-provider",
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
            text: "Advanced",
            link: "/installation/advanced",
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
      { icon: "youtube", link: "https://www.youtube.com/@adammurray-link" },
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

/**
 * Build a page's og:title. Social cards get a shorter suffix than the browser
 * title, since preview cards truncate around 60 characters.
 * @param title the page's resolved title
 * @returns the title, brand-suffixed unless it already names the brand
 */
function socialTitle(title: string | undefined): string {
  if (!title) return SITE_TITLE;

  return title.includes("Producer Pal") ? title : `${title} — Producer Pal`;
}
