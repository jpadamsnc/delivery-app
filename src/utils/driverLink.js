// Encode/decode a driver's route into a shareable URL fragment.
// JSON is deflate-compressed before base64 encoding to keep URLs short.
import { deflateSync, inflateSync } from 'fflate';

function compress(str) {
  const bytes = new TextEncoder().encode(str);
  const compressed = deflateSync(bytes, { level: 9 });
  const binary = Array.from(compressed, b => String.fromCharCode(b)).join('');
  return btoa(binary);
}

function decompress(b64) {
  const binary = atob(b64);
  const compressed = Uint8Array.from(binary, c => c.charCodeAt(0));
  const bytes = inflateSync(compressed);
  return new TextDecoder().decode(bytes);
}

// Legacy decode path for v1 links (plain base64, no compression)
function fromBase64Legacy(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDriverLink(route, driverName, farmName) {
  const payload = {
    v: 2,
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

  const encoded = compress(JSON.stringify(payload));
  const base = window.location.origin + window.location.pathname;
  return `${base}#r=${encodeURIComponent(encoded)}`;
}

export function decodeDriverHash(hash) {
  try {
    const match = hash.match(/[#&]r=([^&]+)/);
    if (!match) return null;

    const raw = decodeURIComponent(match[1]);

    // Try compressed (v2) first, fall back to legacy plain base64 (v1)
    let data;
    try {
      data = JSON.parse(decompress(raw));
    } catch {
      data = JSON.parse(fromBase64Legacy(raw));
    }

    if (!data?.stops) return null;

    return {
      vehicleId:  data.vehicleId,
      driverName: data.driverName,
      farmName:   data.farmName,
      summary:    data.summary,
      stops: data.stops.map(s => ({
        order:   s,
        stopNum: null,
      })),
    };
  } catch {
    return null;
  }
}
