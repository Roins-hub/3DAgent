import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  envDir: path.resolve(__dirname, "../web"),
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ["vue"],
          naive: ["naive-ui", "@vicons/ionicons5"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  server: {
    port: 3100,
    strictPort: false,
  },
  preview: {
    port: 3100,
  },
});
