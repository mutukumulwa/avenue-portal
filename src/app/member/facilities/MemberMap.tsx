"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Navigation } from "lucide-react";

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom icon for user location
const UserLocationIcon = L.divIcon({
  className: "bg-blue-500 rounded-full border-4 border-white shadow-lg w-4 h-4",
  iconSize: [20, 20],
});

function MapBounds({ providers, userPos }: { providers: any[]; userPos: { lat: number; lng: number } }) {
  const map = useMap();

  useEffect(() => {
    if (providers.length === 0) {
      map.setView([userPos.lat, userPos.lng], 13);
      return;
    }

    const bounds = L.latLngBounds([userPos.lat, userPos.lng], [userPos.lat, userPos.lng]);
    providers.forEach(p => {
      if (p.geoLatitude && p.geoLongitude) {
        bounds.extend([p.geoLatitude, p.geoLongitude]);
      }
    });
    
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [providers, userPos, map]);

  return null;
}

export default function MemberMap({ position, providers }: { position: { lat: number; lng: number }; providers: any[] }) {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={13}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <Marker position={[position.lat, position.lng]} icon={UserLocationIcon}>
        <Popup>You are here</Popup>
      </Marker>

      {providers.map(p => (
        <Marker key={p.id} position={[p.geoLatitude, p.geoLongitude]}>
          <Popup>
            <div className="font-sans">
              <p className="font-bold text-sm m-0 leading-tight">{p.name}</p>
              <p className="text-xs text-gray-500 m-0 mt-1">{p.type} • {Number(p.distance).toFixed(1)} km</p>
              <a 
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.geoLatitude},${p.geoLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block bg-blue-600 text-white text-center rounded px-2 py-1 text-xs font-bold no-underline hover:bg-blue-700"
              >
                Navigate
              </a>
            </div>
          </Popup>
        </Marker>
      ))}

      <MapBounds providers={providers} userPos={position} />
    </MapContainer>
  );
}
