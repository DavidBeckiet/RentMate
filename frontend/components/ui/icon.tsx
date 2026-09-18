import type { ReactNode } from "react";

export type IconName =
  | "arrow"
  | "arrowUpRight"
  | "bell"
  | "building"
  | "chart"
  | "check"
  | "chevronDown"
  | "clipboard"
  | "close"
  | "compass"
  | "compare"
  | "eye"
  | "eyeOff"
  | "heart"
  | "info"
  | "home"
  | "key"
  | "lock"
  | "logIn"
  | "mail"
  | "flag"
  | "logout"
  | "map"
  | "menu"
  | "message"
  | "minus"
  | "note"
  | "pin"
  | "phone"
  | "plus"
  | "ruler"
  | "search"
  | "send"
  | "share"
  | "shield"
  | "sliders"
  | "sparkles"
  | "star"
  | "snowflake"
  | "bath"
  | "utensils"
  | "refrigerator"
  | "washingMachine"
  | "car"
  | "paw"
  | "target"
  | "refresh"
  | "user"
  | "userPlus"
  | "users"
  | "volume"
  | "volumeOff"
  | "wifi";

const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  building: (
    <>
      <path d="M5 21V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17" />
      <path d="M3 21h18M9 6h2m2 0h2M9 10h2m2 0h2M9 14h2m2 0h2" />
    </>
  ),
  chart: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  clipboard: (
    <>
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M9 4V2h6v2M8 10h8m-8 4h8" />
    </>
  ),
  close: <path d="M6 6 18 18M18 6 6 18" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  compare: (
    <>
      <rect x="3" y="4" width="7" height="16" rx="1" />
      <rect x="14" y="4" width="7" height="16" rx="1" />
      <path d="M6.5 8h0M17.5 8h0M6.5 12h0M17.5 12h0" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3.4-.6M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6" />
    </>
  ),
  heart: (
    <path d="M20.8 5.7a5.5 5.5 0 0 0-7.8 0L12 6.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 22l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </>
  ),
  flag: <path d="M5 22V4m0 1h11l-2 4 2 4H5" />,
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 3 3m-6 0 3 3" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  logIn: <path d="m10 17 5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  logout: <path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />,
  map: (
    <>
      <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" />
      <path d="M8 3v15m8-12v15" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  message: (
    <>
      <path d="M4 5h16v12H8l-4 4V5Z" />
      <path d="M8 9h8m-8 4h5" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  note: (
    <>
      <path d="M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M16 21v-5h5M7 8h10M7 12h7" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  ruler: <path d="m4 17 13-13 3 3L7 20l-3-3Zm9-9 3 3m-6 0 2 2m-5 1 3 3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />
      <path d="m8.5 12 2.3 2.3 4.7-5" />
    </>
  ),
  sliders: <path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6" />,
  sparkles: (
    <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14Zm13 0 1.2 2.8L22 18l-2.8 1.2L18 22l-1.2-2.8L14 18l2.8-1.2L18 14Z" />
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  snowflake: (
    <>
      <path d="M12 2v20M4.9 6l14.2 12M4.9 18 19.1 6M5 12h14" />
      <path d="m12 2-2 2m2-2 2 2m0 16-2 2m2-2-2-2M4.9 6h2.8m-2.8 0 .7 2.7m13.5 9.3h-2.8m2.8 0-.7-2.7M4.9 18h2.8m-2.8 0 .7-2.7m13.5-9.3h-2.8m2.8 0-.7 2.7" />
    </>
  ),
  bath: (
    <>
      <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
      <path d="M6 12V6a3 3 0 0 1 5.5-1.7M3 20l-1 2m19-2 1 2" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 3v8m0 0a2 2 0 0 0 2-2V3m-2 8a2 2 0 0 1-2-2V3m4 18V3M16 3v18m0-10h3a2 2 0 0 0 2-2V3" />
    </>
  ),
  refrigerator: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M6 10h12M9 6v2m0 6v2" />
    </>
  ),
  washingMachine: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8 7h.01M11 7h5" />
    </>
  ),
  car: (
    <>
      <path d="m5 16 1.5-6h11L19 16v4H5v-4Z" />
      <path d="M7 10 8.5 6h7l1.5 4M3 16h2m14 0h2M8 17h.01M16 17h.01" />
    </>
  ),
  paw: (
    <>
      <path d="M8.5 14.5c-1.5 0-3 1.4-3 3.1 0 1.5 1.1 2.4 2.5 2.4h8c1.4 0 2.5-.9 2.5-2.4 0-1.7-1.5-3.1-3-3.1-.9 0-1.5.4-2 1-.4.5-1.6.5-2 0-.5-.6-1.1-1-2-1Z" />
      <circle cx="6" cy="9" r="1.8" />
      <circle cx="10" cy="6" r="1.8" />
      <circle cx="14" cy="6" r="1.8" />
      <circle cx="18" cy="9" r="1.8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3V1m9 11h2M12 21v2M3 12H1" />
    </>
  ),
  refresh: <path d="M20 6v5h-5M4 18v-5h5m9.5-5A7 7 0 0 0 6.8 5.2L4 8m16 8-2.8 2.8A7 7 0 0 1 5.5 16" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M19 8v6m-3-3h6" />
    </>
  ),
  users: (
    <>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.8M16 3.3a4 4 0 0 1 0 7.4" />
    </>
  ),
  volume: (
    <>
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  volumeOff: (
    <>
      <path d="m3 3 18 18M4 10v4h4l5 4v-5.5M13 6v2.5M17 9a4 4 0 0 1 1.1 4.9M19.5 6.5a8 8 0 0 1 1.1 9.8" />
    </>
  ),
  wifi: <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0" />
};

export function Icon({
  name,
  className = "h-5 w-5",
  filled = false
}: {
  readonly name: IconName;
  readonly className?: string;
  readonly filled?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
