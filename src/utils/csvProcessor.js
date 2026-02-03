import Papa from 'papaparse';
import _ from 'lodash';

// Mapping configuration
// New File Column -> Source Column Name (or approximate)
// A -> AA Customer (Source "Customer")
// B -> M Phone Number (Source "Phone Number")
// C -> N Email (Source "Email")
// D -> O Delivery Note (Source "Delivery Note")
// E -> B Order # (Source "Order #")
// F -> I Street (Source "Street")
// G -> J City (Source "City")
// H -> K State (Source "State")
// I -> L Zip (Source "Zip")

export const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.error("CSV Parse Errors:", results.errors);
        }
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

export const generateVamoData = (sourceData) => {
  // Group by Order # (Column B in source, usually "Order #")
  const grouped = _.groupBy(sourceData, 'Order #');

  const vamoRows = Object.keys(grouped).map(orderResult => {
    const items = grouped[orderResult];
    const firstItem = items[0]; // Take customer details from the first item in the order

    // We only need one row per order for the VAMO file? 
    // "Any rows that have the same Order # should be combined in the new file."
    // This implies we aren't listing items, just the order/customer info.

    return {
      'Customer': firstItem['Customer'] || '',
      'Phone Number': firstItem['Phone Number'] || '',
      'Email': firstItem['Email'] || '',
      'Delivery Note': firstItem['Delivery Note'] || '',
      'Order #': firstItem['Order #'] || '',
      'Street': firstItem['Street'] || '',
      'City': firstItem['City'] || '',
      'State': firstItem['State'] || '',
      'Zip': firstItem['Zip'] || ''
    };
  });

  return vamoRows;
};

export const exportToCSV = (data, filename) => {
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const prepareLabelData = (sourceData) => {
  const grouped = _.groupBy(sourceData, 'Order #');

  return Object.keys(grouped).map(orderId => {
    const items = grouped[orderId];
    const info = items[0];

    return {
      orderId: orderId,
      deliveryDate: info['Delivery Date'],
      customerName: info['Customer'], // Or "Customer First Name" + " " + "Customer Last Name"
      deliveryType: info['Location'], // e.g. "Local Delivery"
      street: info['Street'],
      city: info['City'],
      state: info['State'],
      zip: info['Zip'],
      items: items.map(item => ({
        name: item['Item'],
        qty: item['Quantity'],
        unit: item['Size'], // "Size" column seems to hold the Unit info like "Dozen", "Half Gallon"
        weight: item['Final Weight']
      }))
    };
  });
};
