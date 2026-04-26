import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cobain.dev",
  description: "Automated RDP installation service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="bg-[#0a0a0a] text-gray-100 min-h-full flex flex-col font-[family-name:var(--font-geist-sans)]" 
        style={{ letterSpacing: '-0.01em', lineHeight: '1.6', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}><Providers>{children}</Providers></body>
    </html>
  );
}
