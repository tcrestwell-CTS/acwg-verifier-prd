/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Prisma on Vercel — bundles the engine correctly
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/.prisma/client/**"],
  },

  // Suppress Prisma edge-runtime warning (we're on Node runtime)
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
