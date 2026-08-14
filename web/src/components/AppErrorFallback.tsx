export function AppErrorFallback() {
  function retry() {
    window.location.reload();
  }

  return (
    <main className="app-shell app-error-fallback">
      <p className="error-message" role="alert">
        S&apos;ha produït un error inesperat.
      </p>
      <button className="primary" onClick={retry} type="button">
        Torna-ho a provar
      </button>
    </main>
  );
}
