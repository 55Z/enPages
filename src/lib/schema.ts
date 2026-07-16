import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const optionalText = z.string().nullish().transform((value) => value?.trim() || '');
const optionalUrl = z.string().nullish().transform((value) => value?.trim() || '');

export const ApiResultSchema = <T extends z.ZodTypeAny>(data: T) => z.object({
  code: z.number(),
  data,
  msg: z.string().nullish().transform((value) => value || '')
});

export const ApiCategorySchema = z.object({
  id: z.number(),
  parentId: z.number(),
  name: nonEmptyString,
  picUrl: optionalUrl
});

export const ApiProductSummarySchema = z.object({
  id: z.number(),
  name: nonEmptyString,
  introduction: optionalText,
  categoryId: z.number(),
  picUrl: nonEmptyString,
  sliderPicUrls: z.array(z.string()).nullish().transform((value) => value || []),
  specType: z.boolean().nullish(),
  price: z.number().int().nonnegative(),
  marketPrice: z.number().int().nonnegative().nullish(),
  stock: z.number().int().nonnegative().nullish(),
  salesCount: z.number().int().nonnegative().nullish(),
  deliveryTypes: z.array(z.number().int()).nullish().transform((value) => value || [])
});

export const ApiProductPageSchema = z.object({
  list: z.array(ApiProductSummarySchema),
  total: z.number().int().nonnegative()
});

export const ApiProductPropertySchema = z.object({
  propertyId: z.number(),
  propertyName: optionalText,
  valueId: z.number(),
  valueName: optionalText
});

export const ApiProductSkuSchema = z.object({
  id: z.number(),
  properties: z.array(ApiProductPropertySchema).nullish().transform((value) => value || []),
  price: z.number().int().nonnegative(),
  marketPrice: z.number().int().nonnegative().nullish(),
  vipPrice: z.number().int().nonnegative().nullish(),
  picUrl: optionalUrl,
  stock: z.number().int().nonnegative().nullish(),
  weight: z.number().nonnegative().nullish(),
  volume: z.number().nonnegative().nullish()
});

export const ApiProductDetailSchema = z.object({
  id: z.number(),
  name: nonEmptyString,
  introduction: optionalText,
  description: optionalText,
  topCategoryId: z.number().nullish(),
  categoryId: z.number(),
  picUrl: nonEmptyString,
  sliderPicUrls: z.array(z.string()).nullish().transform((value) => value || []),
  specType: z.boolean().nullish(),
  price: z.number().int().nonnegative(),
  marketPrice: z.number().int().nonnegative().nullish(),
  stock: z.number().int().nonnegative().nullish(),
  skus: z.array(ApiProductSkuSchema).nullish().transform((value) => value || []),
  salesCount: z.number().int().nonnegative().nullish()
});

export type ApiCategory = z.output<typeof ApiCategorySchema>;
export type ApiProductDetail = z.output<typeof ApiProductDetailSchema>;
export type ApiProductSku = z.output<typeof ApiProductSkuSchema>;

export interface SiteCategory {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  imageUrl?: string;
}

export interface SiteSpecification {
  name: string;
  value: string;
}

export interface SiteSku {
  id: string;
  imageUrl?: string;
  specifications: SiteSpecification[];
  price: number;
  marketPrice?: number;
  stock?: number;
  weight?: number;
  volume?: number;
}

export interface SiteProduct {
  id: string;
  name: string;
  introduction: string;
  descriptionHtml: string;
  categoryId: string;
  topCategoryId?: string;
  coverImageUrl: string;
  imageUrls: string[];
  price: number;
  marketPrice?: number;
  stock?: number;
  salesCount?: number;
  skus: SiteSku[];
}

export interface SiteCatalog {
  generatedAt: string;
  categories: SiteCategory[];
  products: SiteProduct[];
}
