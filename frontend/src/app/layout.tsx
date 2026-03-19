import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StacksCare — Own Your Health Data",
  description:
    "Patient-owned medical records secured by Clarity smart contracts on Stacks. AI-powered analysis. Privacy-first.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className: "text-sm font-medium",
            success: { duration: 4000 },
            error: { duration: 5000 },
          }}
        />
      </body>
    </html>
  );
}
