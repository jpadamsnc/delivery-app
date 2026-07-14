import Papa from 'papaparse';
import _ from 'lodash';

export const parseCsvText = (text) => {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) console.error('CSV Parse Errors:', results.errors);
        resolve(results.data);
      },
      error: (error) => reject(error),
    });
  });
};

export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => parseCsvText(e.target.result).then(resolve).catch(reject);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

export const generateVamoData = (sourceData) => {
  const grouped = _.groupBy(sourceData, 'Order #');
  const rows = Object.keys(grouped).map((orderNum) => {
    const first = grouped[orderNum][0];
    return {
      Customer: first['Customer'] || '',
      'Phone Number': first['Phone Number'] || '',
      Email: first['Email'] || '',
      'Delivery Note': first['Delivery Note'] || '',
      'Order #': first['Order #'] || '',
      Street: first['Street'] || '',
      City: first['City'] || '',
      State: first['State'] || '',
      Zip: first['Zip'] || '',
    };
  });

  // Combine rows with the same customer name AND street address into one row
  const byCustomerAddress = _.groupBy(rows, (r) =>
    `${(r.Customer || '').trim().toLowerCase()}|${(r.Street || '').trim().toLowerCase()}`
  );

  return Object.values(byCustomerAddress).map((group) => {
    if (group.length === 1) return group[0];
    const first = group[0];
    return {
      ...first,
      'Order #': group.map(r => r['Order #']).join(' + '),
      'Phone Number':  group.map(r => r['Phone Number']).find(Boolean)  || '',
      Email:           group.map(r => r.Email).find(Boolean)            || '',
      'Delivery Note': group.map(r => r['Delivery Note']).find(Boolean) || '',
    };
  });
};

export const exportToCSV = (data, filename) => {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const prepareLabelData = (sourceData) => {
  const grouped = _.groupBy(sourceData, 'Order #');

  const orders = Object.keys(grouped).map((orderId) => {
    const items = grouped[orderId];
    const info = items[0];

    return {
      orderId,
      deliveryDate: info['Delivery Date'],
      customerName: info['Customer'],
      phone: info['Phone Number'] || '',
      deliveryNote: info['Delivery Note'] || '',
      deliveryType: info['Location'],
      street: info['Street'],
      city: info['City'],
      state: info['State'],
      zip: info['Zip'],
      lat: info['Latitude'],
      lon: info['Longitude'],
      items: items.map((item) => ({
        name: item['Item'],
        qty: item['Quantity'],
        unit: item['Size'],
        weight: item['Final Weight'] || '',
      })),
    };
  });

  // Combine orders with the exact same customer name AND street address
  // into a single stop (items merged, order IDs joined with " + ").
  const byCustomerAddress = _.groupBy(orders, (o) =>
    `${(o.customerName || '').trim().toLowerCase()}|${(o.street || '').trim().toLowerCase()}`
  );

  return Object.values(byCustomerAddress).map((group) => {
    if (group.length === 1) return group[0];
    const first = group[0];
    return {
      ...first,
      orderId: group.map((o) => o.orderId).join(' + '),
      // Keep the first non-empty note/phone across the merged orders
      phone:        group.map(o => o.phone).find(Boolean)        || '',
      deliveryNote: group.map(o => o.deliveryNote).find(Boolean) || '',
      items: group.flatMap((o) => o.items),
    };
  });
};
