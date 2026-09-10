// A single line-icon set, drawn on a 24px grid with a 1.6 stroke so every
// glyph in the app has the same weight. Icons inherit `currentColor`, which
// is what lets a chip, a button and a nav row tint their icon by changing
// text colour alone.

type IconProps = { className?: string; size?: number };

function Svg({ children, size = 16, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Home: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </Svg>
  ),
  Report: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 2.5h7.5L19 8v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M13.5 2.5V8H19" />
      <path d="M8.5 13h7M8.5 17h4.5" />
    </Svg>
  ),
  Plug: (p: IconProps) => (
    <Svg {...p}>
      <ellipse cx="12" cy="5.5" rx="7" ry="3" />
      <path d="M5 5.5v13c0 1.7 3.1 3 7 3s7-1.3 7-3v-13" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </Svg>
  ),
  People: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.2 2.7-5.3 6-5.3s6 2.1 6 5.3" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6M18 14.9c2 .7 3.5 2.5 3.5 5.1" />
    </Svg>
  ),
  Settings: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </Svg>
  ),
  Plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  ),
  X: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  ChevronRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  ),
  ChevronDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 9 7 7 7-7" />
    </Svg>
  ),
  ArrowLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  ),
  Trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 13a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-13" />
    </Svg>
  ),
  Copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
    </Svg>
  ),
  Download: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 18v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V18" />
    </Svg>
  ),
  Refresh: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 11a8 8 0 1 0-.7 4.2" />
      <path d="M20 4.5V11h-6" />
    </Svg>
  ),
  Play: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 4.5 19 12 7 19.5V4.5Z" />
    </Svg>
  ),
  Alert: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.3v.2" />
    </Svg>
  ),
  Sun: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Svg>
  ),
  Moon: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Svg>
  ),
  LogOut: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4" />
      <path d="M10 8.5 5.5 12 10 15.5M5.5 12H15" />
    </Svg>
  ),
  Sheet: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M3.5 9.5h17M9.5 9.5V20M15 9.5V20" />
    </Svg>
  ),
  Globe: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </Svg>
  ),
  Key: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="16" r="3.5" />
      <path d="m10.5 13.5 8-8M16 8l2.5 2.5M18.5 5.5 21 8" />
    </Svg>
  ),
  Grid: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </Svg>
  ),
};
