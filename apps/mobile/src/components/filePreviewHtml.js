// The in-app file viewer's page (components/FilePreview.js). No React Native imports,
// so it can be tested in a browser.
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build";

/** "https://host:port" of a URL, without relying on URL.origin (not implemented in React Native). */
export function originOf(url) {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url ?? "");
  return m ? m[1] : undefined;
}

/** The viewer page: the file drawn full width, PDFs page by page with pdf.js. */
export function viewerHtml({ url, mimeType }) {
  const kind = mimeType === "application/pdf" ? "pdf" : "image";
  const params = JSON.stringify({ url, kind, headers: { "ngrok-skip-browser-warning": "1" }, worker: `${PDFJS}/pdf.worker.min.js` }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>
  html, body { margin: 0; background: #2b2f36; font-family: sans-serif; }
  #pages { padding: 8px 0 24px; }
  canvas, img { display: block; margin: 0 auto 8px; max-width: calc(100% - 16px); background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); }
  #msg { color: #eef2f6; text-align: center; padding: 48px 16px; font-size: 15px; }
</style>
${kind === "pdf" ? `<script src="${PDFJS}/pdf.min.js"></script>` : ""}
</head><body>
<div id="msg">Loading…</div><div id="pages"></div>
<script>
(function () {
  var P = ${params};
  var msg = document.getElementById("msg"), pages = document.getElementById("pages");
  function post(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function fail(e) { msg.style.display = "block"; msg.textContent = "Couldn't show this file."; post({ type: "error", message: String((e && e.message) || e) }); }
  function load() {
    return fetch(P.url, { headers: P.headers }).then(function (r) {
      if (!r.ok) throw new Error("The file link answered " + r.status + ". Close and tap Preview again.");
      return r;
    });
  }
  function showImage() {
    return load().then(function (r) { return r.blob(); }).then(function (b) {
      var img = new Image();
      img.onload = function () { msg.style.display = "none"; post({ type: "ready" }); };
      img.onerror = function () { fail("This image can't be shown."); };
      img.alt = "";
      img.src = URL.createObjectURL(b);
      pages.appendChild(img);
    });
  }
  function showPdf() {
    if (!window.pdfjsLib) throw new Error("The PDF viewer couldn't load. Check the internet connection.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = P.worker;
    return load().then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (doc) {
      msg.style.display = "none";
      post({ type: "ready", pages: doc.numPages });
      var width = Math.min(document.documentElement.clientWidth, 1000) - 16;
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var slots = [];
      for (var i = 1; i <= doc.numPages; i++) {
        var c = document.createElement("canvas");
        c.setAttribute("data-page", String(i));
        c.style.width = width + "px";
        c.style.height = Math.round(width * 1.414) + "px";
        pages.appendChild(c);
        slots.push(c);
      }
      function render(c) {
        if (c.getAttribute("data-done")) return;
        c.setAttribute("data-done", "1");
        doc.getPage(Number(c.getAttribute("data-page"))).then(function (page) {
          var scale = width / page.getViewport({ scale: 1 }).width;
          var v = page.getViewport({ scale: scale * dpr });
          c.width = Math.floor(v.width);
          c.height = Math.floor(v.height);
          c.style.height = Math.round(v.height / dpr) + "px";
          return page.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
        }).then(function () { c.setAttribute("data-rendered", "1"); }).catch(fail);
      }
      // Draw pages as they come near the screen, so long PDFs open quickly.
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) render(e.target); });
      }, { rootMargin: "1200px 0px" });
      slots.forEach(function (s) { io.observe(s); });
    });
  }
  try { (P.kind === "pdf" ? showPdf() : showImage()).catch(fail); } catch (e) { fail(e); }
})();
</script>
</body></html>`;
}

