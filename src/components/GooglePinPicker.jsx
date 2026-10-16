import { useEffect, useRef, useState } from "react";
import { ACCRA_HUB } from "@/lib/siteConfig";
import { loadGoogleMaps } from "@/lib/googleMaps";

const HUB = { lat: ACCRA_HUB[0], lng: ACCRA_HUB[1] };

export default function GooglePinPicker({ location, onSelect }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [mapError, setMapError] = useState("");
  const [coordinates, setCoordinates] = useState({
    lat: location?.lat?.toString() || "",
    lng: location?.lng?.toString() || "",
  });

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let active = true;
    loadGoogleMaps().then((maps) => {
      if (!active || !elementRef.current) return;
      const map = new maps.Map(elementRef.current, {
        center: location || HUB,
        zoom: location ? 15 : 11,
        restriction: {
          latLngBounds: { north: 11.5, south: 4.5, west: -3.5, east: 1.5 },
          strictBounds: true,
        },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      mapRef.current = map;
      const marker = new maps.Marker({
        map: location ? map : null,
        position: location || undefined,
        draggable: true,
        title: "Delivery location",
      });
      markerRef.current = marker;
      map.addListener("click", (event) => {
        if (!event.latLng) return;
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        marker.setPosition(point);
        marker.setMap(map);
        onSelectRef.current(point);
      });
      marker.addListener("dragend", (event) => {
        if (!event.latLng) return;
        onSelectRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
    }).catch((error) => {
      if (active) setMapError(error.message || "Google Maps could not load.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setCoordinates({
      lat: location?.lat?.toString() || "",
      lng: location?.lng?.toString() || "",
    });
    if (!location || !mapRef.current || !markerRef.current) return;
    mapRef.current.panTo(location);
    markerRef.current.setPosition(location);
    markerRef.current.setMap(mapRef.current);
  }, [location]);

  const confirmCoordinates = () => {
    const lat = Number(coordinates.lat);
    const lng = Number(coordinates.lng);
    if (!Number.isFinite(lat) || lat < 4.5 || lat > 11.5 || !Number.isFinite(lng) || lng < -3.5 || lng > 1.5) {
      setMapError("Enter valid Ghana coordinates (latitude 4.5–11.5, longitude -3.5–1.5).");
      return;
    }
    setMapError("");
    onSelect({ lat, lng });
  };

  return (
    <div className="relative h-[320px] w-full bg-london">
      <div ref={elementRef} className="h-full w-full" aria-label="Google Maps delivery location picker" />
      {mapError && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-amber-200 bg-white/95 p-3 shadow-sm">
          <p className="text-xs text-amber-900">{mapError}</p>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input aria-label="Latitude" className="min-w-0 rounded border px-2 py-1 text-xs" type="number" step="any" placeholder="Latitude" value={coordinates.lat} onChange={(event) => setCoordinates((current) => ({ ...current, lat: event.target.value }))} />
            <input aria-label="Longitude" className="min-w-0 rounded border px-2 py-1 text-xs" type="number" step="any" placeholder="Longitude" value={coordinates.lng} onChange={(event) => setCoordinates((current) => ({ ...current, lng: event.target.value }))} />
            <button type="button" className="rounded bg-carbon px-3 py-1 text-xs font-semibold text-white" onClick={confirmCoordinates}>Set pin</button>
          </div>
        </div>
      )}
    </div>
  );
}
