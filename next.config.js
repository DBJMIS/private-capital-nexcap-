/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
