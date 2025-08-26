// Content Security Policy configurations
export const CSP_CONFIG = {
  development: {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:", "blob:"],
    "connect-src": ["'self'", "https:", "ws:", "wss:", "blob:"],
    "font-src": ["'self'", "data:", "https:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
  },
  production: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https:"],
    "connect-src": ["'self'", "https:"],
    "font-src": ["'self'", "data:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  },
}

export function buildCSPString(
  environment: "development" | "production" = "development"
): string {
  const config = CSP_CONFIG[environment]
  return Object.entries(config)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ")
}
