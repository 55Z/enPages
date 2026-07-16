import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteUrl = (import.meta.env.PUBLIC_SITE_URL || 'https://www.fooddqxdao.com').replace(/\/+$/, '');
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap-index.xml\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
};
