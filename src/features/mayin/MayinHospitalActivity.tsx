import { useState } from "react";
import { Activity, Users, Hospital, Pill, FlaskConical, X, AlertTriangle, Microscope, Stethoscope, FileSearch, List, ListStart, ListEnd, Check, AlertOctagon, DoorOpen, Bed, Calendar, Clock, FileText, UserPlus, UserMinus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinHospitalActivityProps {
  hospitalData: any;
  onVisualizationRequest: (type: string) => void;
}

export function MayinHospitalActivity({
  hospitalData,
  onVisualizationRequest,
}: MayinHospitalActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Extract hospital activity data
  const activityData = {
    reception: hospitalData?.reception || [],
    opd: hospitalData?.opd || [],
    ip: hospitalData?.ip || [],
    lab: hospitalData?.lab || [],
    radiology: hospitalData?.radiology || [],
    pharmacy: hospitalData?.pharmacy || [],
    ward: hospitalData?.ward || [],
    icu: hospitalData?.icu || [],
    ot: hospitalData?.ot || [],
    billing: hospitalData?.billing || [],
    discharge: hospitalData?.discharge || [],
    cmrf: hospitalData?.cmrf || [],
  };

  // Render content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-700/30 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-1">
                  <UserPlus className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Admissions</span>
                </div>
                <p className="text-lg font-bold text-slate-200">{hospitalData?.admissions || 0}</p>
              </div>
              <div className="bg-slate-700/30 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-1">
                  <UserMinus className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Discharges</span>
                </div>
                <p className="text-lg font-bold text-slate-200">{hospitalData?.discharges || 0}</p>
              </div>
              <div className="bg-slate-700/30 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Bed className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Occupancy</span>
                </div>
                <p className="text-lg font-bold text-slate-200">{hospitalData?.bedOccupancy || "-"}</p>
              </div>
              <div className="bg-slate-700/30 rounded-lg p-2">
                <div className="flex items-center gap-1 mb-1">
                  <AlertOctagon className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-400">Alerts</span>
                </div>
                <p className="text-lg font-bold text-slate-200">{hospitalData?.alerts || 0}</p>
              </div>
            </div>
            <div className="mt-3">
              <h4 className="text-xs font-medium text-slate-300 mb-2">Recent Activity</h4>
              <div className="space-y-2">
                {hospitalData?.recentActivity?.map((activity: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      {activity.type === "admission" ? <UserPlus className="w-4 h-4" /> :
                       activity.type === "discharge" ? <UserMinus className="w-4 h-4" /> :
                       activity.type === "lab" ? <Microscope className="w-4 h-4" /> :
                       activity.type === "radiology" ? <FileText className="w-4 h-4" /> :
                       activity.type === "pharmacy" ? <Pill className="w-4 h-4" /> :
                       <Activity className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-200">{activity.description}</p>
                      <p className="text-[10px] text-slate-400">{activity.time}</p>
                    </div>
                  </div>
                )) || (
                  <p className="text-xs text-slate-400">No recent activity</p>
                )}
              </div>
            </div>
          </div>
        );
      case "reception":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Reception</h4>
            {activityData.reception.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.reception.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No reception activity</p>
            )}
          </div>
        );
      case "opd":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">OPD</h4>
            {activityData.opd.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.opd.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No OPD activity</p>
            )}
          </div>
        );
      case "ip":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">IP</h4>
            {activityData.ip.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.ip.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No IP activity</p>
            )}
          </div>
        );
      case "lab":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Lab</h4>
            {activityData.lab.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.lab.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No lab activity</p>
            )}
          </div>
        );
      case "radiology":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Radiology</h4>
            {activityData.radiology.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.radiology.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No radiology activity</p>
            )}
          </div>
        );
      case "pharmacy":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Pharmacy</h4>
            {activityData.pharmacy.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.pharmacy.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No pharmacy activity</p>
            )}
          </div>
        );
      case "ward":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Ward</h4>
            {activityData.ward.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.ward.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No ward activity</p>
            )}
          </div>
        );
      case "icu":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">ICU</h4>
            {activityData.icu.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.icu.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No ICU activity</p>
            )}
          </div>
        );
      case "ot":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">OT</h4>
            {activityData.ot.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.ot.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No OT activity</p>
            )}
          </div>
        );
      case "billing":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Billing</h4>
            {activityData.billing.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.billing.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No billing activity</p>
            )}
          </div>
        );
      case "discharge":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">Discharge</h4>
            {activityData.discharge.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.discharge.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No discharge activity</p>
            )}
          </div>
        );
      case "cmrf":
        return (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-slate-300">CMRF</h4>
            {activityData.cmrf.length > 0 ? (
              <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                {activityData.cmrf.map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No CMRF activity</p>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`w-80 bg-slate-800/30 p-4 flex flex-col transition-all duration-300 ${expanded ? "max-w-[400px]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Hospital className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Hospital Activity</h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-slate-700/50"
        >
          {expanded ? <X className="w-4 h-4" /> : <FileSearch className="w-4 h-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {[
          { id: "overview", label: "Overview", icon: <Activity className="w-3 h-3" /> },
          { id: "reception", label: "Reception", icon: <DoorOpen className="w-3 h-3" /> },
          { id: "opd", label: "OPD", icon: <Users className="w-3 h-3" /> },
          { id: "ip", label: "IP", icon: <Bed className="w-3 h-3" /> },
          { id: "lab", label: "Lab", icon: <Microscope className="w-3 h-3" /> },
          { id: "radiology", label: "Radiology", icon: <FileText className="w-3 h-3" /> },
          { id: "pharmacy", label: "Pharmacy", icon: <Pill className="w-3 h-3" /> },
          { id: "ward", label: "Ward", icon: <Bed className="w-3 h-3" /> },
          { id: "icu", label: "ICU", icon: <AlertOctagon className="w-3 h-3" /> },
          { id: "ot", label: "OT", icon: <FlaskConical className="w-3 h-3" /> },
          { id: "billing", label: "Billing", icon: <Calendar className="w-3 h-3" /> },
          { id: "discharge", label: "Discharge", icon: <UserMinus className="w-3 h-3" /> },
          { id: "cmrf", label: "CMRF", icon: <FileText className="w-3 h-3" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs ${activeTab === tab.id ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  );
}

export default MayinHospitalActivity;