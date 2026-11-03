// Public sales funnel only. Reading and account pages are intentionally not tracked.
export const GA4_ID = 'G-EXNJ4MGX7V';
const PAGE_PATHS = new Set(['/', '/planos', '/entrar', '/cadastro']);
const OFFER_PATHS = new Set(['/', '/planos']);
export const GA4_OFFERS = Object.freeze({
  monthly: Object.freeze({ item_id: 'pequenos_herois', item_name: 'Pequenos Heróis — biblioteca de histórias', item_variant: 'mensal', price: 37.9 }),
  annual: Object.freeze({ item_id: 'pequenos_herois', item_name: 'Pequenos Heróis — biblioteca de histórias', item_variant: 'anual', price: 197 }),
});

function pathOf(location) {
  return (location.pathname || '/').replace(/\/+$/, '') || '/';
}

function isValidClientId(value) {
  return typeof value === 'string' && /^\d{1,20}\.\d{1,20}$/.test(value);
}
function isValidSessionId(value) {
  return (typeof value === 'number' || typeof value === 'string') &&
    /^\d{1,20}$/.test(String(value));
}

export function createGa4Tracker({ win, doc, id = GA4_ID, threshold = 40 }) {
  let installed = false;
  let currentPath = null;
  let scrollOrigin = null;
  let itemViewed = false;

  function install() {
    if (installed) return;
    installed = true;
    win.dataLayer = win.dataLayer || [];
    win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
    win.gtag('js', new Date());
    // Disable automatic page_view to prevent duplications in the SPA.
    win.gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = doc.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    doc.head.appendChild(script);
  }

  function trackRoute() {
    const path = pathOf(win.location);
    if (path === currentPath) return;
    currentPath = path;
    scrollOrigin = null;
    itemViewed = false;
    if (!PAGE_PATHS.has(path)) return;
    install();
    win.gtag('event', 'page_view', {
      page_title: doc.title,
      page_location: win.location.origin + path,
      page_path: path,
    });
  }

  function onScrollIntent() {
    if (OFFER_PATHS.has(currentPath) && !itemViewed && scrollOrigin === null) {
      scrollOrigin = win.scrollY;
    }
  }
  function onKeydown(event) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key) &&
      !event.target?.closest?.('input, textarea, select, [contenteditable]')) {
      onScrollIntent();
    }
  }
  function onScroll() {
    if (!OFFER_PATHS.has(currentPath) || itemViewed || scrollOrigin === null) return;
    if (Math.abs(win.scrollY - scrollOrigin) < threshold) return;
    itemViewed = true;
    win.gtag('event', 'view_item', {
      currency: 'BRL',
      items: [{ item_id: 'pequenos_herois', item_name: 'Pequenos Heróis — biblioteca de histórias', quantity: 1 }],
    });
  }

  win.addEventListener('wheel', onScrollIntent, { passive: true });
  win.addEventListener('touchmove', onScrollIntent, { passive: true });
  win.addEventListener('keydown', onKeydown);
  win.addEventListener('scroll', onScroll, { passive: true });

  function getAnalyticsField(name, validate) {
    if (!installed || typeof win.gtag !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        win.clearTimeout(timeout);
        resolve(validate(value) ? String(value) : null);
      };
      const timeout = win.setTimeout(() => finish(null), 650);
      win.gtag('get', id, name, finish);
    });
  }
  async function checkoutAttribution() {
    const [clientId, sessionId] = await Promise.all([
      getAnalyticsField('client_id', isValidClientId),
      getAnalyticsField('session_id', isValidSessionId),
    ]);
    if (!clientId) return null;
    return { client_id: clientId, ...(sessionId ? { session_id: sessionId } : {}) };
  }

  function beginCheckout(plan) {
    const offer = GA4_OFFERS[plan];
    if (!installed || !offer) return Promise.resolve();
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        win.clearTimeout(timeout);
        resolve();
      };
      const timeout = win.setTimeout(finish, 450);
      win.gtag('event', 'begin_checkout', {
        currency: 'BRL',
        value: offer.price,
        items: [{ ...offer, quantity: 1 }],
        event_callback: finish,
      });
    });
  }

  return { trackRoute, checkoutAttribution, beginCheckout };
}
