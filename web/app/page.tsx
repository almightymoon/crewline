export const dynamic = "force-static";
export const revalidate = false;

export default function Home() {
  return (
    <>
      <header id="hdr" />
      <main id="app" />
      <footer id="ftr" />
      <dialog id="dlg" aria-label="Details" />
      <div id="toast" role="status" aria-live="polite" />
    </>
  );
}
