import path from 'node:path'
import { fileURLToPath } from 'node:url'

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@journal/domain',
    '@journal/github',
    '@journal/visualizations',
    '@journal/ai',
    '@journal/export',
    '@journal/db',
  ],
  outputFileTracingRoot: monorepoRoot,
}

export default nextConfig
