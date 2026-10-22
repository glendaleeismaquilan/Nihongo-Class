import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "../../../components/ui";

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/**
 * FR-3.8.1: play, pause, replay, and a 5-second rewind, with the clip
 * preloaded so playback starts quickly.
 */
export function ListeningPlayer({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = ref.current!;
    const sync = () => {
      setTime(a.currentTime);
      setDuration(a.duration || 0);
    };
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    const canPlay = () => setReady(true);
    a.addEventListener("timeupdate", sync);
    a.addEventListener("loadedmetadata", sync);
    a.addEventListener("canplay", canPlay);
    a.addEventListener("play", on);
    a.addEventListener("pause", off);
    a.addEventListener("ended", off);
    return () => {
      a.removeEventListener("timeupdate", sync);
      a.removeEventListener("loadedmetadata", sync);
      a.removeEventListener("canplay", canPlay);
      a.removeEventListener("play", on);
      a.removeEventListener("pause", off);
      a.removeEventListener("ended", off);
    };
  }, []);

  const a = () => ref.current!;
  return (
    <Panel className="px-4 py-4" aria-label="Listening clip">
      <audio ref={ref} src={src} preload="auto" />
      <p className="mb-3 font-medium">Listen to the clip</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={playing ? "pause" : "play"} onClick={() => (a().paused ? void a().play() : a().pause())} aria-label={playing ? `Pause ${title}` : `Play ${title}`}>
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          variant="secondary"
          icon="rewind"
          onClick={() => {
            a().currentTime = Math.max(0, a().currentTime - 5);
          }}
          aria-label="Rewind 5 seconds"
        >
          5 s
        </Button>
        <Button
          variant="secondary"
          icon="replay"
          onClick={() => {
            a().currentTime = 0;
            void a().play();
          }}
        >
          Replay
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          onChange={(e) => {
            a().currentTime = Number(e.target.value);
          }}
          aria-label="Position in the clip"
          aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
          className="h-11 flex-1 accent-[var(--ai)]"
        />
        <span className="w-24 text-right text-sm tabular-nums text-ink-2">
          {fmt(time)} / {fmt(duration)}
        </span>
      </div>
      {!ready ? <p className="mt-1 text-sm text-ink-2">Loading the clip…</p> : null}
    </Panel>
  );
}
