import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { ACCRA_HUB } from "@/lib/siteConfig";
import "leaflet/dist/leaflet.css";

const GHANA_BOUNDS = [
  [4.5, -3.5],
  [11.5, 1.5],
];

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function InvalidateSize() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

export default function LeafletPinPicker({ location, onSelect }) {
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

  const center = location
    ? [location.lat, location.lng]
    : ACCRA_HUB;

  const handleDragEnd = (event) => {
    const point = event.target.getLatLng();
    onSelect({ lat: point.lat, lng: point.lng });
  };

  return (
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
        <MapClickHandler onSelect={onSelect} />
        <InvalidateSize />
        {location && (
          <Marker
            position={[location.lat, location.lng]}
            icon={icon}
            draggable
            eventHandlers={{ dragend: handleDragEnd }}
          />
        )}
      </MapContainer>
      <style>{`
        .delivery-location-pin {
          background: transparent;
          border: 0;
        }
        .delivery-location-pin span {
          display: block;
          width: 24px;
          height: 24px;
          margin: 2px;
          border: 3px solid #fff;
          border-radius: 50% 50% 50% 0;
          background: #e5006f;
          box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
          transform: rotate(-45deg);
        }
      `}</style>
    </div>
  );
}
