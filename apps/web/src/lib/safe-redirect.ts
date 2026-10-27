/** Accept only local absolute paths, including after percent decoding. */
export function safeRedirect(value?: string | null, base = 'http://localhost'): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  const hasUnsafeChars = (text: string) =>
    [...text].some(
      (char) => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    );
  let decoded = value;
  try {
    for (let i = 0; i < 4; i++) {
      if (hasUnsafeChars(decoded) || decoded.startsWith('//')) return null;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/%[0-9a-f]{2}/i.test(decoded) || hasUnsafeChars(decoded) || decoded.startsWith('//'))
      return null;
    const url = new URL(value, base);
    if (url.origin !== new URL(base).origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
