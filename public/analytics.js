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

  // ── Helper to capture funnel events ───────────────────────────
  window.trackEvent = function(name, props){
    try { if (window.posthog && window.posthog.capture) window.posthog.capture(name, props || {}); } catch {}
  };
})();
