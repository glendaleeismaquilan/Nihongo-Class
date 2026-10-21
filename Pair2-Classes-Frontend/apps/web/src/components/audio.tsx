import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "./ui";

/**
 * FR-3.6.3: a listen control wherever audio exists. preload="auto" so
 * playback starts quickly (SRS 5.1); the label names what is played.
 */
export function ListenButton({ src, label, size = "md" }: { src: string; label: string; size?: "md" | "lg" }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    a.addEventListener("play", on);
    a.addEventListener("pause", off);
    a.addEventListener("ended", off);
    return () => {
      a.removeEventListener("play", on);
      a.removeEventListener("pause", off);
      a.removeEventListener("ended", off);
    };
  }, []);
  return (
    <>
      <audio ref={ref} src={src} preload="auto" />
      <button
        type="button"
        aria-label={label}
        aria-pressed={playing}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          const a = ref.current!;
          if (a.paused) {
            a.currentTime = 0;
            void a.play();
          } else a.pause();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center gap-2 rounded-control border border-line bg-paper text-ai hover:bg-kasumi ${size === "lg" ? "min-h-12 px-4" : "min-h-11 px-3"}`}
      >
        <Icon name={playing ? "pause" : "volume"} />
        <span className="text-sm font-medium">{playing ? "Stop" : "Listen"}</span>
      </button>
    </>
  );
}

/** Preload a clip that will be needed next (§14 Performance). */
export function PreloadAudio({ src }: { src?: string | null }) {
  if (!src) return null;
  return <audio src={src} preload="auto" className="hidden" aria-hidden="true" />;
}

function pickRecorderType(): string {
  // §14 Browsers: prefer audio/mp4 when supported, otherwise audio/webm.
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export interface AudioChoice {
  file: Blob;
  name: string;
  mimeType: string;
}

/** FR-3.5.1: attach a clip by uploading a file or recording in the browser. */
export function AudioField({
  currentUrl,
  currentName,
  label,
  onSelect,
  onRemove,
  busy,
}: {
  currentUrl?: string | null;
  currentName?: string | null;
  label: string;
  onSelect: (choice: AudioChoice) => void | Promise<void>;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<AudioChoice | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const canRecord = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pickRecorderType();
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mimeType = rec.mimeType || type || "audio/webm";
        const blob = new Blob(chunks.current, { type: mimeType });
        const ext = mimeType.startsWith("audio/mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        setPreview({ file: blob, name: `recording.${ext}`, mimeType });
        setPreviewUrl(URL.createObjectURL(blob));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Couldn't use the microphone. Allow microphone access in your browser, or upload a file instead.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-paper border border-line px-3 py-3">
      <p className="text-sm font-medium">{label}</p>
      {currentUrl && !preview ? (
        <div className="flex flex-wrap items-center gap-2">
          <ListenButton src={currentUrl} label={`Play ${label.toLowerCase()}`} />
          <span className="text-sm text-ink-2">{currentName ?? "Audio attached"}</span>
          {onRemove ? (
            <Button size="sm" variant="ghost" className="text-shu" onClick={onRemove} disabled={busy}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
      {preview ? (
        <div className="flex flex-wrap items-center gap-2">
          {previewUrl ? <audio src={previewUrl} controls className="h-11 max-w-full" /> : null}
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              await onSelect(preview);
              setPreview(null);
            }}
          >
            Save recording
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
            Discard
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line bg-paper px-3 text-sm font-medium hover:bg-kasumi">
            <Icon name="upload" size={18} />
            {currentUrl ? "Replace with a file" : "Upload a file"}
            <input
              type="file"
              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onSelect({ file: f, name: f.name, mimeType: f.type });
                e.target.value = "";
              }}
            />
          </label>
          {canRecord ? (
            recording ? (
              <Button size="sm" variant="danger" icon="stop" onClick={stop}>
                Stop recording
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon="mic" onClick={start} disabled={busy}>
                Record
              </Button>
            )
          ) : null}
          {recording ? (
            <span role="status" className="text-sm text-shu">
              Recording…
            </span>
          ) : null}
        </div>
      )}
      <p className="text-sm text-ink-2">MP3, M4A, WAV, OGG, or WebM, up to 10 MB.</p>
      {error ? <p className="text-sm text-shu">{error}</p> : null}
    </div>
  );
}

export function audioForm(choice: AudioChoice, extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set("fileName", choice.name);
  if (choice.mimeType) form.set("mimeType", choice.mimeType);
  form.set("file", choice.file, choice.name);
  return form;
}
