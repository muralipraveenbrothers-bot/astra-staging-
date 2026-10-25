import React, { useState } from "react";
import { AstraUniversalOrder, OrderType, OrderStatus } from "./universalOrderTypes";
import { hospitalAudio } from "../../utils/audioAlerts";
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Stethoscope,
  Send,
  Building2,
  Activity,
  FileText,
  User,
  ShieldAlert,
  ArrowRight,
  Filter,
  Check,
  RefreshCw,
  Bell,
  Cpu,
} from "lucide-react";

interface OrderCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: AstraUniversalOrder[];
  onReviewOrder?: (orderId: string) => void;
  onUpdateOrderStatus?: (orderId: string, newStatus: OrderStatus, resultNote?: string) => void;
}

export const OrderCenterModal: React.FC<OrderCenterModalProps> = ({
  isOpen,
  onClose,
  orders,
  onReviewOrder,
  onUpdateOrderStatus,
}) => {
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AstraUniversalOrder | null>(null);

  if (!isOpen) return null;

  // Filtered orders
  const filteredOrders = orders.filter((ord) => {
    const matchesTab = activeTab === "ALL" || ord.orderType === activeTab;
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !q ||
      ord.patientName.toLowerCase().includes(q) ||
      ord.patientUhid.toLowerCase().includes(q) ||
      ord.bedNumber.toLowerCase().includes(q) ||
      ord.orderId.toLowerCase().includes(q) ||
      ord.itemSummary.toLowerCase().includes(q);
    return matchesTab && matchesQuery;
  });

  // Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "SENT" || o.status === "RECEIVED" || o.status === "IN_PROGRESS").length;
  const resultsAvailable = orders.filter((o) => o.status === "RESULT_AVAILABLE").length;
  const stuckOrders = orders.filter((o) => o.isStuck || o.status === "STUCK").length;
  const completedOrders = orders.filter((o) => o.status === "COMPLETED" || o.status === "DOCTOR_REVIEWED").length;

  const tabs: { id: string; label: string }[] = [
    { id: "ALL", label: "All Orders" },
    { id: "LABORATORY", label: "Laboratory" },
    { id: "RADIOLOGY", label: "Radiology" },
    { id: "PHARMACY", label: "Pharmacy" },
    { id: "NURSING_WARD", label: "Ward & Vitals" },
    { id: "CONSULTATION", label: "Consultations" },
    { id: "SURGERY_OT", label: "OT & Surgery" },
  ];

  const getStatusBadge = (status: OrderStatus, isStuck?: boolean) => {
    if (isStuck || status === "STUCK") {
      return { bg: "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse", label: "STUCK / DELAYED" };
    }
    switch (status) {
      case "DRAFT":
        return { bg: "bg-slate-800 text-slate-400 border-slate-700", label: "DRAFT" };
      case "SENT":
        return { bg: "bg-blue-500/20 text-blue-300 border-blue-500/40", label: "SENT TO DEPT" };
      case "RECEIVED":
        return { bg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40", label: "DEPT RECEIVED" };
      case "SAMPLE_COLLECTED":
        return { bg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40", label: "SAMPLE COLLECTED" };
      case "IN_PROGRESS":
        return { bg: "bg-amber-500/20 text-amber-300 border-amber-500/40", label: "PROCESSING" };
      case "RESULT_AVAILABLE":
        return { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold animate-pulse", label: "RESULT AVAILABLE" };
      case "DOCTOR_REVIEWED":
      case "COMPLETED":
        return { bg: "bg-emerald-950 text-emerald-400 border-emerald-800", label: "CLOSED LOOP" };
      default:
        return { bg: "bg-slate-800 text-slate-300 border-slate-700", label: status };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="bg-white border border-[#E3E8EF] rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 bg-white border-b border-[#E3E8EF] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F1F4F7] text-[#1769AA] border border-[#E3E8EF] flex items-center justify-center font-bold shadow-sm">
              <Activity className="w-6 h-6 text-[#1769AA]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0B1F3A] flex items-center gap-2">
                Astra Universal Hospital Order Center
                <span className="text-[10px] font-semibold bg-[#F1F4F7] text-[#1769AA] border border-[#E3E8EF] px-2 py-0.5 rounded-full">
                  Closed-Loop Order Router
                </span>
              </h2>
              <p className="text-xs text-[#667085]">
                Single source of truth for all Orders across Doctor, Ward, Lab, Pharmacy, Radiology, Consults & OT.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#667085] hover:text-[#0B1F3A] rounded-xl hover:bg-[#F1F4F7] transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Top Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-[#F7F8FA] border-b border-[#E3E8EF] text-xs">
          <div className="bg-white p-3 rounded-xl border border-[#E3E8EF] shadow-sm">
            <span className="text-[#667085] text-[10px] block font-semibold">TOTAL ORDERS</span>
            <span className="text-[#0B1F3A] font-bold text-sm">{totalOrders}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#E3E8EF] shadow-sm">
            <span className="text-[#667085] text-[10px] block font-semibold">IN PROGRESS</span>
            <span className="text-[#1769AA] font-bold text-sm">{pendingOrders}</span>
          </div>
          <div className="bg-[#E8F5E9] p-3 rounded-xl border border-[#A5D6A7] shadow-sm">
            <span className="text-[#16805B] text-[10px] block font-bold">RESULTS AVAILABLE</span>
            <span className="text-[#16805B] font-bold text-sm">{resultsAvailable}</span>
          </div>
          <div className="bg-[#FFEBEE] p-3 rounded-xl border border-[#FFCDD2] shadow-sm">
            <span className="text-[#C63C3C] text-[10px] block font-bold">STUCK / DELAYED</span>
            <span className="text-[#C63C3C] font-bold text-sm">{stuckOrders}</span>
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#E3E8EF] shadow-sm">
            <span className="text-[#667085] text-[10px] block font-semibold">CLOSED LOOPS</span>
            <span className="text-[#172033] font-bold text-sm">{completedOrders}</span>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="p-4 bg-white border-b border-[#E3E8EF] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Department Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none pb-1 sm:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-[#1769AA] text-white shadow-sm"
                    : "bg-[#F7F8FA] text-[#667085] hover:text-[#0B1F3A] hover:bg-[#F1F4F7]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search UHID, Bed, Order ID..."
              className="w-full bg-white border border-[#E3E8EF] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#172033] placeholder-[#98A2B3] focus:outline-none focus:border-[#1769AA]"
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left: Orders List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 border-r border-slate-800/80">
            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <FileText className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-xs">No active orders matching search query</p>
              </div>
            ) : (
              filteredOrders.map((ord) => {
                const statusBadge = getStatusBadge(ord.status, ord.isStuck);
                const isSelected = selectedOrder?.orderId === ord.orderId;

                return (
                  <div
                    key={ord.orderId}
                    onClick={() => setSelectedOrder(ord)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                      isSelected
                        ? "bg-slate-900 border-cyan-500 shadow-xl"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90"
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span className="font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                          {ord.bedNumber}
                        </span>
                        <span className="text-cyan-400 font-bold">{ord.patientName}</span>
                        <span className="text-slate-500 text-[10px]">({ord.patientUhid})</span>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${statusBadge.bg}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    {/* Order Details */}
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-white flex items-center justify-between">
                        <span>{ord.itemSummary}</span>
                        <span className="text-[10px] font-mono text-slate-400">{ord.orderId}</span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center justify-between">
                        <span>
                          Target: <strong className="text-slate-200">{ord.destinationDept}</strong>
                        </span>
                        <span className="font-mono text-slate-500">{ord.createdAt}</span>
                      </div>
                    </div>

                    {/* Stuck Warning Banner */}
                    {ord.isStuck && (
                      <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs flex items-center gap-2 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="line-clamp-1">{ord.stuckReason || "Order response delayed beyond threshold."}</span>
                      </div>
                    )}

                    {/* Result Summary Preview if available */}
                    {ord.resultSummary && (
                      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 text-xs text-slate-300 font-mono">
                        <span className="text-emerald-400 block text-[10px] font-sans font-bold">RESULT SUMMARY:</span>
                        {ord.resultSummary}
                      </div>
                    )}

                    {/* Progress Bar & Action */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>CLOSED LOOP PROGRESS</span>
                        <span className="font-bold text-cyan-400">{ord.closedLoopProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-500 ${
                            ord.closedLoopProgress === 100
                              ? "bg-emerald-400"
                              : ord.status === "RESULT_AVAILABLE"
                              ? "bg-cyan-400"
                              : "bg-indigo-500"
                          }`}
                          style={{ width: `${ord.closedLoopProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Selected Order Audit & Timeline Drawer */}
          <div className="w-full md:w-96 bg-slate-900/90 border-t md:border-t-0 md:border-l border-slate-800 p-5 overflow-y-auto space-y-5">
            {selectedOrder ? (
              <div className="space-y-5 text-xs">
                {/* Header */}
                <div className="border-b border-slate-800 pb-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-cyan-400 uppercase font-bold">{selectedOrder.orderId}</span>
                    <span className="font-mono text-[10px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800">
                      {selectedOrder.priority}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">{selectedOrder.itemSummary}</h3>
                  <div className="text-slate-400 font-mono text-[11px]">
                    Patient: <strong className="text-white">{selectedOrder.patientName}</strong> ({selectedOrder.bedNumber})
                  </div>
                </div>

                {/* Status & Department */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Destination Department</span>
                    <span className="text-white font-bold">{selectedOrder.destinationDept}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Ordering Doctor</span>
                    <span className="text-slate-200">{selectedOrder.orderingDoctor}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Order Created At</span>
                    <span className="font-mono text-slate-300">{selectedOrder.createdAt}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {selectedOrder.status === "RESULT_AVAILABLE" && onReviewOrder && (
                    <button
                      onClick={() => {
                        hospitalAudio.playSuccessChime();
                        onReviewOrder(selectedOrder.orderId);
                        setSelectedOrder((prev) => prev ? { ...prev, status: "DOCTOR_REVIEWED", closedLoopProgress: 100 } : null);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Acknowledge & Close Loop
                    </button>
                  )}

                  {onUpdateOrderStatus && selectedOrder.status === "SENT" && (
                    <button
                      onClick={() => {
                        hospitalAudio.playOrderDispatchSound();
                        onUpdateOrderStatus(selectedOrder.orderId, "RECEIVED");
                        setSelectedOrder((prev) => prev ? { ...prev, status: "RECEIVED", closedLoopProgress: 40 } : null);
                      }}
                      className="w-full bg-[#1769AA] hover:bg-[#125387] text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Simulate Department Accept
                    </button>
                  )}

                  {onUpdateOrderStatus && selectedOrder.status === "RECEIVED" && (
                    <button
                      onClick={() => {
                        hospitalAudio.playCriticalAlertSound();
                        onUpdateOrderStatus(selectedOrder.orderId, "RESULT_AVAILABLE", "Sample processed: Result Within Range");
                        setSelectedOrder((prev) => prev ? { ...prev, status: "RESULT_AVAILABLE", closedLoopProgress: 80 } : null);
                      }}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Simulate Result Available
                    </button>
                  )}
                </div>

                {/* Audit Timeline */}
                <div className="space-y-3 border-t border-slate-800 pt-3">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-cyan-400" /> Closed-Loop Clinical Audit Trail
                  </h4>

                  <div className="relative pl-4 space-y-3 border-l border-slate-800">
                    {selectedOrder.timelineEvents.map((evt, idx) => (
                      <div key={idx} className="relative space-y-0.5">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-cyan-500 border border-slate-900" />
                        <div className="font-mono text-[10px] text-slate-500 flex items-center justify-between">
                          <span>{evt.timestamp} • {evt.dept}</span>
                          <span className="text-slate-400">{evt.actor}</span>
                        </div>
                        <div className="text-xs text-slate-200 font-medium">{evt.event}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-6 space-y-2">
                <Stethoscope className="w-8 h-8 text-slate-600" />
                <p className="text-xs">Select any order on the left to view complete closed-loop audit trail & department logs.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
