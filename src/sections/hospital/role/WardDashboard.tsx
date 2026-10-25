import React from "react";
import { WardDashboard as FullWardDashboard } from "@/components/Ward/WardDashboard";
import { WardSafetyBoard } from "@/components/Ward/WardSafetyBoard";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { initialPatients } from "@/data/mockData";
import { hospitalAudio } from "@/utils/audioAlerts";
import { toast } from "sonner";

export function WardDashboard() {
  const handleTriggerEmergencyAlarm = (uhid: string) => {
    hospitalAudio.playEmergencyAlarm();
    toast.error(`CODE BLUE ALARM SOUNDED FOR ${uhid || "BED"}. Nobody was notified.`, {
      duration: 8000,
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <div className="px-4 pt-4">
        <OrderStatusChip patientUhid={initialPatients[0]?.uhid} role="ward" />
      </div>
      <div className="px-4 pt-4 max-w-7xl mx-auto">
        <WardSafetyBoard />
      </div>
      <FullWardDashboard
        patients={initialPatients}
        onTriggerEmergencyAlarm={handleTriggerEmergencyAlarm}
      />
    </div>
  );
}
