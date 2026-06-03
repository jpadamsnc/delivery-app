import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const DRIVER_COLORS = ['#2563EB', '#EA580C'];
const DEPOT_COLOR = '#1F2937';

function makeCircleIcon(color, label) {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.4);line-height:1">${label}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
}

function makeDepotIcon() {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;border-radius:4px;background:${DEPOT_COLOR};border:2px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.4)">⌂</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

const RouteMap = ({ depot, routes, polylines }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  // Init map once — clean up any prior Leaflet state so React Strict Mode double-invoke is safe
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    // Clear Leaflet's internal container ID to allow re-init on the same div
    if (container._leaflet_id) delete container._leaflet_id;
    const map = L.map(container).setView([35.5, -78.5], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers + polylines when routes change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old layers
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    if (!depot || !routes?.length) return;

    const bounds = [];

    // Depot marker
    const depotMarker = L.marker([depot.lat, depot.lon], { icon: makeDepotIcon() })
      .bindPopup('<b>Depot / Start & End</b>')
      .addTo(map);
    layersRef.current.push(depotMarker);
    bounds.push([depot.lat, depot.lon]);

    routes.forEach((route, rIdx) => {
      const color = DRIVER_COLORS[rIdx % DRIVER_COLORS.length];

      // Polyline
      if (polylines?.[rIdx]?.length) {
        const line = L.polyline(polylines[rIdx], { color, weight: 4, opacity: 0.75 }).addTo(map);
        layersRef.current.push(line);
      }

      // Stop markers
      route.stops.forEach((stop, sIdx) => {
        const { order } = stop;
        if (!order) return;
        const lat = parseFloat(order.lat);
        const lon = parseFloat(order.lon);
        if (isNaN(lat) || isNaN(lon)) return;

        const marker = L.marker([lat, lon], { icon: makeCircleIcon(color, sIdx + 1) })
          .bindPopup(
            `<b>${order.customerName}</b><br>${order.street}<br>${order.city}, ${order.state} ${order.zip}<br><span style="color:${color};font-weight:600">Driver ${route.vehicleId} · Stop ${sIdx + 1}</span>`
          )
          .addTo(map);
        layersRef.current.push(marker);
        bounds.push([lat, lon]);
      });
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 11);
    }
  }, [depot, routes, polylines]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
};

export default RouteMap;
