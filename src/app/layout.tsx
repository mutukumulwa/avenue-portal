import type { Metadata } from "next";
import { Quicksand, Lato } from "next/font/google";
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
  title: "AiCare Platform - Avenue Healthcare",
  description: "Next-generation health membership platform",
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
      </body>
    </html>
  );
}
