// Lightweight analytics + error reporting bootstrapper.
// Reads keys from <meta name="analytics-config"> if present, else falls back to globals.
// PostHog + Sentry initialised lazily; both no-op if keys missing.

(function(){
  function getKey(name){
    const meta = document.querySelector(`meta[name="${name}"]`);
    return meta ? meta.getAttribute('content') : null;
  }

  // ── PostHog ────────────────────────────────────────────────────
  const posthogKey = getKey('posthog-key') || window.POSTHOG_KEY;
  if (posthogKey) {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init(posthogKey, { api_host: 'https://eu.i.posthog.com', persistence: 'localStorage', autocapture: true });
  }

  // ── Sentry ─────────────────────────────────────────────────────
  const sentryDsn = getKey('sentry-dsn') || window.SENTRY_DSN;
  if (sentryDsn) {
    const s = document.createElement('script');
    s.src = 'https://browser.sentry-cdn.com/8.45.0/bundle.tracing.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = function(){
      if (window.Sentry) {
        window.Sentry.init({
          dsn: sentryDsn,
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 1.0
        });
      }
    };
    document.head.appendChild(s);
  }

  // ── Meta Pixel ─────────────────────────────────────────────────
  // Hardcoded Pixel ID — same one used server-side in lib/meta-capi.mjs.
  // Sends PageView automatically. For conversion events use window.htnPixel.track(),
  // which returns an event_id you should pass to your server endpoint so it
  // can fire a matching CAPI event with the same id (Meta deduplicates).
  var META_PIXEL_ID = '1656775315345896';
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');

  // Capture fbclid → _fbc cookie so server-side CAPI can match users who
  // arrived from a Meta ad. Browser pixel writes _fbp itself; we only need
  // to handle _fbc since it requires URL-param parsing.
  try {
    var fbclid = new URLSearchParams(location.search).get('fbclid');
    if (fbclid) {
      var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      document.cookie = '_fbc=' + fbc + '; max-age=7776000; path=/; samesite=lax';
    }
  } catch(e){}

  function readCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // window.htnPixel.track(eventName, params, opts)
  //   - params:   {} for Lead/CompleteRegistration, {value, currency} for Purchase/InitiateCheckout
  //   - opts:     { eventId?: string, email?: string }   (email enables Advanced Matching)
  // Returns event_id. Pass it to your server endpoint so it can mirror via CAPI.
  window.htnPixel = {
    pixelId: META_PIXEL_ID,
    fbp: function(){ return readCookie('_fbp'); },
    fbc: function(){ return readCookie('_fbc'); },
    track: function(eventName, params, opts){
      opts = opts || {};
      var eventId = opts.eventId || (eventName.toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
      try {
        if (opts.email) {
          // Advanced Matching: re-init with email so Meta can match this user.
          // Email is hashed by Meta's pixel client-side before send.
          fbq('init', META_PIXEL_ID, { em: String(opts.email).trim().toLowerCase() });
        }
        fbq('track', eventName, params || {}, { eventID: eventId });
      } catch(e){}
      return eventId;
    }
  };

  // ── Helper to capture funnel events ───────────────────────────
  window.trackEvent = function(name, props){
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch {}
  };
})();
