// @ts-check
import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

import posthogPlugin from "./src/integrations/posthog"

const PUBLIC_POSTHOG_KEY = "phc_tie9HcJtBH5SkcTLpsJaUnq7X8adjIpDU4flhefHdWJ"
const PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"

// https://astro.build/config
export default defineConfig({
  integrations: [
    posthogPlugin({
      posthogKey: PUBLIC_POSTHOG_KEY,
      api_host: PUBLIC_POSTHOG_HOST,
      capture_pageview: "history_change",
      capture_exceptions: true,
      cookieless_mode: "always",
      person_profiles: "identified_only",
      debug: false,
      registerOnce: {
        app: "spacecake-website",
      },
    }),
    starlight({
      title: "spacecake",
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:title",
            content: "the best interface for Claude Code",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:description",
            content: "run agents in the terminal. edit markdown visually.",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:title",
            content: "the best interface for Claude Code",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:description",
            content: "run agents in the terminal. edit markdown visually.",
          },
        },
        {
          tag: "script",
          attrs: {
            src: "https://analytics.ahrefs.com/analytics.js",
            "data-key": "TJwISHtBcWir5M/lRBkKWw",
            async: true,
          },
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/spacecake-labs/spacecake",
        },
      ],
      sidebar: [
        {
          label: "📖",
          items: [
            { label: "getting started", slug: "getting-started" },
            {
              label: "claude code integration",
              slug: "claude-code-integration",
            },
          ],
        },
      ],
      components: {
        Hero: "./src/components/Hero.astro",
        Search: "./src/components/Search.astro",
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      customCss: ["./src/styles/global.css", "./src/styles/theme.css"],
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
})
