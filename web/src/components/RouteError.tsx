export function RouteError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <p className="mb-3 text-sm font-bold tracking-widest text-(--color-brand)">HANDBALL BW</p>
      <h1 className="text-2xl font-bold">Diese Seite konnte nicht angezeigt werden.</h1>
      <p className="mt-3 text-(--color-ink-2)">Lade die Seite erneut. Deine Favoriten bleiben gespeichert.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="rounded-xl bg-(--color-brand) px-5 py-3 font-semibold text-(--color-brand-ink)" onClick={() => window.location.reload()}>Erneut laden</button>
        <a className="rounded-xl border border-(--color-line) px-5 py-3 font-semibold" href={import.meta.env.BASE_URL}>Zur Startseite</a>
      </div>
    </main>
  );
}
