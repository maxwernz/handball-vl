import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { customId } from '../../../lib/game.ts';
import { bestCandidate, candidates, type Candidate } from '../../../lib/match.ts';
import type { UploadPayload } from '../../../lib/model.ts';
import { ParseError, detectFile, parseFiles, type ParsedFiles } from '../../../lib/parse.ts';
import { canonicalName, playerKey } from '../../../lib/stats.ts';
import { CONFIG, SITE, WrongKeyError, submit, unlockUpload, type UploadState, type Uploader } from '../data.ts';
import { href, useTeam } from '../state.tsx';
import { Card, ResultBadge, fmtDate } from '../ui.tsx';

type Files = Partial<Record<'score' | 'game' | 'players', { name: string; html: string }>>;

// Kept for the session while navigating between tabs; never stored.
let uploader: Uploader | null = null;

const load = async <T,>(p: string): Promise<T> => {
  const r = await fetch(`${SITE}api/${p}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Spielplan nicht erreichbar (${p})`);
  return r.json() as Promise<T>;
};

function Gate({ onOpen }: { onOpen: (u: Uploader) => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOpen(await unlockUpload(pw));
    } catch (err) {
      setError(err instanceof WrongKeyError ? 'Das Upload-Passwort stimmt nicht.' : (err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Card title="Spiel hochladen" sub="Nur für den Statistiker: Zum Hochladen braucht es das separate Upload-Passwort.">
      <form className="gate" onSubmit={go}>
        <label className="field">
          <span>Upload-Passwort</span>
          <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </label>
        <button className="btn btn-primary" disabled={busy || !pw}>{busy ? 'Prüfe …' : 'Weiter'}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!CONFIG.uploadToken && <p className="notice">Der Upload ist noch nicht eingerichtet: Es fehlt der GitHub-Token (siehe <code>team/README.md</code>).</p>}
    </Card>
  );
}

function Progress({ state }: { state: UploadState }) {
  const steps = [
    ['sending', 'Verschlüsselt und gesendet'],
    ['queued', 'Wartet auf GitHub'],
    ['running', 'Wird ausgewertet'],
    ['done', 'Fertig'],
  ] as const;
  const order = ['sending', 'queued', 'running', 'done'];
  const at = state.phase === 'failed' ? -1 : order.indexOf(state.phase);
  return (
    <div className="progress" aria-live="polite">
      {state.phase === 'failed' ? (
        <p className="form-error">
          {state.message} {state.url && <a href={state.url} target="_blank" rel="noreferrer">Details bei GitHub</a>}
        </p>
      ) : (
        <ol>
          {steps.map(([k, label], i) => (
            <li key={k} className={i < at || state.phase === 'done' ? 'done' : i === at ? 'now' : ''}>{label}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NewGame({ up }: { up: Uploader }) {
  const { bundle, ref, refresh } = useTeam();
  const [files, setFiles] = useState<Files>({});
  const [unknown, setUnknown] = useState<string[]>([]);
  const [parsed, setParsed] = useState<ParsedFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Candidate[] | null>(null);
  const [pick, setPick] = useState<string>('');
  const [manual, setManual] = useState({ date: new Date().toISOString().slice(0, 10), opponent: '', home: 'true' });
  const [note, setNote] = useState('');
  const [state, setState] = useState<UploadState | null>(null);
  const [drag, setDrag] = useState(false);

  const addFiles = async (fl: FileList | null) => {
    if (!fl) return;
    const next = { ...files };
    const bad: string[] = [];
    for (const f of Array.from(fl)) {
      const html = await f.text();
      const kind = detectFile(html);
      if (kind) next[kind] = { name: f.name, html };
      else bad.push(f.name);
    }
    setFiles(next);
    setUnknown(bad);
    setState(null);
  };

  useEffect(() => {
    setParsed(null);
    setError(null);
    setList(null);
    if (!files.score || !files.game || !files.players) return;
    try {
      const p = parseFiles({ score: files.score.html, game: files.game.html, players: files.players.html });
      setParsed(p);
      setManual((m) => ({ ...m, opponent: m.opponent || p.opponent }));
      candidates(load, CONFIG.team, p).then(
        (c) => {
          setList(c);
          setPick(bestCandidate(c)?.meta.id ?? '');
        },
        () => setList([]),
      );
    } catch (e) {
      setError(e instanceof ParseError ? e.message : `Dateien nicht lesbar: ${(e as Error).message}`);
    }
  }, [files]);

  const known = useMemo(() => new Set(bundle.games.flatMap((g) => g.players.map((p) => playerKey(p.name, bundle.aliases)))), [bundle]);
  const newPlayers = parsed?.players.filter((p) => !known.has(playerKey(p.name, bundle.aliases))) ?? [];
  const chosen = list?.find((c) => c.meta.id === pick) ?? null;
  const meta = chosen
    ? chosen.meta
    : { id: customId(manual.date, manual.opponent), date: `${manual.date}T00:00`, opponent: manual.opponent.trim(), home: manual.home === 'null' ? null : manual.home === 'true' };
  const exists = bundle.games.some((g) => g.id === meta.id);
  const ready = parsed && list && (chosen || (manual.opponent.trim() && manual.date));

  const send = async () => {
    if (!parsed || !files.score || !files.game || !files.players) return;
    const payload: UploadPayload = { action: 'upload', files: { score: files.score.html, game: files.game.html, players: files.players.html }, meta: { ...meta, ...(note.trim() ? { note: note.trim() } : {}) } };
    try {
      await submit(up, payload, setState, ref);
    } catch (e) {
      setState({ phase: 'failed', message: (e as Error).message });
    }
  };
  useEffect(() => {
    if (state?.phase === 'done') refresh().catch(() => undefined);
  }, [state?.phase]);

  if (state?.phase === 'done') {
    return (
      <Card title="Hochgeladen">
        <p className="success">Das Spiel {meta.home === false ? 'bei' : 'gegen'} {meta.opponent} ist jetzt in der Statistik.</p>
        <div className="row">
          <a className="btn btn-primary" href={href.game(meta.id)}>Spiel ansehen</a>
          <button className="btn" onClick={() => { setFiles({}); setState(null); setNote(''); }}>Nächstes Spiel hochladen</button>
        </div>
      </Card>
    );
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <Card title="Spiel hochladen" sub="Die drei Dateien aus der Statistik-App: score.html, game.html und players.html.">
      <label className={`dropzone${drag ? ' drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <input type="file" accept=".html,.htm,text/html" multiple onChange={(e) => addFiles(e.target.files)} />
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden><path d="M12 16V4m0 0-5 5m5-5 5 5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <strong>Dateien hierher ziehen oder antippen</strong>
        <span className="muted">Alle drei auf einmal auswählen geht auch.</span>
      </label>
      <ul className="filelist">
        {(['score', 'game', 'players'] as const).map((k) => (
          <li key={k} className={files[k] ? 'ok' : ''}>
            <span className="dot" aria-hidden />
            {k}.html {files[k] ? <span className="muted">· {files[k]!.name}</span> : <span className="muted">· fehlt</span>}
          </li>
        ))}
      </ul>
      {unknown.length > 0 && <p className="form-error">Nicht erkannt: {unknown.join(', ')}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {parsed && (
        <div className="preview">
          <div className="preview-head">
            <div>
              <div className="muted small">Erkannt</div>
              <div className="preview-score">{parsed.goalsFor}:{parsed.goalsAgainst} <span className="muted">gegen {parsed.opponent} · HZ {parsed.htFor}:{parsed.htAgainst}</span></div>
            </div>
            <ResultBadge game={parsed} />
          </div>
          <p className="small muted">{parsed.players.length} Spieler · {parsed.events.length} Aktionen</p>

          <label className="field">
            <span>Welches Spiel ist das?</span>
            {list === null ? (
              <span className="muted small">Suche im Spielplan …</span>
            ) : (
              <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
                {list.filter((c) => c.scoreMatch).map((c) => (
                  <option key={c.meta.id} value={c.meta.id}>✓ {fmtDate(c.meta.date)} {c.meta.home ? 'gegen' : 'bei'} {c.meta.opponent} ({c.goalsFor}:{c.goalsAgainst})</option>
                ))}
                <option value="">Kein Ligaspiel (Testspiel, Pokal …)</option>
                <optgroup label="Andere Ligaspiele">
                  {list.filter((c) => !c.scoreMatch).map((c) => (
                    <option key={c.meta.id} value={c.meta.id}>{fmtDate(c.meta.date)} {c.meta.home ? 'gegen' : 'bei'} {c.meta.opponent}{c.goalsFor !== null ? ` (${c.goalsFor}:${c.goalsAgainst})` : ''}</option>
                  ))}
                </optgroup>
              </select>
            )}
          </label>

          {list && !chosen && (
            <div className="row wrap">
              <label className="field"><span>Datum</span><input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></label>
              <label className="field grow"><span>Gegner</span><input value={manual.opponent} onChange={(e) => setManual({ ...manual, opponent: e.target.value })} /></label>
              <label className="field"><span>Ort</span>
                <select className="select" value={manual.home} onChange={(e) => setManual({ ...manual, home: e.target.value })}>
                  <option value="true">Heim</option><option value="false">Auswärts</option><option value="null">Neutral</option>
                </select>
              </label>
            </div>
          )}
          {chosen && !chosen.scoreMatch && <p className="notice">Achtung: Der Endstand in den Dateien passt nicht zu diesem Spiel.</p>}

          <label className="field">
            <span>Notiz (optional)</span>
            <input value={note} placeholder="z. B. Pokal, ohne Stammtorhüter …" onChange={(e) => setNote(e.target.value)} maxLength={80} />
          </label>

          {newPlayers.length > 0 && bundle.games.length > 0 && (
            <div className="notice">
              <b>Neu in der Statistik:</b> {newPlayers.map((p) => `#${p.no} ${p.name}`).join(', ')}.
              <span className="muted"> Falls jemand nur anders geschrieben ist, unten unter „Namen zusammenführen“ zuordnen.</span>
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <details className="notice">
              <summary>{parsed.warnings.length} Hinweis{parsed.warnings.length > 1 ? 'e' : ''} beim Prüfen</summary>
              <ul>{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          {exists && <p className="notice">Dieses Spiel ist schon in der Statistik und wird ersetzt.</p>}

          {state ? (
            <Progress state={state} />
          ) : (
            <button className="btn btn-primary btn-block" disabled={!ready} onClick={send}>{exists ? 'Spiel ersetzen' : 'Spiel hochladen'}</button>
          )}
          {state?.phase === 'failed' && <button className="btn mt" onClick={() => setState(null)}>Nochmal versuchen</button>}
        </div>
      )}
    </Card>
  );
}

function Manage({ up }: { up: Uploader }) {
  const { bundle, ref, refresh } = useTeam();
  const [state, setState] = useState<UploadState | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const run = async (payload: UploadPayload) => {
    try {
      await submit(up, payload, setState, ref);
    } catch (e) {
      setState({ phase: 'failed', message: (e as Error).message });
    }
  };
  useEffect(() => {
    if (state?.phase === 'done') refresh().then(() => setState(null), () => undefined);
  }, [state?.phase]);
  const names = [...new Set(bundle.games.flatMap((g) => g.players.map((p) => p.name)))].sort();
  const canon = [...new Set(names.map((n) => canonicalName(n, bundle.aliases)))].sort();
  const busy = state && state.phase !== 'failed';
  return (
    <div className="grid-2">
      <Card title="Spiele verwalten" sub="Löschen entfernt das Spiel aus allen Statistiken.">
        <ul className="manage-list">
          {[...bundle.games].reverse().map((g) => (
            <li key={g.id}>
              <span>{fmtDate(g.date)} · {g.opponent} · {g.goalsFor}:{g.goalsAgainst}</span>
              <button className="btn btn-small btn-danger" disabled={!!busy}
                onClick={() => confirm(`Spiel gegen ${g.opponent} vom ${fmtDate(g.date, false)} wirklich löschen?`) && run({ action: 'delete', id: g.id })}>
                Löschen
              </button>
            </li>
          ))}
          {!bundle.games.length && <li className="muted">Noch keine Spiele.</li>}
        </ul>
      </Card>
      <Card title="Namen zusammenführen" sub="Wenn ein Spieler in einem Spiel anders geschrieben wurde: Schreibweise links wird als Spieler rechts gezählt.">
        <div className="row wrap">
          <select className="select grow" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Schreibweise">
            <option value="">Schreibweise …</option>
            {names.map((n) => <option key={n}>{n}</option>)}
          </select>
          <span aria-hidden>→</span>
          <select className="select grow" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Spieler">
            <option value="">Spieler …</option>
            {canon.filter((n) => n !== from).map((n) => <option key={n}>{n}</option>)}
          </select>
          <button className="btn" disabled={!from || !to || !!busy} onClick={() => run({ action: 'aliases', aliases: { ...bundle.aliases, [from.toLowerCase()]: to } })}>Zuordnen</button>
        </div>
        {Object.keys(bundle.aliases).length > 0 && (
          <ul className="manage-list">
            {Object.entries(bundle.aliases).map(([a, b]) => (
              <li key={a}>
                <span>{a} → {b}</span>
                <button className="btn btn-small" disabled={!!busy} onClick={() => { const next = { ...bundle.aliases }; delete next[a]; run({ action: 'aliases', aliases: next }); }}>Entfernen</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {state && <div className="span-2"><Progress state={state} /></div>}
    </div>
  );
}

export function UploadView() {
  const [up, setUp] = useState<Uploader | null>(uploader);
  if (!up) return <Gate onOpen={(u) => { uploader = u; setUp(u); }} />;
  return (
    <div className="stack">
      <NewGame up={up} />
      <Manage up={up} />
    </div>
  );
}
