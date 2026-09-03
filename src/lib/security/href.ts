export function safeInternalHref(href: string | undefined | null): string {
  if (!href) return '#';
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes(':')) {
    return href;
  }
  return '#';
}
