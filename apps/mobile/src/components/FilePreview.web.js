// Browser build of the app (Expo web): there is no WebView, and a new browser tab
// already is the in-place preview, so Preview keeps opening the file there
// (lib/files.js falls back to Linking when no viewer is available).
export const filePreviewAvailable = () => false;
export function showFilePreview() {}
export function FilePreviewHost() {
  return null;
}
