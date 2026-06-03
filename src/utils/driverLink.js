// Encode/decode a driver's route into a shareable URL fragment.
// The full route data is base64-encoded into the URL hash so no backend is needed.

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDriverLink(route, driverName, farmName) {
  const payload = {
    v: 1,
    vehicleId: route.vehicleId,
    driverName,
    farmName,
    summary: route.summary,
    stops: route.stops.map(s => ({
      orderId:      s.order.orderId,
      customerName: s.order.customerName,
      phone:        s.order.phone        || '',
      deliveryNote: s.order.deliveryNote || '',
      street:       s.order.street,
      city:         s.order.city,
      state:        s.order.state,
      zip:          s.order.zip,
      lat:          s.order.lat,
      lon:          s.order.lon,
      items:        s.order.items,
    })),
  };

  const encoded = toBase64(JSON.stringify(payload));
  const base = window.location.origin + window.location.pathname;
  return `${base}#r=${encodeURIComponent(encoded)}`;
}

export function decodeDriverHash(hash) {
  try {
    const match = hash.match(/[#&]r=([^&]+)/);
    if (!match) return null;
    const json = fromBase64(decodeURIComponent(match[1]));
    const data = JSON.parse(json);
    if (data.v !== 1 || !data.stops) return null;

    // Reshape into the structure DriverView expects
    return {
      vehicleId: data.vehicleId,
      driverName: data.driverName,
      farmName: data.farmName,
      summary: data.summary,
      stops: data.stops.map(s => ({
        order: s,
        stopNum: null,
      })),
    };
  } catch {
    return null;
  }
}
