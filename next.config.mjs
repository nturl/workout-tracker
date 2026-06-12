/** @type {import('next').NextConfig} */
const nextConfig = {
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
