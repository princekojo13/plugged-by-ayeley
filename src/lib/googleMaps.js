let loadPromise;

export function loadGoogleMaps() {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return Promise.reject(new Error("Google Maps needs an API key. Add VITE_GOOGLE_MAPS_API_KEY to the site environment after enabling billing and Maps JavaScript API."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = `__pbaGoogleMapsReady${Date.now()}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.removeEventListener("error", handleError);
    };
    const handleError = () => {
      cleanup();
      loadPromise = undefined;
      reject(new Error("Google Maps could not load. Check the API key, billing, and allowed website referrers."));
    };
    window[callbackName] = () => {
      cleanup();
      resolve(window.google.maps);
    };
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${callbackName}`;
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}
