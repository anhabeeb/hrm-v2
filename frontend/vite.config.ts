import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getNodeModulePackageName(id: string) {
  const normalized = id.replace(/\\/g, "/");
  const marker = "/node_modules/";
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return "";
  const afterNodeModules = normalized.slice(index + marker.length);
  const parts = afterNodeModules.split("/");
  if (parts[0]?.startsWith("@")) return `${parts[0]}/${parts[1] ?? ""}`;
  return parts[0] ?? "";
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const packageName = getNodeModulePackageName(id);
          if (["react", "react-dom", "scheduler"].includes(packageName)) return "react-vendor";
          if (["react-router", "react-router-dom", "@remix-run/router"].includes(packageName)) return "router-vendor";
          if (packageName.startsWith("@radix-ui/") || ["lucide-react", "clsx", "tailwind-merge"].includes(packageName)) return "ui-vendor";
          return "vendor";
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      }
    }
  }
});
