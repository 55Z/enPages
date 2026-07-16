import type { APIRoute } from 'astro';
import { getCategories, getProducts } from '../lib/catalog';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [products, categories] = await Promise.all([getProducts(), getCategories()]);
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  return new Response(JSON.stringify(products.map((product) => ({
    id: product.id,
    name: product.name,
    introduction: product.introduction,
    categoryId: product.categoryId,
    categoryName: categoryMap.get(product.categoryId) || ''
  }))), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300'
    }
  });
};
