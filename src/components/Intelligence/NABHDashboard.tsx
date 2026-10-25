import React from "react";
import { InsuranceDashboard } from "./InsuranceDashboard";
import { Patient } from "../../types";

interface NABHDashboardProps {
  patients?: Patient[];
  onOpenPrintModal?: (type: any, data: any) => void;
}

export const NABHDashboard: React.FC<NABHDashboardProps> = ({ patients = [], onOpenPrintModal }) => {
  return <InsuranceDashboard patients={patients} initialTab="nabh" onOpenPrintModal={onOpenPrintModal} />;
};
