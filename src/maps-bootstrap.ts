// Google Maps Platform dynamic bootstrap & Case A quota defense
declare global {
  interface Window {
    NAFAS_MAPS_API_KEY?: string;
    NAFAS_MAPS_BOOTSTRAPPED?: boolean;
    gm_authFailure?: () => void;
    google?: unknown;
  }
}

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
window.NAFAS_MAPS_API_KEY = apiKey;

// Tier 1 Quota Defense (Demo Key)
window.gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

if (apiKey) {
  ((g: Record<string, string>) => {
    let h: Promise<void> | undefined;
    let a: HTMLScriptElement;
    let k: string;
    const p = 'The Google Maps JavaScript API';
    const c = 'google';
    const l = 'importLibrary';
    const q = '__ib__';
    const m = document;
    const b = window as unknown as Record<string, Record<string, unknown>>;
    const root = (b[c] = b[c] || {});
    const d = (root.maps = (root.maps as Record<string, unknown>) || {}) as Record<string, unknown>;
    const r = new Set<string>();
    const e = new URLSearchParams();

    const u = () =>
      h ||
      (h = new Promise<void>(async (f, n) => {
        a = m.createElement('script');
        e.set('libraries', [...r] + '');
        for (k in g) {
          e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), g[k]);
        }
        e.set('callback', c + '.maps.' + q);
        a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
        d[q] = f;
        a.onerror = () => (h = n(Error(p + ' could not load.')) as unknown as Promise<void>);
        a.nonce = (m.querySelector('script[nonce]') as HTMLScriptElement | null)?.nonce || '';
        m.head.append(a);
      }));

    if (!d[l]) {
      d[l] = (f: string, ...n: unknown[]) => r.add(f) && u().then(() => (d[l] as Function)(f, ...n));
    }
  })({
    key: apiKey,
    v: 'weekly',
  });

  window.NAFAS_MAPS_BOOTSTRAPPED = true;
  window.dispatchEvent(new CustomEvent('nafas-maps-loaded'));
} else {
  window.NAFAS_MAPS_BOOTSTRAPPED = true;
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
}

export {};
