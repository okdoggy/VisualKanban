import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "VisualKanban",
  description: "Enterprise collaboration workspace for developers"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
