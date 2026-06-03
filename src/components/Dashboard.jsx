import React, { useState, Component } from 'react';
import { createPortal } from 'react-dom';

class RouteErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          <p className="font-semibold mb-1">Route planning error</p>
          <p className="text-sm font-mono">{this.state.error.message}</p>
          <button
            className="mt-3 text-sm underline"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Download, Printer, Search, X, Package, MapPin, Calendar, ArrowUpRight, Navigation } from 'lucide-react';
import { exportToCSV, generateVamoData, prepareLabelData } from '../utils/csvProcessor';
import LabelTemplate from './LabelTemplate';
import RouteOptimizer from './RouteOptimizer';
import { format } from 'date-fns';

const Dashboard = ({ data, onReset }) => {
  const [activeTab, setActiveTab] = useState('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [printQueue, setPrintQueue] = useState(null); // null | array of label objects

  const vamoData = generateVamoData(data);
  const labelData = prepareLabelData(data);

  const filteredOrders = labelData.filter(
    (o) =>
      o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.orderId.includes(searchTerm)
  );

  const totalItems = labelData.reduce((acc, curr) => acc + curr.items.length, 0);

  const handleExport = () => {
    exportToCSV(vamoData, `VAMO_Upload_${format(new Date(), 'MM-dd-yyyy')}.csv`);
  };

  const handlePrintSingle = (order) => {
    setPrintQueue([order]);
    setTimeout(() => window.print(), 150);
  };

  const handlePrintLabels = (orderedLabels) => {
    setPrintQueue(orderedLabels);
    setTimeout(() => window.print(), 150);
  };

  const handleClosePrint = () => setPrintQueue(null);

  const tabs = [
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'routes', label: 'Route Planning', icon: Navigation },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 font-sans text-gray-900">

      {/* Stats + Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Package size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Orders</span>
          </div>
          <div className="text-3xl font-bold">{labelData.length}</div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <ArrowUpRight size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Items</span>
          </div>
          <div className="text-3xl font-bold text-blue-600">{totalItems}</div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm md:col-span-2 flex items-center justify-between">
          <button
            onClick={onReset}
            className="text-sm text-red-600 hover:text-red-700 font-medium bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            Reset Session
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-all shadow-sm text-sm font-medium"
          >
            <Download size={16} />
            Export VAMO CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 print:hidden">
        <nav className="flex gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Orders tab */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search customers or order #…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <span className="text-sm text-gray-500">{filteredOrders.length} orders</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3 text-center">Items</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                      No orders matching &ldquo;{searchTerm}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">#{order.orderId}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          {(order.deliveryDate || '').replace(/\n/g, ' ').trim()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{order.customerName}</div>
                        <div className="text-sm text-gray-400 truncate max-w-[180px]">{order.street}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {order.deliveryType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-lg font-bold text-gray-700">{order.items.length}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handlePrintSingle(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-all text-sm font-medium"
                        >
                          <Printer size={14} />
                          Print
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Route Planning tab */}
      {activeTab === 'routes' && (
        <RouteErrorBoundary>
          <RouteOptimizer labelData={labelData} onPrintLabels={handlePrintLabels} />
        </RouteErrorBoundary>
      )}

      {/* Print portal — rendered directly on <body> so browser can paginate naturally */}
      {printQueue && createPortal(
        <div
          className="print-portal"
          style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 9999, overflowY: 'auto' }}
        >
          {/* Screen controls — hidden when printing */}
          <div className="fixed top-4 right-4 print:hidden flex flex-col items-end gap-2">
            <button
              onClick={handleClosePrint}
              className="p-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 shadow-lg"
            >
              <X size={22} />
            </button>
            <div className="text-xs bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded shadow text-center">
              Press <kbd className="font-mono font-bold">Ctrl+P</kbd> to print<br />
              or click X to return
            </div>
          </div>

          {/* Labels — flex on screen for preview, block in print for natural pagination */}
          <div className="flex flex-col items-center gap-6 py-8 print:block print:py-0 print:gap-0">
            {printQueue.map((order, idx) => (
              <LabelTemplate key={`${order.orderId}-${idx}`} data={order} />
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Dashboard;
