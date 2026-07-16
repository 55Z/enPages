import {
  ApiCategorySchema,
  ApiProductDetailSchema,
  ApiProductPageSchema,
  ApiResultSchema,
  type ApiCategory,
  type ApiProductDetail,
  type ApiProductSku,
  type SiteCatalog,
  type SiteCategory,
  type SiteProduct,
  type SiteSku
} from './schema';
import type { z } from 'zod';

const PAGE_SIZE = 200;
const DETAIL_CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

let catalogPromise: Promise<SiteCatalog> | undefined;

function requiredEnv(name: 'MALL_API_BASE_URL' | 'MALL_TENANT_ID'): string {
  const defaults = {
    MALL_API_BASE_URL: 'https://admin-api.dqxdao.com/app-api',
    MALL_TENANT_ID: '163'
  };
  const value = import.meta.env[name]?.trim() || defaults[name];
  if (!value) {
    throw new Error(`${name} is required to build the product catalog.`);
  }
  return value;
}

function apiUrl(path: string, query?: URLSearchParams): string {
  const baseUrl = requiredEnv('MALL_API_BASE_URL').replace(/\/+$/, '');
  return `${baseUrl}${path}${query ? `?${query.toString()}` : ''}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'tenant-id': requiredEnv('MALL_TENANT_ID'),
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (!response.ok) {
        const message = `Product API request failed: ${response.status} ${response.statusText} (${url})`;
        if (response.status < 500 || attempt === MAX_ATTEMPTS) {
          throw new Error(message);
        }
        lastError = new Error(message);
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) {
        break;
      }
    }

    await delay(400 * attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to load product API data from ${url}`);
}

async function fetchApi<TSchema extends z.ZodTypeAny>(
  path: string,
  dataSchema: TSchema,
  query?: URLSearchParams
): Promise<z.output<TSchema>> {
  const url = apiUrl(path, query);
  const result = ApiResultSchema(dataSchema).parse(await fetchJson(url));
  if (result.code !== 0) {
    throw new Error(`Product API returned code ${result.code}: ${result.msg || 'Unknown error'} (${url})`);
  }
  return result.data as z.output<TSchema>;
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  return [...new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url)))];
}

function sanitizeDescription(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|meta|link|base|svg|math)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|data:text\/html)[\s\S]*?\2/gi, '')
    .trim();
}

function normalizeCategory(category: ApiCategory): SiteCategory {
  return {
    id: String(category.id),
    parentId: category.parentId > 0 ? String(category.parentId) : null,
    name: category.name,
    description: '',
    imageUrl: category.picUrl || undefined
  };
}

function normalizeSku(sku: ApiProductSku, fallbackImage: string): SiteSku {
  const specifications = sku.properties
    .filter((property) => property.propertyId !== 0 || property.valueId !== 0)
    .filter((property) => property.propertyName && property.valueName)
    .map((property) => ({
      name: property.propertyName,
      value: property.valueName
    }));

  return {
    id: String(sku.id),
    imageUrl: sku.picUrl || fallbackImage || undefined,
    specifications,
    price: sku.price,
    marketPrice: sku.marketPrice ?? undefined,
    stock: sku.stock ?? undefined,
    weight: sku.weight ?? undefined,
    volume: sku.volume ?? undefined
  };
}

function normalizeProduct(product: ApiProductDetail): SiteProduct {
  const images = uniqueUrls([product.picUrl, ...product.sliderPicUrls]);
  return {
    id: String(product.id),
    name: product.name,
    introduction: product.introduction,
    descriptionHtml: sanitizeDescription(product.description),
    categoryId: String(product.categoryId),
    topCategoryId: product.topCategoryId ? String(product.topCategoryId) : undefined,
    coverImageUrl: product.picUrl,
    imageUrls: images,
    price: product.price,
    marketPrice: product.marketPrice ?? undefined,
    stock: product.stock ?? undefined,
    salesCount: product.salesCount ?? undefined,
    skus: product.skus.map((sku) => normalizeSku(sku, product.picUrl))
  };
}

async function fetchCategories(): Promise<SiteCategory[]> {
  const categories = await fetchApi(
    '/product/category/list',
    ApiCategorySchema.array()
  );
  return categories.map(normalizeCategory);
}

async function fetchAllProductIds(): Promise<string[]> {
  const ids: string[] = [];
  let pageNo = 1;
  let total = Number.POSITIVE_INFINITY;

  while (ids.length < total) {
    const page = await fetchApi(
      '/product/spu/page',
      ApiProductPageSchema,
      new URLSearchParams({
        pageNo: String(pageNo),
        pageSize: String(PAGE_SIZE)
      })
    );

    total = page.total;
    ids.push(...page.list.map((product) => String(product.id)));

    if (page.list.length === 0) {
      break;
    }
    pageNo += 1;
  }

  if (ids.length !== new Set(ids).size) {
    throw new Error('The product API returned duplicate product IDs.');
  }

  return ids;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function fetchProductDetail(id: string): Promise<SiteProduct> {
  const product = await fetchApi(
    '/product/spu/get-detail',
    ApiProductDetailSchema,
    new URLSearchParams({ id })
  );
  return normalizeProduct(product);
}

function descendantCategoryIds(categoryId: string, categories: SiteCategory[]): Set<string> {
  const ids = new Set<string>([categoryId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return ids;
}

function addCategoryFallbackImages(categories: SiteCategory[], products: SiteProduct[]): SiteCategory[] {
  return categories.map((category) => {
    if (category.imageUrl) {
      return category;
    }
    const categoryIds = descendantCategoryIds(category.id, categories);
    const product = products.find((item) => categoryIds.has(item.categoryId));
    return product ? { ...category, imageUrl: product.coverImageUrl } : category;
  });
}

async function loadCatalog(): Promise<SiteCatalog> {
  const [categories, productIds] = await Promise.all([
    fetchCategories(),
    fetchAllProductIds()
  ]);
  const products = await mapWithConcurrency(productIds, DETAIL_CONCURRENCY, fetchProductDetail);

  const categoryIds = new Set(categories.map((category) => category.id));
  for (const product of products) {
    if (!categoryIds.has(product.categoryId)) {
      throw new Error(`Product ${product.id} references missing category ${product.categoryId}.`);
    }
  }

  console.info(
    `[catalog] tenant=${requiredEnv('MALL_TENANT_ID')} categories=${categories.length} products=${products.length}`
  );

  return {
    generatedAt: new Date().toISOString(),
    categories: addCategoryFallbackImages(categories, products),
    products
  };
}

export function getCatalog(): Promise<SiteCatalog> {
  catalogPromise ??= loadCatalog();
  return catalogPromise;
}

export async function getProducts(): Promise<SiteProduct[]> {
  return [...(await getCatalog()).products];
}

export async function getCategories(): Promise<SiteCategory[]> {
  return [...(await getCatalog()).categories];
}

export async function getTopLevelCategories(): Promise<SiteCategory[]> {
  return (await getCategories()).filter((category) => category.parentId === null);
}

export async function getProduct(id: string): Promise<SiteProduct | undefined> {
  return (await getProducts()).find((product) => product.id === id);
}

export async function getCategory(categoryId: string): Promise<SiteCategory | undefined> {
  return (await getCategories()).find((category) => category.id === categoryId);
}

export async function getProductsForCategory(categoryId: string): Promise<SiteProduct[]> {
  const categories = await getCategories();
  const ids = descendantCategoryIds(categoryId, categories);
  return (await getProducts()).filter((product) => ids.has(product.categoryId));
}
