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
  return Object.keys(grouped).map((orderNum) => {
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

  return Object.keys(grouped).map((orderId) => {
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
};
