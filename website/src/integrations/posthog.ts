import { type AstroIntegration } from "astro"
import { type PostHogConfig } from "posthog-js"

type PluginConfig = Partial<PostHogConfig> & {
  posthogKey: string
  registerOnce?: Record<string, unknown>
}

const createPlugin = (config: PluginConfig): AstroIntegration => {
  const { posthogKey, registerOnce, ...initConfig } = config

  return {
    name: "astro-posthog",
    hooks: {
      "astro:config:setup": async ({ injectScript }) => {
        const registerOnceCode = registerOnce
          ? `posthog.register_once(${JSON.stringify(registerOnce)});`
          : ""

        injectScript(
          "page",
          `import posthog from 'posthog-js';posthog.init('${posthogKey}', ${JSON.stringify(
            initConfig
          )});${registerOnceCode}`
        )
      },
    },
  }
}

export type { PluginConfig }
export default createPlugin
