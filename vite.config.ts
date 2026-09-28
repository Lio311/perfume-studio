import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "preload", test: /preload-helper/, priority: 60 },
            { name: "react", test: /node_modules[\\/](react-dom|react|scheduler)[\\/]/, priority: 50 },
            { name: "state", test: /node_modules[\\/](zustand|use-sync-external-store|immer)[\\/]/, priority: 45 },
            { name: "three", test: /node_modules[\\/]three[\\/]/, priority: 40 },
            { name: "postprocessing", test: /node_modules[\\/]postprocessing[\\/]/, priority: 35 },
            { name: "three-stdlib", test: /node_modules[\\/]three-stdlib[\\/]/, priority: 34 },
            { name: "react-three", test: /node_modules[\\/]@react-three[\\/]/, priority: 20 },
            { name: "pdfjs", test: /node_modules[\\/]pdfjs-dist[\\/]/, priority: 20 },
            { name: "gsap", test: /node_modules[\\/]gsap[\\/]/, priority: 20 },
            { name: "dompurify", test: /node_modules[\\/]dompurify[\\/]/, priority: 15 },
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4327,
    strictPort: true,
    allowedHosts: true,
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4327,
    strictPort: true,
    allowedHosts: true,
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
    },
  },
});
