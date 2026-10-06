import { useEffect } from 'react';
import type { PageMeta } from './meta';

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Keep <title>, description, canonical and social tags in step as visitors navigate. */
export function usePageMeta(meta: PageMeta | undefined) {
  useEffect(() => {
    if (!meta) return;
    const origin = window.location.origin;
    document.title = meta.title;
    setMeta('name', 'description', meta.description);
    setMeta('name', 'robots', meta.noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', meta.title);
    setMeta('property', 'og:description', meta.description);
    setMeta('property', 'og:url', origin + meta.path);
    if (meta.image) setMeta('property', 'og:image', origin + meta.image);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = origin + meta.path;
  }, [meta]);
}
