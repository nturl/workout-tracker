/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PT exercise stills are read from disk by an auth-gated route, not served
    // from public/; make sure Vercel bundles them with that function.
    outputFileTracingIncludes: {
      '/api/exercise-image/[name]': ['./src/assets/exercises/**'],
    },
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/icon-:size(\\d+).png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=604800',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/api/sync',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=0, s-maxage=60, stale-while-revalidate=300',
          },
        ],
      },
      {
        source: '/api/recovery',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=0, s-maxage=120, stale-while-revalidate=300',
          },
        ],
      },
      {
        source: '/api/oura/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=0, s-maxage=60, stale-while-revalidate=120',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
