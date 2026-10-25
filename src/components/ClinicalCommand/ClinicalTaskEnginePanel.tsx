import React, { useState } from "react";
import { ClinicalTask, clinicalTaskEngine } from "../../services/clinicalTaskEngine";
import { CheckSquare, Clock, CheckCircle2, AlertCircle, Plus, Filter, User } from "lucide-react";
import { auditLogger } from "../../services/auditLogger";

interface ClinicalTaskEnginePanelProps {
  tasks: ClinicalTask[];
  onTaskUpdated?: () => void;
}

export const ClinicalTaskEnginePanel: React.FC<ClinicalTaskEnginePanelProps> = ({
  tasks,
  onTaskUpdated,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [showNewTaskModal, setShowNewTaskModal] = useState<boolean>(false);

  const [newTaskName, setNewTaskName] = useState<string>("");
  const [newTaskUhid, setNewTaskUhid] = useState<string>("UHID-2026-8801");
  const [newTaskDept, setNewTaskDept] = useState<string>("ICU");
  const [newTaskPriority, setNewTaskPriority] = useState<ClinicalTask["priority"]>("HIGH");

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === "ALL") return true;
    return t.status === filterStatus;
  });

  const handleUpdateStatus = (id: string, newStatus: ClinicalTask["status"]) => {
    clinicalTaskEngine.updateTaskStatus(id, newStatus, "Dr. Murali Praveen");
    if (onTaskUpdated) onTaskUpdated();

    auditLogger.log({
      action: newStatus === "COMPLETED" ? "TASK_COMPLETED" : "TASK_ASSIGNED",
      performedBy: "Dr. Murali Praveen",
      userRole: "Attending Consultant",
      details: `Updated task ${id} status to ${newStatus}`,
      sourceModule: "clinical_tasks",
    });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    clinicalTaskEngine.createTask({
      patientUhid: newTaskUhid,
      patientName: "Rajesh Kumar",
      department: newTaskDept,
      taskType: "DOCTOR_ORDER",
      taskName: newTaskName,
      priority: newTaskPriority,
      assignedTo: "Duty Doctor",
      assignedRole: "Resident Doctor",
      status: "ASSIGNED",
      sourceModule: "doctor_order",
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    setNewTaskName("");
    setShowNewTaskModal(false);
    if (onTaskUpdated) onTaskUpdated();
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>CLOSED-LOOP CLINICAL TASK QUEUE</span>
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {tasks.length} Total Tasks
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Closed-loop task tracking, SLA monitoring & automatic deduplication
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNewTaskModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Clinical Task</span>
        </button>
      </div>

      {/* Task Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
        {["ALL", "PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "ESCALATED"].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer border ${
              filterStatus === st
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Task Cards List */}
      <div className="space-y-3">
        {filteredTasks.map((tsk) => (
          <div key={tsk.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                    tsk.priority === "CRITICAL"
                      ? "bg-rose-600 text-white animate-pulse"
                      : tsk.priority === "HIGH"
                      ? "bg-amber-600 text-white"
                      : "bg-slate-700 text-white"
                  }`}
                >
                  {tsk.priority}
                </span>
                <span className="font-bold text-slate-900 text-sm">{tsk.taskName}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{tsk.id}</span>
            </div>

            <div className="text-slate-600 flex items-center justify-between font-mono text-[11px]">
              <span>Patient: <strong className="text-slate-900">{tsk.patientName}</strong> ({tsk.patientUhid})</span>
              <span>Department: <strong className="text-indigo-700">{tsk.department}</strong></span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-mono">
              <span className="text-slate-500">
                Assigned: <strong className="text-slate-800">{tsk.assignedTo}</strong> ({tsk.assignedRole})
              </span>

              <div className="flex items-center gap-2">
                <select
                  value={tsk.status}
                  onChange={(e) => handleUpdateStatus(tsk.id, e.target.value as any)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="ESCALATED">ESCALATED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base">Create New Clinical Task</h3>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Task Title / Order</label>
                <input
                  type="text"
                  required
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="e.g., Order ABG in 2 hours..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Department</label>
                  <input
                    type="text"
                    value={newTaskDept}
                    onChange={(e) => setNewTaskDept(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
