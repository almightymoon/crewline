import Script from "next/script";

/** SPA shell: mount points match frontend/index.html; hash router lives in /assets/app.js */
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
