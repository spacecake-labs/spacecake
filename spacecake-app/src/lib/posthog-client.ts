import posthog from "posthog-js"

const PUBLIC_POSTHOG_KEY = "phc_tie9HcJtBH5SkcTLpsJaUnq7X8adjIpDU4flhefHdWJ"
const PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"

// Initialize PostHog client-side
if (typeof window !== "undefined" && !posthog.__loaded) {
  posthog.init(PUBLIC_POSTHOG_KEY, {
    api_host: PUBLIC_POSTHOG_HOST,
    capture_exceptions: true,
    cookieless_mode: "always",
    person_profiles: "identified_only",
    disable_surveys: false,
    advanced_disable_feature_flags: false,
    debug: false,
  })
}

export default posthog
