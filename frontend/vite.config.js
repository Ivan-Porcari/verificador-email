import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El frontend corre en http://127.0.0.1:5173 y reenvía todo lo que empiece
// con /api a la API de FastAPI (http://127.0.0.1:8000). Así no hace falta CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (ruta) => ruta.replace(/^\/api/, ""),
      },
    },
  },
});
