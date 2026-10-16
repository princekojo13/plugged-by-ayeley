import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import { ACCRA_HUB } from "@/lib/siteConfig";
import { loadGoogleMaps } from "@/lib/googleMaps";

export default function OrderTrackMap({ order }) {
  const mapElement = useRef(null);
  const [mapError, setMapError] = useState("");
  const destination = useMemo(() => {
    const latitude = Number(order?.delivery_lat);
    const longitude = Number(order?.delivery_lng);
    if (order?.delivery_lat == null || order?.delivery_lng == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { lat: latitude, lng: longitude };
  }, [order?.delivery_lat, order?.delivery_lng]);
  const status = order?.status || order?.order_status;
  const distanceKm = Number(order?.distance_km);

  useEffect(() => {
    if (!destination || !mapElement.current) return undefined;
    let active = true;
    let map;
    loadGoogleMaps().then((maps) => {
      if (!active || !mapElement.current) return;
      map = new maps.Map(mapElement.current, {
        center: destination,
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      const bounds = new maps.LatLngBounds();
      bounds.extend({ lat: ACCRA_HUB[0], lng: ACCRA_HUB[1] });
      bounds.extend(destination);
      map.fitBounds(bounds, 48);
      new maps.Marker({ map, position: { lat: ACCRA_HUB[0], lng: ACCRA_HUB[1] }, title: "Accra Dispatch Hub", label: "H" });
      new maps.Marker({ map, position: destination, title: "Delivery Destination" });
    }).catch((error) => { if (active) setMapError(error.message || "Google Maps could not load."); });
    return () => { active = false; };
  }, [destination]);

  return (
    <div className="border border-border bg-white">
      <div className="border-b border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <Navigation className="h-4 w-4 text-pink" />
          <h3 className="font-heading text-sm font-bold text-carbon">Delivery Location</h3>
          {status && <span className="ml-auto rounded bg-pink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pink">{status.replaceAll("_", " ")}</span>}
        </div>
        <p className="text-xs text-muted-foreground">Map showing the Accra dispatch hub and your selected delivery point.</p>
      </div>
      {destination ? (
        <div className="relative h-[360px] w-full">
          <div ref={mapElement} className="h-full w-full" aria-label="Google map showing the dispatch hub and delivery destination" />
          {mapError && <div role="status" className="absolute inset-0 flex items-center justify-center bg-white/90 px-6 text-center text-sm text-muted-foreground">{mapError}</div>}
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink/10 text-pink"><MapPin className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-semibold text-carbon">Map unavailable</p>
          <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">Your order status is available, but no delivery pin was saved for this order.</p>
        </div>
      )}
      {Number.isFinite(distanceKm) && distanceKm > 0 && (
        <div className="border-t border-border"><div className="flex items-center gap-3 p-4"><RouteIcon className="h-5 w-5 text-pink" /><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Distance from Accra hub</p><p className="font-heading font-bold text-carbon">{distanceKm.toFixed(1)} km</p></div></div></div>
      )}
    </div>
  );
}
