import Script from "next/script";

/** Fully static shell — no DB / no server runtime required for `/`. */
export const dynamic = "force-static";

export default function Home() {
  return (
    <>
      <header id="hdr" />
      <main id="app" />
      <footer id="ftr" />
      <dialog id="dlg" aria-label="Details" />
      <div id="toast" role="status" aria-live="polite" />
      <Script src="/assets/app.js" strategy="afterInteractive" />
    </>
  );
}
