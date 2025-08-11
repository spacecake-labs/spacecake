import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// safe base64url encoding/decoding for ids in routes
export function encodeBase64Url(value: string): string {
  // prefer web apis in renderer
  if (typeof btoa === "function") {
    const base64 = btoa(unescape(encodeURIComponent(value)));
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  // fallback to node buffer in non-browser contexts
  const base64 = Buffer.from(value, "utf-8").toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeBase64Url(value: string): string {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded = value + "=".repeat(padLength);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(base64)));
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}
