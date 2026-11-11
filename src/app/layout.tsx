import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kids Stories Studio",
  description: "Personalized illustrated children's stories, generated through an MCP media server.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
