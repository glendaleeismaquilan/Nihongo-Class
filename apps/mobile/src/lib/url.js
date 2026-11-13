// URL helpers that work on a phone. React Native 0.74's URL class implements
// almost nothing: host, pathname and URLSearchParams.set throw "not implemented",
// and it appends "/" to every URL. The browser build uses the browser's URL, so
// that can't be seen there. The app builds and reads URLs as plain strings instead.

/** "a=1&b=2" from the values that are set: undefined, null and "" are left out, as web's api.ts does. */
export function queryString(query) {
  const parts = [];
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

// scheme://[user[:password]@]host[:port]/path?query#fragment
const PARTS = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#]*)([^?#]*)/i;

/** Host and port of an absolute URL, lower-cased like URL.host; "" when it isn't one. */
export function urlHost(url) {
  return (PARTS.exec(url ?? "")?.[1] ?? "").toLowerCase();
}

/** Path of an absolute URL, like URL.pathname; "" when it isn't one. */
export function urlPath(url) {
  const m = PARTS.exec(url ?? "");
  return m ? m[2] || "/" : "";
}
