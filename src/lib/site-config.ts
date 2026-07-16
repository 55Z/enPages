const siteName = import.meta.env.PUBLIC_SITE_NAME?.trim() || 'DQXDAO';
const contactEmail = import.meta.env.PUBLIC_CONTACT_EMAIL?.trim() || 'marketing_dqxd@163.com';
const contactPhone = import.meta.env.PUBLIC_CONTACT_PHONE?.trim() || '+85-267111305';
const whatsappUrl = import.meta.env.PUBLIC_WHATSAPP_URL?.trim() || '';
const currency = import.meta.env.PUBLIC_CURRENCY?.trim().toUpperCase() || 'CNY';
const showPrice = (import.meta.env.PUBLIC_SHOW_PRICE?.trim().toLowerCase() || 'true') === 'true';

export const siteConfig = {
  siteName,
  contactEmail,
  contactPhone,
  whatsappUrl,
  currency,
  showPrice
};

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(cents / 100);
}

export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function inquiryEmailHref(product?: { id: string; name: string }): string {
  if (!contactEmail) {
    return '#';
  }
  const subject = product
    ? `Inquiry about ${product.name} (Product ${product.id})`
    : `Product inquiry for ${siteName}`;
  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;
}
