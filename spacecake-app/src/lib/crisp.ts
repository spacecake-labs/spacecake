export function initCrisp() {
  window.$crisp = []
  window.CRISP_WEBSITE_ID = "8aa1839d-b111-439c-9627-86b73a66bd66"
  ;(function () {
    const d = document
    const s = d.createElement("script")
    s.src = "https://client.crisp.chat/l.js"
    s.async = true
    d.getElementsByTagName("head")[0].appendChild(s)
  })()
}
