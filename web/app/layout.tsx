import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crewline – hire freelancers, pay when the work is approved",
  description:
    "Crewline is a freelance marketplace with escrow payments, proposals, and built-in messaging.",
};

export const dynamic = "force-static";
export const revalidate = false;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/assets/styles.css" />
      </head>
      <body>
        {children}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('cl_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/assets/app.js" defer />
      </body>
    </html>
  );
}
