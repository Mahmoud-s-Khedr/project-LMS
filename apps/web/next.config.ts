import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@lms/shared'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
