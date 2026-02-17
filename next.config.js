const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.gravatar.com',
        port: '',
        pathname: '/avatar/**',
      },
      // If you have other image hostnames, add them here
      // Example for Open Collective avatars if they come from a different host:
      {
        protocol: 'https',
        hostname: 'opencollective-production.s3.us-west-1.amazonaws.com',
        port: '',
        pathname: '/**', // Allow any path on this host, as avatars can have various prefixes
      },
      {
        protocol: 'https',
        hostname: 'd1ts43dypk8bqh.cloudfront.net',
        port: '',
        pathname: '/**', // Cloudfront can serve various paths
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com', // Added for Twitter banner images
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

module.exports = withBundleAnalyzer(nextConfig)
