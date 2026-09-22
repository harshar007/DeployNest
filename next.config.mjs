/** @type {import('next').NextConfig} */
const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || (process.env.USE_PYTHON_BACKEND === 'true' ? 'http://127.0.0.1:8000' : null);

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  ...(pythonBackendUrl
    ? {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: `${pythonBackendUrl}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;

