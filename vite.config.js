import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base matches your repo: github.com/aspashur/sg_social
export default defineConfig({
  plugins: [react()],
  base: "/sg_social/",
});
