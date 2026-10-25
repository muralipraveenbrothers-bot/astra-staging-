import React from "react";
import { Patient, LabOrder, PharmacyItem, RadiologyReport, DepartmentType } from "../../types";
import { CommandCenterDashboard } from "./CommandCenterDashboard";

interface TaskEngineDashboardProps {
  patients: Patient[];
  labOrders?: LabOrder[];
  inventory?: PharmacyItem[];
  radiologyReports?: RadiologyReport[];
  setActiveDept?: (dept: DepartmentType) => void;
}

export const TaskEngineDashboard: React.FC<TaskEngineDashboardProps> = ({
  patients = [],
  labOrders = [],
  inventory = [],
  radiologyReports = [],
  setActiveDept = () => {},
}) => {
  return (
    <CommandCenterDashboard
      patients={patients}
      labOrders={labOrders}
      inventory={inventory}
      radiologyReports={radiologyReports}
      setActiveDept={setActiveDept}
      initialTab="tasks"
    />
  );
};

