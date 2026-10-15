import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Crewline – hire freelancers, pay when the work is approved",
  description:
    "Crewline is a freelance marketplace with escrow payments, proposals, and built-in messaging.",
};

export const dynamic = "force-static";
export const revalidate = false;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/assets/styles.css" />
      </head>
      <body>
        {children}
        <Script id="theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('cl_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
        <Script src="/assets/app.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
