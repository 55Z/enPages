/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly MALL_API_BASE_URL?: string;
  readonly MALL_TENANT_ID?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SITE_NAME?: string;
  readonly PUBLIC_CONTACT_EMAIL?: string;
  readonly PUBLIC_CONTACT_PHONE?: string;
  readonly PUBLIC_WHATSAPP_URL?: string;
  readonly PUBLIC_SHOW_PRICE?: string;
  readonly PUBLIC_CURRENCY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
