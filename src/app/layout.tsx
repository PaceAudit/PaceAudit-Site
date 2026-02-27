import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContentEngine",
  description: "AI Content Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
