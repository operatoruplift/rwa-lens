import type { MetadataRoute } from 'next';

import { SITE_URL } from './site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Read endpoints answer per-request chain state, so there is nothing
      // stable for a crawler to index behind them.
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
