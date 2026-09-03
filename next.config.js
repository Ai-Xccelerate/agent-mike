/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pg", "pg-native", "pdf-parse"],
    instrumentationHook: true,
  },
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(__dirname);
    return config;
  },
};

module.exports = nextConfig;
