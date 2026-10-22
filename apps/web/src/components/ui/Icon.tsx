import type { SVGProps } from "react";

// Simple 24px stroke icons. Decorative by default (aria-hidden); pair with visible text or aria-label.
const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  classes: "M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12M8 7h6",
  study: "M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5Zm0 0V19",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  users: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 9v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  payment: "M2 7h20v12H2zM2 11h20M6 15h4",
  bell: "M18 9a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Zm-4.3 12a2 2 0 0 1-3.4 0",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.5-1-2 3.4 2.1 1.6a7.4 7.4 0 0 0 0 2.4l-2.1 1.6 2 3.4 2.5-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.5 1 2-3.4-2.1-1.6c.1-.4.1-.8.1-1.2Z",
  user: "M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  video: "M3 6h12v12H3zM15 10l6-3v10l-6-3",
  file: "M14 3H6v18h12V7l-4-4Zm0 0v4h4M9 13h6M9 17h6",
  upload: "M12 16V4m0 0L7 9m5-5 5 5M4 20h16",
  download: "M12 4v12m0 0 5-5m-5 5-5-5M4 20h16",
  play: "M7 4v16l13-8L7 4Z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  replay: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  rewind: "M11 7 5 12l6 5V7Zm8 0-6 5 6 5V7Z",
  check: "m5 12 5 5L20 7",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  "chevron-left": "m15 18-6-6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-up": "m18 15-6-6-6 6",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  logout: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  calendar: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  pin: "M12 17v5M9 3h6l-1 6 4 4H6l4-4-1-6Z",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3",
  edit: "M4 20h4L20 8l-4-4L4 16v4Z",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  headphones: "M4 18v-6a8 8 0 1 1 16 0v6M4 14h3v6H4zM17 14h3v6h-3z",
  reading: "M4 5h7v14H4zM13 5h7v14h-7z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm7-3a7 7 0 0 1-14 0m7 7v3",
  stop: "M6 6h12v12H6z",
  volume: "M4 9h4l5-4v14l-5-4H4V9Zm12 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12",
  menu: "M4 6h16M4 12h16M4 18h16",
  library: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 2 15.5-3.5 1z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4",
  arrowUp: "M12 19V5m0 0-6 6m6-6 6 6",
  arrowDown: "M12 5v14m0 0-6-6m6 6 6-6",
  info: "M12 16v-5m0-3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  drive: "M3 15h18M3 15l3-9h12l3 9M3 15v4h18v-4M7 17h.01",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  school: "M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 10h.01",
  "mic-off": "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M19 12a7 7 0 0 1-1.2 3.9M5 12a7 7 0 0 0 10.7 5.9M12 19v3",
  "video-off": "M3 3l18 18M15 11l6-4v10l-1.3-.9M14 18H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2m4 0h4a1 1 0 0 1 1 1v4",
  "phone-off": "M3 3l18 18M8.6 13.4a16 16 0 0 0 2 2l1.6-1.6a1 1 0 0 1 1-.3c1 .3 2 .5 3.1.6a1 1 0 0 1 .9 1V18a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3h2.9a1 1 0 0 1 1 .9c.1 1.1.3 2.1.6 3.1a1 1 0 0 1-.3 1L8.6 9.6",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rest["aria-label"] ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
