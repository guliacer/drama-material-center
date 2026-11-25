import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { authPlugin } from "./server/authPlugin.ts";
import { knowledgeCaseMediaPlugin } from "./server/knowledgeCaseMedia.ts";
import { materialLibraryPlugin } from "./server/materialLibraryPlugin.ts";
import { weeklyRadarPlugin } from "./server/weeklyRadarPlugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const extraHosts = (env.PREVIEW_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return {
    appType: "spa",
    test: {
      // Skill suites use node:test and run through test:skills.
      exclude: [...configDefaults.exclude, "**/.agents/**"],
    },
    plugins: [
      authPlugin({
        issuer: env.GULI_IDENTITY_ISSUER,
        userinfoUrl: env.GULI_IDENTITY_USERINFO_URL,
      }),
      react(),
      weeklyRadarPlugin(),
      materialLibraryPlugin({ workspaceRoot: env.MATERIAL_CENTER_WORKSPACE }),
      knowledgeCaseMediaPlugin(),
    ],
    server: {
      host: "127.0.0.1",
      port: 4373,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: 4374,
      strictPort: true,
      ...(extraHosts.length ? { allowedHosts: extraHosts } : {}),
    },
  };
});
