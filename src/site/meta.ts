// Page metadata, shared by the running app (usePageMeta) and the build step
// that prerenders each route's <head> for search engines and link previews.
import { SLABS, type Slab } from '../slabs';
import { BRAND } from './brand';

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  image?: string; // site-relative
  noindex?: boolean;
  jsonLd?: object[];
}

const org = (site: string) => ({
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: BRAND.name,
  url: site,
  logo: `${site}/icons/icon-512.png`,
  image: `${site}/og.jpg`,
  telephone: BRAND.showroom.phone,
  address: { '@type': 'PostalAddress', streetAddress: BRAND.showroom.address, addressCountry: 'IN' },
  openingHours: 'Mo-Sa 10:00-19:00',
});

const slabLd = (s: Slab, site: string) => [
  {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: s.name,
    description: s.description,
    image: `${site}${s.image}`,
    brand: { '@type': 'Brand', name: BRAND.name },
    material: 'Natural marble',
    countryOfOrigin: s.origin.split(', ').pop(),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Finish', value: s.finish },
      { '@type': 'PropertyValue', name: 'Slab size', value: `${s.sizeMm[0]} x ${s.sizeMm[1]} mm` },
      { '@type': 'PropertyValue', name: 'Thickness', value: `${s.thicknessMm.join(', ')} mm` },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Collection', item: `${site}/collection` },
      { '@type': 'ListItem', position: 2, name: s.name, item: `${site}/slab/${s.id}` },
    ],
  },
];

export function slabMeta(s: Slab, site = ''): PageMeta {
  return {
    path: `/slab/${s.id}`,
    title: `${s.name} marble, ${s.finish.toLowerCase()} | ${BRAND.name}`,
    description: `${s.description} ${s.sizeMm[0]} × ${s.sizeMm[1]} mm slabs from ${s.origin}. See it on your own wall before you buy.`,
    image: s.large,
    jsonLd: slabLd(s, site),
  };
}

export function allPages(site = ''): PageMeta[] {
  return [
    {
      path: '/',
      title: `${BRAND.name} | Natural marble slabs you can see on your own wall`,
      description: 'Browse natural marble from Italy and Spain, then try any slab on a photo of your own wall with our free visualizer. Quotes within one working day.',
      image: '/og.jpg',
      jsonLd: [org(site), { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND.name, url: site }],
    },
    {
      path: '/collection',
      title: `The marble collection | ${BRAND.name}`,
      description: `Calacatta, Statuario, Carrara, Nero Marquina and more. ${SLABS.length} natural marbles in stock, each with true slab sizes and finishes.`,
      image: '/og.jpg',
    },
    {
      path: '/visualize',
      title: `See marble on your wall | ${BRAND.name}`,
      description: 'Upload a photo of your wall and see our marble on it at true size, with your room\'s light. Free, runs in your browser, photos stay on your device.',
      image: '/og.jpg',
    },
    { path: '/designs', title: `Your designs | ${BRAND.name}`, description: 'Your saved marble wall designs.', noindex: true },
    { path: '/privacy', title: `Privacy policy | ${BRAND.name}`, description: `How ${BRAND.name} collects, uses and protects your personal data.` },
    { path: '/terms', title: `Terms of use | ${BRAND.name}`, description: `The terms for using the ${BRAND.name} website and visualizer.` },
    { path: '/cookies', title: `Cookie policy | ${BRAND.name}`, description: `The cookies ${BRAND.name} uses and how to control them.` },
    ...SLABS.map((s) => slabMeta(s, site)),
  ];
}

export const notFoundMeta: PageMeta = { path: '/404', title: `Page not found | ${BRAND.name}`, description: 'This page could not be found.', noindex: true };

export const pageFor = (path: string) => allPages().find((p) => p.path === path);
