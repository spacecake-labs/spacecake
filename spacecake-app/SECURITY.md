# Security Configuration

This document outlines the security measures implemented in the spacecake Electron application.

## Content Security Policy (CSP)

The application implements a comprehensive Content Security Policy to protect against various security vulnerabilities including XSS attacks, clickjacking, and other injection attacks.

### Development Environment

- Allows `unsafe-eval` for development tools and hot reloading
- Permits WebSocket connections for development server
- Includes `unsafe-inline` for styles and scripts during development

### Production Environment

- Strict CSP with no `unsafe-eval` or `unsafe-inline` for scripts
- Only allows necessary connections and resources
- Enhanced security with additional directives

### CSP Directives

- `default-src 'self'`: Only allows resources from the same origin
- `script-src`: Controls JavaScript execution sources
- `style-src`: Controls CSS stylesheet sources
- `img-src`: Controls image sources
- `connect-src`: Controls network connections (XHR, fetch, WebSocket)
- `font-src`: Controls font sources
- `object-src 'none'`: Prevents plugin execution
- `base-uri 'self'`: Restricts base URI to same origin
- `form-action 'self'`: Restricts form submissions to same origin

## Electron Security Settings

The main process implements several security measures:

- `nodeIntegration: false`: Prevents direct Node.js access from renderer
- `contextIsolation: true`: Isolates renderer process from main process
- `webSecurity: true`: Enables web security features
- `allowRunningInsecureContent: false`: Prevents loading insecure content

## Environment Detection

The application automatically detects the environment and applies appropriate security policies:

- Development: More permissive for debugging and development tools
- Production: Strict security policies for end users

## Files Modified

- `src/main.ts`: Added security headers and CSP configuration
- `src/csp.ts`: Centralized CSP configuration management
- `index.html`: Added CSP meta tag
- `forge.config.ts`: Already includes security-focused Fuses configuration
