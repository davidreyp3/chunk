import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    // '/tv' and '/analisis' were separate routes before the single-page menu.
    return [
      { source: '/tv', destination: '/', permanent: false },
      { source: '/analisis', destination: '/', permanent: false },
    ];
  },
};
export default nextConfig;
