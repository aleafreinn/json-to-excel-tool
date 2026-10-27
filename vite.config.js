import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["0cda-2001-d08-d5-7aad-4b0-40ad-6ef-88e.ngrok-free.app"],
  },
});
