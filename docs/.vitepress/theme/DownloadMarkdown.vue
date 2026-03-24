<script setup>
import { computed } from "vue";
import { useData } from "vitepress";

const { page } = useData();

const url = computed(() => `/markdown/${page.value.relativePath}`);

const filename = computed(() => {
  const parts = page.value.relativePath.split("/");
  return parts[parts.length - 1];
});
</script>

<template>
  <div class="download-markdown">
    <a :href="url" :download="filename" title="Download as Markdown">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  </div>
</template>

<style scoped>
.download-markdown {
  text-align: right;
  margin-bottom: 0.5rem;
}

.download-markdown a {
  color: var(--vp-c-text-3);
  display: inline-block;
  line-height: 1;
}

.download-markdown a:hover {
  color: var(--vp-c-brand-1);
}
</style>
