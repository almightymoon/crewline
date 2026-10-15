export const dynamic = "force-static";
export const revalidate = false;

/** Static SPA shell — no DB imports. */
export default function Home() {
  return (
    <>
      <header id="hdr" />
      <main id="app" />
      <footer id="ftr" />
      <dialog id="dlg" aria-label="Details" />
      <div id="toast" role="status" aria-live="polite" />
      <script src="/assets/app.js" defer />
    </>
  );
}
