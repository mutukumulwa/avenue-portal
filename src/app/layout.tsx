import type { Metadata, Viewport } from "next";
import { Quicksand, Lato } from "next/font/google";
import { PWARegister } from "@/components/PWARegister";
import "./globals.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["700"],
});

const lato = Lato({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  applicationName: "Avenue Health",
  title: {
    default: "AiCare Platform - Avenue Healthcare",
    template: "%s | Avenue Health",
  },
  description: "Next-generation health membership platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/avenue-icon.svg",
    apple: "/icons/avenue-icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Avenue Health",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#292A83",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${quicksand.variable} ${lato.variable}`}
    >
      <body className="antialiased min-h-screen bg-avenue-bg text-avenue-text-body font-body">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
