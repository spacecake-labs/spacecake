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
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/spacecake-labs/spacecake",
        },
      ],
      pagefind: false,
      sidebar: [
        {
          label: "📖",
          items: [{ label: "getting started", slug: "getting-started" }],
        },
      ],
      components: {
        Hero: "./src/components/Hero.astro",
      },
      customCss: ["./src/styles/global.css", "./src/styles/theme.css"],
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
})
