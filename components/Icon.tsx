import React from "react";

export const icons = {
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  lightbulb: [
    "M9 21h6",
    "M12 3a6 6 0 0 1 6 6c0 2.22-1.2 4.16-3 5.2V17a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-2.8C7.2 13.16 6 11.22 6 9a6 6 0 0 1 6-6z",
  ],
  clipboard: [
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  ],
  plus: "M12 5v14M5 12h14",
  spark: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
  trash: [
    "M3 6h18",
    "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
    "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  ],
  check: "M20 6L9 17l-5-5",
  calendar: [
    "M3 4h18v18H3z",
    "M16 2v4M8 2v4M3 10h18",
  ],
  x: "M18 6L6 18M6 6l12 12",
  logo: [
    // Strawberry outline + leaves
    "M12 7c-2.8-2.2-5.8-.6-6.6 1.8-.9 2.8.7 8.1 6.6 12 5.9-3.9 7.5-9.2 6.6-12C17.8 6.4 14.8 4.8 12 7z",
    "M9 6.2c.8 1.2 2.1 1.8 3 1.8s2.2-.6 3-1.8",
    "M10.2 4.5c.7.9 1.3 1.4 1.8 1.6M13.8 4.5c-.7.9-1.3 1.4-1.8 1.6",
    // Seeds (simple dots)
    "M10.1 12.2h.01M13.9 12.2h.01M12 15h.01M11.2 17.2h.01M12.8 17.2h.01",
    // Small bunny in front (head + ears)
    "M9.1 18.2c0-1.7 1.4-3.1 3.1-3.1s3.1 1.4 3.1 3.1",
    "M11.1 13.6c-.7-.9-1-2.2-.3-2.9.6-.6 1.9-.3 2.9.3",
    "M13.3 13.6c.7-.9 1-2.2.3-2.9-.6-.6-1.9-.3-2.9.3",
  ],
  image: [
    "M21 15l-5-5L5 21",
    "M3 3h18v18H3z",
    "M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  external: [
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    "M15 3h6v6M10 14L21 3",
  ],
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
};

type IconProps = {
  d: string | string[];
  size?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function Icon({
  d,
  size = 16,
  stroke = "currentColor",
  fill = "none",
  strokeWidth = 1.75,
  className = "",
  style,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {Array.isArray(d)
        ? d.map((path, i) => <path key={i} d={path} />)
        : <path d={d} />}
    </svg>
  );
}
