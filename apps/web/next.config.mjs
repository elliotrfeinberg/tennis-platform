/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@tennis/ratings",
    "@tennis/optimizer",
    "@tennis/db",
    "@tennis/fixtures",
  ],
  experimental: {
    typedRoutes: true,
  },
  // Workspace packages import siblings with the ".js" extension (ESM
  // convention) but their source files are ".ts". tsx handles this rewrite
  // for the worker; we need the same for webpack here.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
