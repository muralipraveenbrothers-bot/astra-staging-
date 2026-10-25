import React, { useState } from "react";
import { ClinicalCommandCenter } from "@/components/ClinicalCommand/ClinicalCommandCenter";
import { SupercoreLayout } from "@/ui/command/SupercoreLayout";
import { OrderCenterModal } from "@/components/CommandCenter/OrderCenterModal";
import { PrintableSlipModal } from "@/components/PrintableSlipModal";
import {
  initialPatients,
  initialLabOrders,
  initialRadiologyReports,
  initialPrescriptions,
} from "@/data/mockData";
import { initialUniversalOrders } from "@/components/CommandCenter/mockUniversalOrders";
import { Patient, LabOrder, RadiologyReport, Prescription } from "@/types";
import { AstraUniversalOrder, OrderStatus } from "@/components/CommandCenter/universalOrderTypes";
import { toast } from "sonner";
import { Sparkles, LayoutDashboard } from "lucide-react";

export function ClinicalCommandHub() {
  const [activeTab, setActiveTab] = useState<"supercore" | "workspace">("supercore");
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [selectedPatient, setSelectedPatient] = useState<Patient>(initialPatients[0]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>(initialLabOrders);
  const [radiologyReports, setRadiologyReports] = useState<RadiologyReport[]>(initialRadiologyReports);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialPrescriptions);
  const [universalOrders, setUniversalOrders] = useState<AstraUniversalOrder[]>(initialUniversalOrders);

  // Modals state
  const [isOrderCenterOpen, setIsOrderCenterOpen] = useState(false);
  const [printModalState, setPrintModalState] = useState<{
    isOpen: boolean;
    type: any;
    data: any;
  }>({
    isOpen: false,
    type: "op_slip",
    data: initialPatients[0],
  });

  const handleAddLabOrder = (order: LabOrder) => {
    setLabOrders((prev) => [order, ...prev]);
    toast.success(`Lab Order "${order.testName}" placed successfully for ${order.patientName}`);
  };

  const handleAddPrescription = (rx: Prescription) => {
    setPrescriptions((prev) => [rx, ...prev]);
    toast.success(`Prescription generated with ${rx.medicines.length} medications for ${rx.patientName}`);
  };

  const handleUpdatePatientDx = (uhid: string, dx: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.uhid === uhid ? { ...p, diagnosis: dx, chiefComplaints: dx } : p))
    );
    toast.success("Patient diagnosis updated successfully");
  };

  const handleConfirmUniversalOrder = (draft: any) => {
    const newOrder: AstraUniversalOrder = {
      orderId: `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patientUhid: draft.patientUhid || selectedPatient.uhid,
      patientName: draft.patientName || selectedPatient.name,
      bedNumber: draft.bedNumber || selectedPatient.bedNumber || "OPD Desk",
      orderType: draft.orderType || "LABORATORY",
      itemSummary: draft.orderDescription || draft.itemSummary || "Clinical Order",
      category: draft.orderCategory || "General",
      priority: draft.priority || "ROUTINE",
      destinationDept: draft.targetDepartment || "Laboratory Workstation",
      orderingDoctor: "Dr. Murali Praveen, M.D.",
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "SENT",
      closedLoopProgress: 25,
      timelineEvents: [
        {
          id: `t-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          event: "Order created via Astra AI Co-Pilot command",
          actor: "Dr. Murali Praveen",
          dept: "Doctor Console",
        },
      ],
    };
    setUniversalOrders((prev) => [newOrder, ...prev]);
    toast.success(`Universal Order ${newOrder.orderId} dispatched to ${newOrder.destinationDept}`);
    return newOrder;
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus, resultNote?: string) => {
    setUniversalOrders((prev) =>
      prev.map((o) =>
        o.orderId === orderId
          ? {
              ...o,
              status: newStatus,
              resultSummary: resultNote || o.resultSummary,
              closedLoopProgress: newStatus === "COMPLETED" ? 100 : o.closedLoopProgress,
            }
          : o
      )
    );
    toast.success(`Order ${orderId} updated to ${newStatus}`);
  };

  const handleOpenPrintModal = (type: any, data: any) => {
    setPrintModalState({
      isOpen: true,
      type,
      data,
    });
  };

  return (
    <div className="relative min-h-[calc(100vh-100px)] flex flex-col bg-slate-950 text-slate-100 pb-10">
      {/* Top Clinical Mode Switcher Banner */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("supercore")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === "supercore"
                ? "bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>⚡ ASTRA Supercore AI (7 Intelligence Modes)</span>
          </button>

          <button
            onClick={() => setActiveTab("workspace")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === "workspace"
                ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-blue-500/20"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>🏥 Ward & Orders Workspace</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-400 font-mono hidden md:flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Susruta Brain Active · 160 Agents Online</span>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 flex flex-col">
        {activeTab === "supercore" ? (
          <div className="flex-1 min-h-[750px]">
            <SupercoreLayout />
          </div>
        ) : (
          <div className="bg-slate-50 text-slate-900 min-h-full">
            <ClinicalCommandCenter
              patients={patients}
              selectedPatient={selectedPatient}
              onSelectPatient={setSelectedPatient}
              labOrders={labOrders}
              radiologyReports={radiologyReports}
              prescriptions={prescriptions}
              universalOrders={universalOrders}
              onAddLabOrder={handleAddLabOrder}
              onAddPrescription={handleAddPrescription}
              onUpdatePatientDx={handleUpdatePatientDx}
              onConfirmUniversalOrder={handleConfirmUniversalOrder}
              onOpenOrderCenter={() => setIsOrderCenterOpen(true)}
              onOpenPrintModal={handleOpenPrintModal}
            />
          </div>
        )}
      </div>

      {/* Universal Order Center Modal */}
      {isOrderCenterOpen && (
        <OrderCenterModal
          isOpen={isOrderCenterOpen}
          onClose={() => setIsOrderCenterOpen(false)}
          orders={universalOrders}
          onUpdateOrderStatus={handleUpdateOrderStatus}
        />
      )}

      {/* Printable Slip & Document Modal */}
      {printModalState.isOpen && (
        <PrintableSlipModal
          isOpen={printModalState.isOpen}
          onClose={() => setPrintModalState((prev) => ({ ...prev, isOpen: false }))}
          documentType={printModalState.type}
          data={printModalState.data}
        />
      )}

      {/* JARVIS AI Copilot is now mounted globally in Layout.tsx (every dashboard).
          The clinical patient/order context is injected via PatientContext/store. */}
    </div>
  );
}
