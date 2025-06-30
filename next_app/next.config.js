/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output a standalone build when `next build` is run
  // output: 'standalone', // Consider this for production if self-hosting with Node.js server

  async rewrites() {
    return [
      {
        // Source path: any path starting with /api/ but NOT /api/agent
        // (as /api/agent is handled by Next.js itself for CopilotKit)
        source: '/api/:path((?!agent).*)',
        // Destination: your main backend server
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
