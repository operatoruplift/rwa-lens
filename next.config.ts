import type { NextConfig } from 'next';

/**
 * The app makes no third-party requests from the browser: every RPC and
 * metadata call happens server-side, so the policy can stay tight.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Mobile Wallet Adapter (Seeker, Android) talks to the wallet app over a
  // localhost WebSocket on an ephemeral port; nothing else leaves the origin.
  "connect-src 'self' ws://localhost:*",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/**
 * One id per build: the commit on Vercel or GitHub, otherwise the build time. It
 * versions the service worker's cache (public/sw.js), so each release drops the
 * caches of the releases before it. Letters, digits, dot, dash and underscore only.
 */
const releaseId = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 12)
  || new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_RELEASE_ID: releaseId },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
