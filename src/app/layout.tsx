import type { Metadata, Viewport } from "next";
import { Sora, Hanken_Grotesk } from "next/font/google";
import { PWARegister } from "@/components/PWARegister";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "600", "700", "800"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  applicationName: "Medvex",
  title: {
    default: "Medvex — Health Administration Platform",
    template: "%s | Medvex",
  },
  description: "Third-party health benefits administration for Uganda",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/medvex-icon.svg",
    apple: "/icons/medvex-icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Medvex",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000523",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${hanken.variable}`}
    >
      <body className="antialiased min-h-screen bg-avenue-bg text-avenue-text-body font-body">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
