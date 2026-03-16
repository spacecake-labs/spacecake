/**
 * submits new URLs to the google indexing API.
 * usage: node scripts/request-indexing.mjs <section/slug1> <section/slug2> ...
 * example: node scripts/request-indexing.mjs compare/claude-code-vs-cursor blog/my-post
 */

import { google } from "googleapis"

const SITE_URL = "https://www.spacecake.ai"

async function main() {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.log("no paths provided, nothing to index")
    process.exit(0)
  }

  const credentials = JSON.parse(process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/indexing"],
  })

  const indexing = google.indexing({ version: "v3", auth })

  for (const path of paths) {
    const url = `${SITE_URL}/${path}/`
    try {
      const res = await indexing.urlNotifications.publish({
        requestBody: { url, type: "URL_UPDATED" },
      })
      console.log(`submitted ${url} — status ${res.status}`)
    } catch (err) {
      console.error(`failed to submit ${url}:`, err.message)
      process.exitCode = 1
    }
  }
}

main()
