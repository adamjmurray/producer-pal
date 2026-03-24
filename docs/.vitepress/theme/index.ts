import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import DownloadMarkdown from "./DownloadMarkdown.vue";
import "./demo.css";
import "./get-started.css";
import "./screenshots.css";
import "./tool-schemas.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "doc-before": () => h(DownloadMarkdown),
    });
  },
};
