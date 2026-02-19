import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"
import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),

  compare: defineCollection({
    loader: glob({ pattern: "**/*.mdx", base: "./src/content/compare" }),
    schema: z.object({
      // Core SEO fields
      title: z.string(), // H1 and <title>
      description: z.string(), // Meta description (150-160 chars ideal)

      // Comparison-specific
      products: z.array(z.string()), // e.g., ["Claude Code", "Codex"]
      verdict: z.string(), // Quick 1-line verdict shown at top
      winner: z.string().optional(), // Optional: which product wins overall

      // SEO enhancements
      keywords: z.array(z.string()).optional(),
      canonical: z.string().url().optional(),
      noindex: z.boolean().default(false),

      // Freshness signals (important for SEO)
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),

      // Author (good for E-E-A-T)
      author: z.string().optional(),

      // FAQ for rich snippets (array of Q&A pairs)
      faq: z
        .array(
          z.object({
            question: z.string(),
            answer: z.string(),
          })
        )
        .optional(),
    }),
  }),

  blog: defineCollection({
    loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      author: z.string().optional(),
      coverImage: z.object({ src: z.string(), alt: z.string() }).optional(),
      keywords: z.array(z.string()).optional(),
      canonical: z.string().url().optional(),
      noindex: z.boolean().default(false),
      faq: z
        .array(z.object({ question: z.string(), answer: z.string() }))
        .optional(),
    }),
  }),
}
