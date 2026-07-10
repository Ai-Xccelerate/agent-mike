import type { NextConfig } from "next";

// SVGR must KEEP the viewBox (SVGO's preset-default strips it by default when
// width/height are present). Without a viewBox an SVG can't scale — any CSS
// size smaller than its intrinsic px just clips the artwork. Preserving it lets
// every icon scale cleanly at any size / density.
const svgrOptions = {
  svgoConfig: {
    plugins: [
      {
        name: "preset-default",
        params: { overrides: { removeViewBox: false } },
      },
    ],
  },
};

const nextConfig: NextConfig = {
  output: "standalone",
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: [{ loader: "@svgr/webpack", options: svgrOptions }],
    });
    return config;
  },

  turbopack: {
    rules: {
      "*.svg": {
        loaders: [{ loader: "@svgr/webpack", options: svgrOptions }],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
