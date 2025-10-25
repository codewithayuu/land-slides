const isProd = process.env.NODE_ENV === 'production';
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isProd ? [] : ["'unsafe-eval'"]),
].join(' ');

const ContentSecurityPolicy = `
  default-src 'self';
  base-uri 'self';
  frame-ancestors 'none';
  form-action 'self';
  script-src ${scriptSrc};
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob: https://*.tile.openstreetmap.org;
  font-src 'self' https://fonts.gstatic.com data:;
  connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://*.tile.openstreetmap.org;
`;

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy.replace(/\s{2,}/g, ' ').trim() },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Only enable HSTS for your own domain (not for *.vercel.app previews)
  // { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), fullscreen=(self)' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
