// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "spacecake",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/spacecake-labs/spacecake-releases",
        },
      ],
      pagefind: false,
      //   sidebar: [
      //     {
      //       label: "Guides",
      //       items: [
      //         // Each item here is one entry in the navigation menu.
      //         { label: "Example Guide", slug: "guides/example" },
      //       ],
      //     },
      //     {
      //       label: "Reference",
      //       autogenerate: { directory: "reference" },
      //     },
      //   ],
      components: {
        Hero: "./src/components/Hero.astro",
      },
      customCss: ["./src/styles/theme.css"],
    }),
  ],
});
