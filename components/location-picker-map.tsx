"use client";

// @ts-ignore
import "leaflet/dist/leaflet.css";
import type { LeafletMouseEvent } from "leaflet";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";

type LocationPickerMapProps = {
  lat: number;
  lng: number;
  onChange: (value: { lat: number; lng: number }) => void;
};

function ClickHandler({ onChange }: { onChange: (value: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

export default function LocationPickerMap({ lat, lng, onChange }: LocationPickerMapProps) {
  return (
    <MapContainer center={[lat, lng]} zoom={16} className="h-56 w-full rounded-xl border border-[#d6be98]">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: "#2f7d32", fillColor: "#44a047", fillOpacity: 0.9 }} />
      <ClickHandler onChange={onChange} />
    </MapContainer>
  );
}
