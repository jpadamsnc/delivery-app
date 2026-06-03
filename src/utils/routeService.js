const API_KEY = import.meta.env.VITE_ORS_API_KEY;
const BASE = 'https://api.openrouteservice.org';

export async function geocodeAddress(address) {
  const res = await fetch(
    `${BASE}/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(address)}&boundary.country=US&size=1`
  );
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = await res.json();
  if (!data.features?.length) throw new Error('Address not found. Try a more specific address.');
  const [lon, lat] = data.features[0].geometry.coordinates;
  return { lat, lon, label: data.features[0].properties.label };
}

export async function optimizeRoute(depot, orders, numVehicles) {
  // max_tasks caps stops per vehicle so VROOM must distribute them,
  // while still being free to minimise total drive duration across both routes.
  const maxTasks = numVehicles > 1 ? Math.ceil(orders.length / numVehicles) : undefined;

  const vehicles = Array.from({ length: numVehicles }, (_, i) => {
    const v = {
      id: i + 1,
      profile: 'driving-car',
      start: [depot.lon, depot.lat],
      end: [depot.lon, depot.lat],
    };
    if (maxTasks) v.max_tasks = maxTasks;
    return v;
  });

  const jobs = orders.map((order, i) => ({
    id: i + 1,
    location: [parseFloat(order.lon), parseFloat(order.lat)],
    description: order.customerName,
  }));

  const res = await fetch(`${BASE}/optimization`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY,
    },
    body: JSON.stringify({ jobs, vehicles }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Optimization failed: ${text}`);
  }
  return res.json();
}

export async function getDrivingTime(originLonLat, destLonLat) {
  // Returns driving duration in seconds, or null on failure
  try {
    const res = await fetch(`${BASE}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: API_KEY },
      body: JSON.stringify({ coordinates: [originLonLat, destLonLat] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.features?.[0]?.properties?.summary?.duration ?? null;
  } catch {
    return null;
  }
}

export async function getRoutePolyline(waypoints) {
  if (waypoints.length < 2) return [];
  const res = await fetch(`${BASE}/v2/directions/driving-car/geojson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY,
    },
    body: JSON.stringify({ coordinates: waypoints }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.features[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
}
