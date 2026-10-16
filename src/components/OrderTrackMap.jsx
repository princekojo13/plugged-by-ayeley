import { useEffect, useMemo } from "react";
import { MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { ACCRA_HUB } from "@/lib/siteConfig";
import "leaflet/dist/leaflet.css";

function InvalidateSize() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 200);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);

  return null;
}

export default function OrderTrackMap({ order }) {
  const destination = useMemo(() => {
    const latitude = Number(order?.delivery_lat);
    const longitude = Number(order?.delivery_lng);

    if (
      order?.delivery_lat === null ||
      order?.delivery_lat === undefined ||
      order?.delivery_lng === null ||
      order?.delivery_lng === undefined ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return [latitude, longitude];
  }, [order?.delivery_lat, order?.delivery_lng]);

  const points = useMemo(
    () => (destination ? [ACCRA_HUB, destination] : [ACCRA_HUB]),
    [destination]
  );
  const status = order?.status || order?.order_status;
  const distanceKm = Number(order?.distance_km);

  return (
    <div className="border border-border bg-white">
      <div className="border-b border-border p-5">
        <div className="mb-1 flex items-center gap-2">
          <Navigation className="h-4 w-4 text-pink" />
          <h3 className="font-heading text-sm font-bold text-carbon">
            Delivery Location
          </h3>
          {status && (
            <span className="ml-auto rounded bg-pink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pink">
              {status.replaceAll("_", " ")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Map showing the Accra dispatch hub and your selected delivery point.
        </p>
      </div>

      {destination ? (
        <div className="h-[360px] w-full">
          <MapContainer
            center={destination}
            zoom={9}
            className="h-full w-full"
            style={{ zIndex: 0 }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <InvalidateSize />
            <FitBounds points={points} />
            <CircleMarker
              center={ACCRA_HUB}
              radius={8}
              pathOptions={{ color: "#0A0A0A", fillColor: "#0A0A0A", fillOpacity: 1 }}
            >
              <Tooltip sticky>Accra Dispatch Hub</Tooltip>
            </CircleMarker>
            <CircleMarker
              center={destination}
              radius={8}
              pathOptions={{ color: "#e5006f", fillColor: "#e5006f", fillOpacity: 1 }}
            >
              <Tooltip sticky>Delivery Destination</Tooltip>
            </CircleMarker>
          </MapContainer>
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink/10 text-pink">
            <MapPin className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-semibold text-carbon">Map unavailable</p>
          <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
            Your order status is available, but no delivery pin was saved for this order.
          </p>
        </div>
      )}

      {Number.isFinite(distanceKm) && distanceKm > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-3 p-4">
            <RouteIcon className="h-5 w-5 text-pink" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Distance from Accra hub
              </p>
              <p className="font-heading font-bold text-carbon">
                {distanceKm.toFixed(1)} km
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
