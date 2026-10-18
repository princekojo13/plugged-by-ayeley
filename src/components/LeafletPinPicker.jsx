import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Search, LoaderCircle, MapPin } from "lucide-react";
import { ACCRA_HUB } from "@/lib/siteConfig";
import "leaflet/dist/leaflet.css";

const GHANA_BOUNDS = [
  [4.5, -3.5],
  [11.5, 1.5],
];
const GHANA_BBOX = "-3.5,4.5,1.5,11.5";
const locationSearchCache = new Map();
let lastLocationSearchAt = 0;

function formatPlaceName(properties = {}) {
  const parts = [
    properties.name,
    properties.housenumber && properties.street
      ? `${properties.housenumber} ${properties.street}`
      : properties.street,
    properties.district,
    properties.city || properties.locality,
    properties.county,
    properties.state,
    properties.country,
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function MapPosition({ location, searchResult }) {
  const map = useMap();

  useEffect(() => {
    const point = searchResult || location;
    if (point) map.flyTo([point.lat, point.lng], searchResult ? 15 : map.getZoom(), { duration: 0.5 });
  }, [location, map, searchResult]);

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

export default function LeafletPinPicker({ location, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState(null);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "delivery-location-pin",
        html: '<span aria-hidden="true"></span>',
        iconSize: [28, 36],
        iconAnchor: [14, 34],
      }),
    []
  );

  const center = location ? [location.lat, location.lng] : ACCRA_HUB;

  const searchLocation = async () => {
    const term = query.trim();
    if (term.length < 3 || searching) return;

    setSearching(true);
    setSearchError("");
    setResults([]);
    try {
      const cacheKey = term.toLocaleLowerCase();
      if (locationSearchCache.has(cacheKey)) {
        const cached = locationSearchCache.get(cacheKey);
        setResults(cached);
        if (!cached.length) setSearchError("No places found in Ghana. Try a nearby town or landmark.");
        return;
      }
      const waitMs = 1_100 - (Date.now() - lastLocationSearchAt);
      if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      // Search runs only on submit, and this client-wide delay and cache keep
      // repeat requests to the free community geocoder low.
      const params = new URLSearchParams({
        q: term,
        countrycode: "GH",
        bbox: GHANA_BBOX,
        lat: String((4.5 + 11.5) / 2),
        lon: String((-3.5 + 1.5) / 2),
        lang: "en",
        limit: "5",
      });
      lastLocationSearchAt = Date.now();
      const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 429) throw new Error("Location search is busy. Please wait a moment and try again.");
      if (!response.ok) throw new Error("Location search is temporarily unavailable. You can still place the pin on the map.");
      const data = await response.json();
      const places = Array.isArray(data?.features) ? data.features.flatMap((feature) => {
        const [lng, lat] = feature?.geometry?.coordinates || [];
        const properties = feature?.properties || {};
        const displayName = formatPlaceName(properties);
        if (
          !displayName ||
          properties.countrycode?.toUpperCase() !== "GH" ||
          !Number.isFinite(Number(lat)) ||
          !Number.isFinite(Number(lng)) ||
          Number(lat) < 4.5 || Number(lat) > 11.5 ||
          Number(lng) < -3.5 || Number(lng) > 1.5
        ) return [];
        return [{
          place_id: `${properties.osm_type || "place"}-${properties.osm_id || `${lat}-${lng}`}`,
          lat: Number(lat),
          lon: Number(lng),
          display_name: displayName,
        }];
      }) : [];
      locationSearchCache.set(cacheKey, places);
      setResults(places);
      if (!places.length) setSearchError("No places found in Ghana. Try a nearby town or landmark.");
    } catch (error) {
      setSearchError(error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "Location search timed out. Please try again. You can still place the pin on the map."
        : error.message || "Location search is temporarily unavailable. You can still place the pin on the map.");
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (place) => {
    const point = { lat: Number(place.lat), lng: Number(place.lon) };
    setSearchResult(point);
    onSelect(point);
    setQuery(place.display_name || query);
    setResults([]);
    setSearchError("");
  };

  const handleDragEnd = (event) => {
    const point = event.target.getLatLng();
    onSelect({ lat: point.lat, lng: point.lng });
    setSearchResult(null);
  };

  return (
    <div className="w-full">
      <div className="relative z-10 flex gap-2 border-b border-border bg-white p-3">
        <label htmlFor="delivery-map-search" className="sr-only">Search a Ghana location</label>
        <div className="relative min-w-0 flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="delivery-map-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                void searchLocation();
              }
            }}
            placeholder="Search town, area or landmark"
            maxLength={120}
            autoComplete="street-address"
            className="ck-input pl-9"
          />
        </div>
        <button type="button" onClick={() => void searchLocation()} disabled={searching || query.trim().length < 3} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md bg-pink px-3 text-sm font-semibold text-white transition hover:bg-carbon disabled:cursor-not-allowed disabled:opacity-50">
          {searching ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          <span className="hidden sm:inline">Search</span>
        </button>
      </div>
      <p className="border-b border-border bg-white px-3 pb-2 text-[11px] text-muted-foreground">Search a Ghana town, area or landmark, then fine-tune the pin. Map data © OpenStreetMap contributors.</p>
      {searchError && <p role="status" className="bg-white px-3 py-2 text-xs text-muted-foreground">{searchError}</p>}
      {results.length > 0 && (
        <ul aria-label="Location search results" className="relative z-10 max-h-44 overflow-y-auto border-b border-border bg-white">
          {results.map((place) => (
            <li key={place.place_id}>
              <button type="button" onClick={() => chooseResult(place)} className="w-full border-t border-border px-3 py-2 text-left text-xs text-carbon hover:bg-london focus:bg-london focus:outline-none">
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative h-[320px] w-full" aria-label="Delivery location picker">
        <MapContainer
          center={center}
          zoom={location ? 14 : 11}
          minZoom={7}
          maxZoom={19}
          maxBounds={GHANA_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom={false}
          className="h-full w-full"
          style={{ zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onSelect={(point) => { setSearchResult(null); onSelect(point); }} />
          <MapPosition location={location} searchResult={searchResult} />
          {location && (
            <Marker
              position={[location.lat, location.lng]}
              icon={icon}
              draggable
              eventHandlers={{ dragend: handleDragEnd }}
            />
          )}
        </MapContainer>
      </div>
      <style>{`
        .delivery-location-pin { background: transparent; border: 0; }
        .delivery-location-pin span {
          display: block; width: 24px; height: 24px; margin: 2px;
          border: 3px solid #fff; border-radius: 50% 50% 50% 0;
          background: #e5006f; box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
          transform: rotate(-45deg);
        }
      `}</style>
    </div>
  );
}
