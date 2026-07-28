// Building Google Maps directions URLs.
//
// Always hand Google street addresses, never raw coordinates. Given a lat/lon
// it snaps to the nearest thing it knows about, which routinely lands a few
// houses away or on a business with a similar address — Barn2Door coordinates
// are only accurate to within a house or two to begin with. Google's own
// geocoder resolves the address text far more reliably.
//
// Every Maps link in the app goes through here so the two can't drift apart.

// Best address text for an order, extra stop, or depot.
export function addressText(place) {
  if (!place) return null;

  // Conventional US formatting — "Raleigh, NC 27616", not "Raleigh, NC, 27616".
  const cityLine = [place.city, [place.state, place.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');

  // Some saved stops flattened a whole address into `street`. Appending the
  // city again would repeat it, so drop the suffix when it is already there.
  // Matching on ", City" keeps streets merely named after the town intact
  // ("100 Raleigh Rd" still gets ", Raleigh, NC" appended).
  const street   = place.street || '';
  const repeats  = place.city &&
    street.toLowerCase().includes(`, ${place.city.toLowerCase()}`);
  const parts    = [street, repeats ? '' : cityLine].filter(Boolean);

  // A geocode that reached street level is the cleanest thing to send.
  if (place.street && parts.length) return parts.join(', ');

  // Otherwise fall back to what the planner typed — when the geocoder only
  // managed a city-level match, the typed address is far more specific.
  if (place.address) return place.address;

  if (parts.length) return parts.join(', ');

  // Last resort. Better than nothing, but expect Google to snap it.
  if (place.lat != null && place.lon != null) return `${place.lat},${place.lon}`;

  return null;
}

// Compact "street, city" for on-screen stop lists and copied summaries.
export function shortAddress(place) {
  if (!place) return '';
  const street  = place.street || place.address || '';
  const repeats = place.city &&
    street.toLowerCase().includes(`, ${place.city.toLowerCase()}`);
  return [street, repeats ? '' : place.city].filter(Boolean).join(', ');
}

export function googleDirectionsUrl({ origin, destination, waypoints = [] }) {
  const params = ['api=1'];
  if (origin)      params.push(`origin=${encodeURIComponent(origin)}`);
  if (destination) params.push(`destination=${encodeURIComponent(destination)}`);
  if (waypoints.length) {
    // Each waypoint is escaped, but the | separators must stay literal.
    params.push(`waypoints=${waypoints.map(encodeURIComponent).join('|')}`);
  }
  params.push('travelmode=driving');
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
