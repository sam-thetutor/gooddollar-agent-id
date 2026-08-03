import { useEffect } from "react";

const SITE_ID = "site_2bc41c52-11c0-43dc-9a83-d8a1bb1484ed_8";

// Fires once on mount. The SDK enforces its own frequency cap
// (popupMinIntervalMinutes / popupSessionMax) across page loads.
export function SovAdsPopup() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { SovAds, Popup } = await import("sovads-sdk");
        if (cancelled) return;

        const ads = new SovAds({ siteId: SITE_ID });
        await new Popup(ads).show();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[sovads] popup failed", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
