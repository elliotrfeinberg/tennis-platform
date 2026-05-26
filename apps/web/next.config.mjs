/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@tennis/ratings", "@tennis/optimizer", "@tennis/db"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
