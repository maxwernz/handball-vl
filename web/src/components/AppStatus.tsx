/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { storage } from '../lib/storage.ts';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function installed() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

/** Connection state and user-controlled installation / app updates. */
export function AppStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [standalone, setStandalone] = useState(installed);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installHidden, setInstallHidden] = useState(() => storage.get('installDismissed') === '1');
  const [installHelp, setInstallHelp] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const lastUpdate = useRef(0);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, value) { registration.current = value; },
  });

  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const didInstall = () => { setStandalone(true); setInstallPrompt(null); };
    const checkUpdate = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastUpdate.current < 60 * 60_000) return;
      lastUpdate.current = Date.now();
      void registration.current?.update().catch(() => {});
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', didInstall);
    document.addEventListener('visibilitychange', checkUpdate);
    return () => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', didInstall);
      document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, []);

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const showInstall = !standalone && !installHidden && (installPrompt || ios);
  const button = 'min-h-10 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-(--color-surface-2)';
  const close = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl hover:bg-(--color-surface-2)';

  return (
    <div className="space-y-2 empty:hidden">
      {!online && (
        <div role="status" className="mb-4 rounded-xl border border-(--color-line) bg-(--color-surface) px-4 py-3 text-sm">
          <strong>Du bist offline.</strong> Bereits geladene Seiten bleiben verfügbar. Live-Stände werden wieder aktualisiert, sobald du online bist.
        </div>
      )}
      {needRefresh && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-(--color-line) bg-(--color-surface) px-4 py-2 text-sm">
          <span className="min-w-0 flex-1">{updateFailed ? 'Update gerade nicht möglich. Bitte versuche es erneut.' : 'Eine neue App-Version ist bereit.'}</span>
          <button className={`${button} text-(--color-brand)`} disabled={updating} onClick={async () => {
            setUpdating(true);
            setUpdateFailed(false);
            try { await updateServiceWorker(true); }
            catch { setUpdateFailed(true); }
            finally { setUpdating(false); }
          }}>{updating ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}</button>
          <button aria-label="Update später installieren" className={close} onClick={() => setNeedRefresh(false)}>×</button>
        </div>
      )}
      {showInstall && !needRefresh && (
        <div className="mb-4 rounded-xl border border-(--color-line) bg-(--color-surface) px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 font-medium">Handball BW auf deinem Startbildschirm</span>
            <button className={`${button} text-(--color-brand)`} onClick={async () => {
              if (!installPrompt) { setInstallHelp((value) => !value); return; }
              try {
                await installPrompt.prompt();
                const { outcome } = await installPrompt.userChoice;
                if (outcome === 'accepted') setStandalone(true);
              } catch { setInstallHelp(true); }
              finally { setInstallPrompt(null); }
            }}>{ios ? 'So geht’s' : 'Installieren'}</button>
            <button className={close} aria-label="Installationshinweis schließen" onClick={() => {
              setInstallHidden(true);
              storage.set('installDismissed', '1');
            }}>×</button>
          </div>
          {installHelp && <p className="pb-2 text-(--color-ink-2)">{ios ? 'In Safari: Öffne das Teilen-Menü und wähle „Zum Home-Bildschirm“. Aktiviere „Als Web-App öffnen“, falls die Option angezeigt wird.' : 'Öffne das Menü deines Browsers und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.'}</p>}
        </div>
      )}
    </div>
  );
}
