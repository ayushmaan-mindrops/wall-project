// HTTP security headers for every response (production server and preview).

export function securityHeaders(opts: { https: boolean; analytics: boolean }): Record<string, string> {
  const ga = opts.analytics;
  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets ONNX Runtime compile its WebAssembly; nothing else is eval'd.
    `script-src 'self' 'wasm-unsafe-eval'${ga ? ' https://www.googletagmanager.com' : ''}`,
    // React sets inline style attributes (slab sizes, slider positions).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${ga ? ' https://www.google-analytics.com https://www.googletagmanager.com' : ''}`,
    "font-src 'self' data:",
    // Wall-finder models download from Hugging Face on first use.
    `connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co${ga ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    // Cross-origin isolation: multithreaded WASM for the wall finder.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...(opts.https ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' } : {}),
  };
}
