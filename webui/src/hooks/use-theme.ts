import { useEffect, useState } from "preact/hooks";

export function useTheme() {
  const [theme, setTheme] = useState("system");

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // Apply theme changes
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      if (theme === "system") {
        root.classList.toggle("dark", mediaQuery.matches);
      } else {
        root.classList.toggle("dark", theme === "dark");
      }
    };

    applyTheme();
    localStorage.setItem("theme", theme);

    // Listen for system theme changes when using "system" theme
    if (theme === "system") {
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
    return undefined;
  }, [theme]);

  return { theme, setTheme };
}
