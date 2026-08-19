import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { FastSignalFetchInterceptor } from "@/components/FastSignalFetchInterceptor";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Trading Assistant",
  description: "AI-powered real-time trading analysis and signals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-black text-white antialiased`}>
        <FastSignalFetchInterceptor />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
