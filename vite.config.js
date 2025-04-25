import { defineConfig } from "vite";
import path from "path";

const dt = new Date();
const version = `"${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${dt.getMinutes()}-${dt.getSeconds()}"`;

const fullReloadAlways = {
  name: "full-reload-always",
  handleHotUpdate({ server }) {
    server.ws.send({ type: "full-reload" });
    return [];
  },
};

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      components: path.resolve("./components"),
      app: path.resolve("."),
      css: path.resolve("./css"),
    },
  },
  optimizeDeps: {
    include: ["tracky-mouse"],
  },
  build: {
    sourcemap: true,
    minify: false,
    target: "esnext",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: "./index.html",
        client: "./client.html",
        "service-worker": "./service-worker.js",
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === "service-worker" 
            ? "[name].js" 
            : "assets/[name].[hash].js";
        },
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash].[ext]",
      },
    },
  },
  define: {
    APP_VERSION: version,
  },
  plugins: [fullReloadAlways],
  server: {
    historyApiFallback: {
      rewrites: [
        { from: /\/session\/.*/, to: "/index.html" },
        { from: /\/client/, to: "/client.html" },
      ],
    },
  },
});