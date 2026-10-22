export class DataRequestError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'DataRequestError';
    this.status = status;
  }
}

/** Every request has a deadline, including responses whose body never finishes. */
export async function requestJSON<T>(url: string, options: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new DataRequestError(response.status === 404 ? 'Für diese Seite sind noch keine Daten verfügbar.' : response.status === 429 ? 'Die Datenquelle ist gerade ausgelastet. Bitte versuche es später erneut.' : 'Die Datenquelle ist vorübergehend nicht erreichbar.', response.status);
    }
    try { return await response.json() as T; }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new DataRequestError('Die Daten konnten nicht gelesen werden. Bitte lade sie erneut.');
    }
  } catch (error) {
    if (error instanceof DataRequestError) throw error;
    throw new DataRequestError(controller.signal.aborted ? 'Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.' : 'Keine Verbindung zur Datenquelle. Prüfe deine Internetverbindung.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
