import React, { useState } from "react";
import { Patient, LabOrder, Prescription, PrescribedMedicine } from "../../types";
import { AstraUniversalOrder } from "../CommandCenter/universalOrderTypes";
import {
  FileText,
  Microscope,
  Pill,
  Stethoscope,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  Zap,
  Filter,
  AlertTriangle,
  X,
  ChevronRight,
  Send,
} from "lucide-react";

interface DoctorOrdersHubProps {
  patients: Patient[];
  selectedPatient: Patient | null;
  onSelectPatient: (patient: Patient) => void;
  labOrders: LabOrder[];
  prescriptions: Prescription[];
  universalOrders?: AstraUniversalOrder[];
  onAddLabOrder?: (order: LabOrder) => void;
  onAddPrescription?: (rx: Prescription) => void;
  onConfirmUniversalOrder?: (draft: any) => any;
  onOpenOrderCenter?: () => void;
  onOpenPrintModal?: (type: any, data: any) => void;
}

export const DoctorOrdersHub: React.FC<DoctorOrdersHubProps> = ({
  patients,
  selectedPatient,
  onSelectPatient,
  labOrders,
  prescriptions,
  universalOrders = [],
  onAddLabOrder,
  onAddPrescription,
  onConfirmUniversalOrder,
  onOpenOrderCenter,
  onOpenPrintModal,
}) => {
  const [activeTab, setActiveTab] = useState<"ALL_ORDERS" | "LABS" | "PRESCRIPTIONS" | "CREATE_ORDER">("ALL_ORDERS");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Order Form State
  const [orderPatientUhid, setOrderPatientUhid] = useState<string>(selectedPatient?.uhid || patients[0]?.uhid || "");
  const [orderType, setOrderType] = useState<"LAB" | "PRESCRIPTION" | "NURSING">("LAB");

  // Lab Order Form Inputs
  const [testName, setTestName] = useState("Complete Blood Count (CBC)");
  const [testCategory, setTestCategory] = useState<"Hematology" | "Biochemistry" | "Radiology" | "Microbiology">("Hematology");

  // Prescription Form Inputs
  const [brandName, setBrandName] = useState("Augmentin 625mg");
  const [genericName, setGenericName] = useState("Amoxicillin + Clavulanate 625mg");
  const [dose, setDose] = useState("1 Tablet");
  const [frequency, setFrequency] = useState("1-0-1 (BD after meals)");
  const [duration, setDuration] = useState("5 Days");
  const [count, setCount] = useState(10);
  const [unitPrice, setUnitPrice] = useState(22);

  // Nursing Order Inputs
  const [nursingInstruction, setNursingInstruction] = useState("Monitor vital signs every 2 hours and check SpO2 continuous");

  const targetPatient = patients.find((p) => p.uhid === orderPatientUhid) || selectedPatient || patients[0];

  const handleCreateLabOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddLabOrder || !targetPatient) return;

    const newLab: LabOrder = {
      id: `lab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      patientName: targetPatient.name,
      patientUhid: targetPatient.uhid,
      patientAge: targetPatient.age,
      patientGender: targetPatient.gender,
      testName,
      category: testCategory,
      status: "Ordered",
      orderedBy: "Dr. Murali Praveen",
      orderedAt: new Date().toISOString(),
    };

    onAddLabOrder(newLab);
    alert(`Lab order "${testName}" kept on this Orders Hub screen only for ${targetPatient.name}. Not sent to the lab worklist.`);
    setActiveTab("LABS");
  };

  const handleCreatePrescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddPrescription || !targetPatient) return;

    const med: PrescribedMedicine = {
      brandName,
      genericName,
      dose,
      frequency,
      duration,
      count,
      unitPrice,
      stockAvailable: 100,
    };

    const newRx: Prescription = {
      id: `rx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      patientName: targetPatient.name,
      patientUhid: targetPatient.uhid,
      medicines: [med],
      doctorName: "Dr. Murali Praveen",
      whoProtocolRef: "WHO Essential Medicines 2025",
      evidenceCitation: "Standard Adult Antibiotic Dosing Guidelines",
      status: "Prescribed",
      prescribedAt: new Date().toISOString(),
      totalAmount: count * unitPrice,
    };

    onAddPrescription(newRx);
    alert(`Prescription "${brandName}" kept on this screen only for ${targetPatient.name}. Not sent to pharmacy.`);
    setActiveTab("PRESCRIPTIONS");
  };

  const handleCreateNursingOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onConfirmUniversalOrder || !targetPatient) return;

    onConfirmUniversalOrder({
      commandText: nursingInstruction,
      intent: "GENERIC_NOTE",
      patientName: targetPatient.name,
      uhid: targetPatient.uhid,
      urgency: "URGENT",
    });

    alert(`Nursing instruction kept on this screen only for ${targetPatient.name}. Not sent to the ward.`);
    setActiveTab("ALL_ORDERS");
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-bold uppercase">
              Hospital Doctor Orders Hub
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
              Demo list · not EMR sync
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1 flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-indigo-400" />
            Universal Doctor Orders, Investigations & Prescriptions
          </h2>
          <p className="text-xs text-slate-300">
            View all hospital doctor orders, create new lab orders, prescribe medications, and execute nursing instructions
          </p>
        </div>

        <button
          onClick={() => setActiveTab("CREATE_ORDER")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Place New Doctor Order
        </button>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 text-xs font-mono font-bold overflow-x-auto">
        <button
          onClick={() => setActiveTab("ALL_ORDERS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "ALL_ORDERS"
              ? "bg-slate-900 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" /> All Active Orders ({labOrders.length + prescriptions.length})
        </button>

        <button
          onClick={() => setActiveTab("LABS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "LABS"
              ? "bg-slate-900 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Microscope className="w-4 h-4" /> Laboratory & Radiology ({labOrders.length})
        </button>

        <button
          onClick={() => setActiveTab("PRESCRIPTIONS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "PRESCRIPTIONS"
              ? "bg-slate-900 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Pill className="w-4 h-4" /> Prescriptions & Meds ({prescriptions.length})
        </button>

        <button
          onClick={() => setActiveTab("CREATE_ORDER")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "CREATE_ORDER"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Plus className="w-4 h-4" /> Create New Order
        </button>
      </div>

      {/* Dynamic Tab Body */}
      {activeTab === "CREATE_ORDER" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">New Doctor Order Entry Form</h3>
              <p className="text-xs text-slate-500">
                Select target patient and place laboratory, medication, or nursing orders instantly
              </p>
            </div>

            {/* Target Patient Selector */}
            <div className="flex items-center gap-2 font-mono text-xs bg-slate-100 p-2 rounded-xl border border-slate-200">
              <span className="font-bold text-slate-700">Patient:</span>
              <select
                value={orderPatientUhid}
                onChange={(e) => setOrderPatientUhid(e.target.value)}
                className="bg-white text-slate-900 font-bold px-3 py-1 rounded border border-slate-300 outline-none cursor-pointer"
              >
                {patients.map((p) => (
                  <option key={p.uhid} value={p.uhid}>
                    {p.name} ({p.uhid} • Bed: {p.bedNumber || "OPD"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Order Sub-Type Picker */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setOrderType("LAB")}
              className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
                orderType === "LAB" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              🧪 Lab / Investigation
            </button>
            <button
              onClick={() => setOrderType("PRESCRIPTION")}
              className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
                orderType === "PRESCRIPTION" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              💊 Medication / Prescription
            </button>
            <button
              onClick={() => setOrderType("NURSING")}
              className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
                orderType === "NURSING" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              🩺 Nursing & Ward Instruction
            </button>
          </div>

          {/* Forms */}
          {orderType === "LAB" && (
            <form onSubmit={handleCreateLabOrder} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-700 mb-1">
                  Investigation / Test Name
                </label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value as any)}
                  className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                >
                  <option value="Hematology">Hematology</option>
                  <option value="Biochemistry">Biochemistry</option>
                  <option value="Radiology">Radiology</option>
                  <option value="Microbiology">Microbiology</option>
                </select>
              </div>

              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
              >
                <Zap className="w-4 h-4" /> Place Lab Order
              </button>
            </form>
          )}

          {orderType === "PRESCRIPTION" && (
            <form onSubmit={handleCreatePrescription} className="space-y-4 max-w-xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 mb-1">Generic Name</label>
                  <input
                    type="text"
                    value={genericName}
                    onChange={(e) => setGenericName(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 mb-1">Dose</label>
                  <input
                    type="text"
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 mb-1">Frequency</label>
                  <input
                    type="text"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono font-bold text-slate-700 mb-1">Duration</label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
              >
                <Pill className="w-4 h-4" /> Add Medication Order
              </button>
            </form>
          )}

          {orderType === "NURSING" && (
            <form onSubmit={handleCreateNursingOrder} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-700 mb-1">
                  Nursing Instruction / Ward Order
                </label>
                <textarea
                  rows={3}
                  value={nursingInstruction}
                  onChange={(e) => setNursingInstruction(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  required
                />
              </div>

              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-xs font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Issue Nursing Instruction
              </button>
            </form>
          )}
        </div>
      )}

      {/* All Orders List */}
      {activeTab !== "CREATE_ORDER" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lab Orders Box */}
            {(activeTab === "ALL_ORDERS" || activeTab === "LABS") && (
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 font-mono">
                    <Microscope className="w-4 h-4 text-indigo-600" /> Active Lab Investigations ({labOrders.length})
                  </h3>
                </div>

                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {labOrders.map((lab) => (
                    <div
                      key={lab.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{lab.testName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Patient: {lab.patientName} ({lab.patientUhid || lab.uhid})
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          lab.status === "Completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {lab.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prescriptions Box */}
            {(activeTab === "ALL_ORDERS" || activeTab === "PRESCRIPTIONS") && (
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 font-mono">
                    <Pill className="w-4 h-4 text-emerald-600" /> Active Prescriptions & Medications ({prescriptions.length})
                  </h3>
                </div>

                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{rx.patientName} ({rx.patientUhid || rx.uhid})</span>
                        <button
                          onClick={() => onOpenPrintModal && onOpenPrintModal("prescription", rx)}
                          className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono font-bold hover:bg-slate-300 cursor-pointer"
                        >
                          Print Rx
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-700 font-mono">
                        {rx.medicines.map((m: PrescribedMedicine) => m.brandName).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
