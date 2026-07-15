const API_KEY = import.meta.env.VITE_ORS_API_KEY;
const BASE = 'https://api.openrouteservice.org';

export async function geocodeAddress(address) {
  const res = await fetch(
    `${BASE}/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(address)}&boundary.country=US&size=1`
  );
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = await res.json();
  if (!data.features?.length) throw new Error('Address not found. Try a more specific address.');
  const feature = data.features[0];
  const [lon, lat] = feature.geometry.coordinates;
  const p = feature.properties;
  return {
    lat, lon,
    label:  p.label,
    // layer tells how precise the match is: 'address' = exact house,
    // 'street' = street only, 'locality' = town center, etc.
    layer:  p.layer || '',
    street: [p.housenumber, p.street].filter(Boolean).join(' '),
    city:   p.locality || p.county || '',
    state:  p.region_a || '',
    zip:    p.postalcode || '',
  };
}

// Live address suggestions as the user types (ORS/Pelias autocomplete)
export async function autocompleteAddress(text, focus) {
  if (!text || text.trim().length < 4) return [];
  try {
    // Bias results toward the depot location so nearby matches rank first
    const focusParam = focus ? `&focus.point.lat=${focus.lat}&focus.point.lon=${focus.lon}` : '';
    const res = await fetch(
      `${BASE}/geocode/autocomplete?api_key=${API_KEY}&text=${encodeURIComponent(text)}&boundary.country=US&size=5&layers=address${focusParam}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(f => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return {
        lat, lon,
        label:  p.label,
        layer:  p.layer || '',
        street: [p.housenumber, p.street].filter(Boolean).join(' '),
        city:   p.locality || p.county || '',
        state:  p.region_a || '',
        zip:    p.postalcode || '',
      };
    });
  } catch {
    return [];
  }
}

// Fallback geocoder: US Census Bureau — official government address database.
// Catches newer subdivisions that OpenStreetMap-based data hasn't picked up yet.
// The Census API doesn't send CORS headers, so we use JSONP instead of fetch.
function censusJsonp(address) {
  return new Promise((resolve) => {
    const cb = `censusCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const cleanup = () => { delete window[cb]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); resolve(null); }, 10000);
    window[cb] = (data) => { clearTimeout(timer); cleanup(); resolve(data); };
    script.src =
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress` +
      `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=jsonp&callback=${cb}`;
    script.onerror = () => { clearTimeout(timer); cleanup(); resolve(null); };
    document.body.appendChild(script);
  });
}

export async function geocodeCensus(address) {
  try {
    const data = await censusJsonp(address);
    const match = data?.result?.addressMatches?.[0];
    if (!match) return null;
    const comp = match.addressComponents || {};
    return {
      lat:    match.coordinates.y,
      lon:    match.coordinates.x,
      label:  match.matchedAddress,
      layer:  'address',
      street: match.matchedAddress.split(',')[0],
      city:   comp.city  || '',
      state:  comp.state || '',
      zip:    comp.zip   || '',
    };
  } catch {
    return null;
  }
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
  const details = await getRouteDetails(waypoints);
  return details.coords;
}

// Route a fixed sequence of waypoints; returns path + total distance/duration
export async function getRouteDetails(waypoints) {
  const empty = { coords: [], distance: 0, duration: 0 };
  if (waypoints.length < 2) return empty;
  const res = await fetch(`${BASE}/v2/directions/driving-car/geojson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: API_KEY,
    },
    body: JSON.stringify({ coordinates: waypoints }),
  });
  if (!res.ok) return empty;
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return empty;
  return {
    coords:   feature.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distance: feature.properties?.summary?.distance ?? 0,
    duration: feature.properties?.summary?.duration ?? 0,
  };
}
