import { useState } from "react";
import type { MaterialAttachmentDto } from "@nihongo/shared";
import { errorMessage } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { Button, ButtonAnchor, Dialog, Icon, Loading, useToast } from "../../components/ui";
import { canPreview, downloadUrl, fileTicket } from "./materialsApi";

/** FR-3.12.4: PDFs and images preview in the app; other files download. */
export function AttachmentList({ materialId, attachments, onOpen, removable, onRemove }: { materialId: string; attachments: MaterialAttachmentDto[]; onOpen?: () => void; removable?: boolean; onRemove?: (a: MaterialAttachmentDto) => void }) {
  const [preview, setPreview] = useState<{ att: MaterialAttachmentDto; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  async function open(att: MaterialAttachmentDto, disposition: "inline" | "attachment") {
    setBusy(att.id + disposition);
    try {
      const t = await fileTicket(materialId, att, disposition);
      onOpen?.();
      if (disposition === "inline" && t.disposition === "inline") setPreview({ att, url: t.url });
      else downloadUrl(t.url);
    } catch (err) {
      toast(errorMessage(err), "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-line rounded-paper border border-line">
        {attachments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Icon name={a.kind === "link" ? "link" : "file"} className="shrink-0 text-ink-2" />
              <span className="min-w-0">
                <span className="block truncate">{a.name}</span>
                <span className="block text-sm text-ink-2">{a.kind === "link" ? new URL(a.url!).host : `${a.mimeType?.split("/")[1]?.toUpperCase().replace("VND.OPENXMLFORMATS-OFFICEDOCUMENT.", "") ?? "File"}, ${formatBytes(a.sizeBytes)}`}</span>
              </span>
            </span>
            <span className="flex gap-1">
              {a.kind === "link" ? (
                <ButtonAnchor size="sm" variant="secondary" href={a.url!} target="_blank" rel="noopener noreferrer" icon="external" onClick={() => onOpen?.()}>
                  Open link
                </ButtonAnchor>
              ) : (
                <>
                  {canPreview(a) ? (
                    <Button size="sm" variant="secondary" icon="eye" loading={busy === a.id + "inline"} onClick={() => void open(a, "inline")}>
                      Preview
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" icon="download" loading={busy === a.id + "attachment"} onClick={() => void open(a, "attachment")}>
                    Download
                  </Button>
                </>
              )}
              {removable ? (
                <Button size="sm" variant="ghost" className="text-shu" onClick={() => onRemove?.(a)} aria-label={`Remove ${a.name}`}>
                  Remove
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.att.name ?? "Preview"} wide>
        {preview ? <PreviewFrame att={preview.att} url={preview.url} /> : null}
      </Dialog>
    </>
  );
}

function PreviewFrame({ att, url }: { att: MaterialAttachmentDto; url: string }) {
  const [loaded, setLoaded] = useState(false);
  if (att.mimeType === "application/pdf") {
    return (
      <div>
        {!loaded ? <Loading label="Opening the PDF" /> : null}
        <iframe src={url} title={att.name} className="h-[70vh] w-full rounded-paper border border-line" onLoad={() => setLoaded(true)} />
        <p className="mt-2 text-sm text-ink-2">
          PDF not showing?{" "}
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open it in a new tab
          </a>
          .
        </p>
      </div>
    );
  }
  return <img src={url} alt={att.name} className="mx-auto max-h-[75vh] max-w-full" />;
}
