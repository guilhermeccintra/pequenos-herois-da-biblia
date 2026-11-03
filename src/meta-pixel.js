// Meta Pixel is limited to public, parent-facing sales pages.
// Never send reading activity, children's stories, authentication or account data.
export const META_PIXEL_ID = '1816678829421239';
const SALES_PATHS = new Set(['/', '/planos']);

function normalizedPath(pathname) {
  return (pathname || '/').replace(/\/+$/, '') || '/';
}

export function createMetaPixelTracker({ win, doc, pixelId = META_PIXEL_ID, threshold = 40 }) {
  let started = false;
  let activePath = null;
  let scrollOrigin = null;
  let viewedContent = false;

  function bootstrap() {
    if (started) return;
    started = true;
    if (!win.fbq) {
      const fbq = function (...args) {
        if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
        else fbq.queue.push(args);
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.push = fbq;
      win.fbq = fbq;
      win._fbq = fbq;
      const script = doc.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      doc.head.appendChild(script);
    }
    // Disable Meta's automatic event detection outside the explicitly tracked events.
    win.fbq('set', 'autoConfig', false, pixelId);
    win.fbq('init', pixelId);
  }

  function eligible() {
    return SALES_PATHS.has(activePath);
  }

  function syncRoute() {
    const path = normalizedPath(win.location.pathname);
    if (path === activePath) return;
    activePath = path;
    scrollOrigin = null;
    viewedContent = false;
    if (!eligible()) return;
    bootstrap();
    win.fbq('track', 'PageView');
  }

  function onScrollIntent() {
    if (eligible() && !viewedContent && scrollOrigin === null) {
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
    if (!eligible() || viewedContent || scrollOrigin === null) return;
    if (Math.abs(win.scrollY - scrollOrigin) < threshold) return;
    viewedContent = true;
    win.fbq('track', 'ViewContent');
  }

  win.addEventListener('wheel', onScrollIntent, { passive: true });
  win.addEventListener('touchmove', onScrollIntent, { passive: true });
  win.addEventListener('keydown', onKeydown);
  win.addEventListener('scroll', onScroll, { passive: true });

  function initiateCheckout(plan) {
    if (!eligible() || !['monthly', 'annual'].includes(plan)) return;
    win.fbq('track', 'InitiateCheckout', { content_ids: [plan] });
  }

  return { syncRoute, initiateCheckout };
}
