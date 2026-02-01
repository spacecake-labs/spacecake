// Content Security Policy configurations
export const CSP_CONFIG = {
  development: {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https://*.posthog.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://*.posthog.com"],
    "img-src": ["'self'", "data:", "https:", "blob:", "https://*.posthog.com"],
    "connect-src": [
      "'self'",
      "https:",
      "ws:",
      "wss:",
      "blob:",
      "wasm:",
      "data:",
      "https://*.posthog.com",
    ],
    "font-src": ["'self'", "data:", "https:", "https://*.posthog.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-ancestors": ["'self'", "https://*.posthog.com"],
  },
  production: {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'wasm-unsafe-eval'", "https://*.posthog.com"],
    "style-src": ["'self'", "'unsafe-inline'", "https://*.posthog.com"],
    "img-src": ["'self'", "data:", "https:", "https://*.posthog.com"],
    "connect-src": ["'self'", "https:", "wss:", "wasm:", "data:", "https://*.posthog.com"],
    "font-src": ["'self'", "data:", "https:", "https://*.posthog.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "child-src": ["'self'", "blob:"],
    "frame-ancestors": ["'self'", "https://*.posthog.com"],
  },
}

export function buildCSPString(environment: "development" | "production" = "development"): string {
  const config = CSP_CONFIG[environment]
  return Object.entries(config)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ")
}
