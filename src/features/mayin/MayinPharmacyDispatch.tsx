import { useState } from "react";
import { X, Zap, RefreshCw, Maximize2, Minimize2, List, Search, AlertTriangle, CheckCircle, Circle, Cpu, ArrowUpRight, ArrowDownLeft, ArrowUpLeft, ArrowDownRight, Pill, FlaskConical, Activity, Users, Bed, Calendar, Clock, DollarSign, Truck, Package, Check, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinPharmacyDispatchProps {
  onClose: () => void;
  orderData: any;
}

export function MayinPharmacyDispatch({
  onClose,
  orderData,
}: MayinPharmacyDispatchProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  // Extract order data or use placeholder if none provided
  const order = orderData || {
    id: "PHARM12345",
    patient: {
      name: "Ravi Kumar",
      uhid: "UHID12345",
      age: 45,
      gender: "Male",
    },
    doctor: "Dr. Arjun",
    medications: [
      {
        name: "Paracetamol",
        dosage: "500mg",
        frequency: "OD",
        route: "Oral",
        quantity: "10 tablets",
      },
      {
        name: "Atorvastatin",
        dosage: "10mg",
        frequency: "OD",
        route: "Oral",
        quantity: "30 tablets",
      },
    ],
    status: "processing", // ordered, processing, ready, dispensed, delivered
    timestamp: "2023-11-15 14:30",
    priority: "routine",
    pharmacy: {
      name: "Main Pharmacy",
      location: "Ground Floor",
      contact: "ext. 1234",
    },
    stages: [
      { id: "ordered", name: "Order Received", completed: true, timestamp: "2023-11-15 14:30" },
      { id: "processing", name: "Processing", completed: true, timestamp: "2023-11-15 14:35" },
      { id: "ready", name: "Ready for Pickup", completed: false, timestamp: null },
      { id: "dispensed", name: "Dispensed", completed: false, timestamp: null },
      { id: "delivered", name: "Delivered", completed: false, timestamp: null },
    ],
  };

  // Determine current stage based on completion
  const getCurrentStage = () => {
    const incompleteStage = order.stages.find((stage: any) => !stage.completed);
    return incompleteStage ? incompleteStage.id : order.stages[order.stages.length - 1].id;
  };

  // Get stage status
  const getStageStatus = (stageId: string) => {
    const stage = order.stages.find((s: any) => s.id === stageId);
    return stage ? stage.completed : false;
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Pending";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 ${expanded ? "" : "pointer-events-none"}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className={`bg-slate-900 rounded-xl shadow-2xl shadow-emerald-500/20 overflow-hidden ${expanded ? "w-[90vw] h-[90vh]" : "w-[800px] h-[600px]"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-medium text-slate-200">Pharmacy Order</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-1 rounded text-xs">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span className="font-medium">{order.status}</span>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-slate-700/50"
            >
              {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-700/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Sidebar */}
          <div className={`bg-slate-800/30 border-r border-white/5 p-4 overflow-y-auto ${expanded ? "w-64" : "w-48"}`}>
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => setActiveTab("overview")}
                className={`flex-1 p-2 rounded text-xs ${activeTab === "overview" ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
                >
                  Overview
                </button>
              <button
                onClick={() => setActiveTab("medications")}
                className={`flex-1 p-2 rounded text-xs ${activeTab === "medications" ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
                >
                  Medications
                </button>
              <button
                onClick={() => setActiveTab("tracking")}
                className={`flex-1 p-2 rounded text-xs ${activeTab === "tracking" ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
                >
                  Tracking
                </button>
            </div>

            {activeTab === "overview" ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-slate-300 mb-2">Patient</h4>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-200"><span className="font-medium">Name:</span> {order.patient.name}</p>
                    <p className="text-xs text-slate-200"><span className="font-medium">UHID:</span> {order.patient.uhid}</p>
                    <p className="text-xs text-slate-200"><span className="font-medium">Age/Gender:</span> {order.patient.age}/{order.patient.gender}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-slate-300 mb-2">Doctor</h4>
                  <p className="text-xs text-slate-200">{order.doctor}</p>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-slate-300 mb-2">Order Details</h4>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-200"><span className="font-medium">Order ID:</span> {order.id}</p>
                    <p className="text-xs text-slate-200"><span className="font-medium">Timestamp:</span> {formatTimestamp(order.timestamp)}</p>
                    <p className="text-xs text-slate-200"><span className="font-medium">Priority:</span> {order.priority}</p>
                    <p className="text-xs text-slate-200"><span className="font-medium">Pharmacy:</span> {order.pharmacy.name}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-slate-300 mb-2">Order Status</h4>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      {order.status === "ordered" ? <List className="w-6 h-6" /> :
                       order.status === "processing" ? <Zap className="w-6 h-6" /> :
                       order.status === "ready" ? <CheckCircle className="w-6 h-6" /> :
                       order.status === "dispensed" ? <Truck className="w-6 h-6" /> :
                       <Package className="w-6 h-6" />}
                    </div>
                    <p className="text-sm text-slate-200">{order.status}</p>
                  </div>
                </div>
              </div>
            ) : activeTab === "medications" ? (
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-slate-300 mb-2">Medications</h4>
                <div className="space-y-2">
                  {order.medications.map((med: any, i: number) => (
                    <div key={i} className="p-2 rounded bg-slate-700/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Pill className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-medium text-slate-200">{med.name}</h4>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-200"><span className="font-medium">Dosage:</span> {med.dosage}</p>
                        <p className="text-xs text-slate-200"><span className="font-medium">Frequency:</span> {med.frequency}</p>
                        <p className="text-xs text-slate-200"><span className="font-medium">Route:</span> {med.route}</p>
                        <p className="text-xs text-slate-200"><span className="font-medium">Quantity:</span> {med.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h4 className="text-xs font-medium text-slate-300 mb-2">Order Tracking</h4>
                <div className="space-y-2">
                  {order.stages.map((stage: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          {stage.completed ? <CheckCircle className="w-4 h-4" /> :
                           stage.id === getCurrentStage() ? <Zap className="w-4 h-4 animate-pulse" /> :
                           <Circle className="w-4 h-4 text-slate-400" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-200 font-medium">{stage.name}</p>
                          <p className="text-[10px] text-slate-400">{formatTimestamp(stage.timestamp)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Visualization Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "overview" && (
              <div className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-slate-300 mb-2">Order Summary</h4>
                    <button
                      onClick={() => {
                        // In a real implementation, this would trigger actions like confirming the order
                        alert("Order confirmation would be triggered here");
                      }}
                      className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-xs"
                    >
                      Confirm Order
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400">Order ID</p>
                      <p className="text-lg font-bold text-slate-200">{order.id}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400">Patient</p>
                      <p className="text-lg font-bold text-slate-200">{order.patient.name}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400">Doctor</p>
                      <p className="text-lg font-bold text-slate-200">{order.doctor}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400">Status</p>
                      <p className="text-lg font-bold text-slate-200">{order.status}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400">Priority</p>
                      <p className="text-lg font-bold text-slate-200">{order.priority}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400">Pharmacy</p>
                      <p className="text-lg font-bold text-slate-200">{order.pharmacy.name}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === "medications" && (
              <div className="p-4">
                <h4 className="text-xs font-medium text-slate-300 mb-2">Medication Details</h4>
                <div className="space-y-4">
                  {order.medications.map((med: any, i: number) => (
                    <div key={i} className="p-3 rounded bg-slate-700/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Pill className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-slate-200">{med.name}</p>
                          <p className="text-[10px] text-slate-200">{med.dosage} {med.frequency}</p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-slate-200"><span className="font-medium">Route:</span> {med.route}</p>
                        <p className="text-xs text-slate-200"><span className="font-medium">Quantity:</span> {med.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "tracking" && (
              <div className="p-4">
                <h4 className="text-xs font-medium text-slate-300 mb-2">Dispatch Timeline</h4>
                <div className="h-40 border-t border-slate-600/50">
                  <div className="flex h-full">
                    {order.stages.map((stage: any, i: number) => (
                      <div key={i} className={`flex-1 flex-col items-center gap-2 relative ${stage.completed ? "bg-emerald-500/20" : stage.id === getCurrentStage() ? "bg-emerald-500/40 animate-pulse" : "bg-slate-600/20"} `}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2">
                          {stage.completed ? <CheckCircle className="w-4 h-4" /> :
                           stage.id === getCurrentStage() ? <Zap className="w-4 h-4 animate-pulse" /> :
                           <Circle className="w-4 h-4 text-slate-400" />}
                        </div>
                        <p className="text-xs text-slate-200 font-medium">{stage.name}</p>
                        <p className="text-[10px] text-slate-400">{formatTimestamp(stage.timestamp)}</p>
                        {!stage.completed && i < order.stages.length - 1 && (
                          <div className="absolute inset-0 h-px bg-emerald-500/20" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default MayinPharmacyDispatch;