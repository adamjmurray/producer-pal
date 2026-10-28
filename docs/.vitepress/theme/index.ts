import { inBrowser, useRoute } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { defineComponent, h, nextTick, onMounted, watch } from "vue";
import DownloadMarkdown from "./DownloadMarkdown.vue";
import "./demo.css";
import "./footer.css";
import "./get-started.css";
import "./install-paths.css";
import "./screenshots.css";
import "./sidebar.css";
import "./tool-schemas.css";

export default {
  extends: DefaultTheme,
  Layout: defineComponent({
    setup() {
      const route = useRoute();

      onMounted(scrollSidebarToActive);
      watch(
        () => route.path,
        () => void nextTick(scrollSidebarToActive),
      );

      return () =>
        h(DefaultTheme.Layout, null, {
          "doc-before": () => h(DownloadMarkdown),
        });
    },
  }),
  enhanceApp() {
    if (inBrowser) {
      setupImageZoom();
    }
  },
};

/**
 * Scrolls the sidebar so the current page's link is in view. Only scrolls when
 * the link is out of view, so clicking a visible link doesn't make the sidebar
 * jump.
 */
function scrollSidebarToActive() {
  requestAnimationFrame(() => {
    const sidebar = document.querySelector(".VPSidebar");
    const active = sidebar?.querySelector(".VPSidebarItem.is-active > .item");

    if (!(sidebar instanceof HTMLElement) || !(active instanceof HTMLElement)) {
      return;
    }

    const box = sidebar.getBoundingClientRect();
    const link = active.getBoundingClientRect();

    if (link.top < box.top || link.bottom > box.bottom) {
      sidebar.scrollTop += link.top - box.top - box.height / 3;
    }
  });
}

/**
 * Adds click-to-zoom to doc-content screenshots (`.vp-doc img`, excluding any
 * marked `.no-zoom`). Clicking toggles a full-viewport overlay (with a dark
 * backdrop); clicking again, clicking the backdrop, or pressing Escape closes
 * it. Uses event delegation so it survives client-side route changes without
 * re-binding.
 */
function setupImageZoom() {
  let backdrop: HTMLDivElement | null = null;

  const close = () => {
    document.querySelector("img.zoomed")?.classList.remove("zoomed");
    backdrop?.remove();
    backdrop = null;
    document.documentElement.classList.remove("zoom-active");
  };

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (
      !(target instanceof HTMLImageElement) ||
      !target.matches(".vp-doc img:not(.no-zoom)")
    ) {
      return;
    }

    if (target.classList.contains("zoomed")) {
      close();

      return;
    }

    close();
    target.classList.add("zoomed");
    backdrop = document.createElement("div");
    backdrop.className = "zoom-backdrop";
    backdrop.addEventListener("click", close);
    document.body.appendChild(backdrop);
    document.documentElement.classList.add("zoom-active");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });
}
