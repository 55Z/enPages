import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/catalog';

export const prerender = true;

export const GET: APIRoute = async () => {
  const catalog = await getCatalog();
  return new Response(JSON.stringify({
    generatedAt: catalog.generatedAt,
    productCount: catalog.products.length,
    categoryCount: catalog.categories.length
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
};
