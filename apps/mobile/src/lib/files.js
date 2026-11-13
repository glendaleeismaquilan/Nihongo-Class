// Opens a private file (class material attachment or My Drive file) through a
// short-lived ticket, like the web app's AttachmentList and DrivePage: Preview
// opens PDFs and images for viewing, Download always asks for an attachment.
// The ticket URL points at the API host this phone used, so it opens from the phone.
import { Linking } from "react-native";
import { api } from "./api";

/** File types the API serves inline (web: AttachmentList / DrivePage canPreview). */
export const canPreview = (mimeType) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(mimeType ?? "");

async function open(ticketPath, disposition) {
  const { url } = await api(ticketPath, { body: { disposition } });
  await Linking.openURL(url);
}

/**
 * Opens a file: for viewing when its type can be previewed, otherwise as a download.
 * `ticketPath` is `/materials/:id/attachments/:attId/ticket` or `/drive/:id/ticket`. Errors propagate.
 */
export function openTicket(ticketPath, mimeType) {
  return open(ticketPath, canPreview(mimeType) ? "inline" : "attachment");
}

/** Downloads a file whatever its type, like web's Download buttons. Errors propagate. */
export function downloadTicket(ticketPath) {
  return open(ticketPath, "attachment");
}
