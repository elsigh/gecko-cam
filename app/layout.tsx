import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gecko Cam",
  description: "Live gecko vivarium webcam with motion-triggered event clips",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900 text-gray-100 min-h-screen`}>
        <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🦎</span>
          <h1 className="font-semibold text-lg tracking-tight">Gecko Cam</h1>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
