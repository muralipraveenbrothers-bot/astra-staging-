import { useState, useEffect } from "react";
import { X, Microscope, AlertTriangle, ArrowUp, ArrowDown, Check, XCircle, Minus, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinLabVisualizerProps {
  onClose: () => void;
  labData: any;
}

export function MayinLabVisualizer({
  onClose,
  labData,
}: MayinLabVisualizerProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Extract lab data or use placeholder if none provided
  const labResults = labData?.results || [
    {
      test: "Hemoglobin",
      shortName: "Hb",
      value: 11,
      unit: "g/dL",
      referenceLow: 13,
      referenceHigh: 17,
      previousValue: 12.4,
      trend: "down",
      abnormal: true,
    },
    {
      test: "WBC",
      shortName: "WBC",
      value: 15400,
      unit: "/µL",
      referenceLow: 4000,
      referenceHigh: 11000,
      previousValue: 14200,
      trend: "up",
      abnormal: true,
    },
    {
      test: "Platelets",
      shortName: "PLT",
      value: 2.4,
      unit: "×10³/µL",
      referenceLow: 150,
      referenceHigh: 450,
      previousValue: 2.8,
      trend: "down",
      abnormal: true,
    },
    {
      test: "Creatinine",
      shortName: "Cr",
      value: 2.4,
      unit: "mg/dL",
      referenceLow: 0.6,
      referenceHigh: 1.2,
      previousValue: 1.7,
      trend: "up",
      abnormal: true,
    },
  ];

  // Determine if any tests are abnormal
  const hasAbnormalTests = labResults.some((test: any) => test.abnormal);

  // Calculate summary statistics
  const summaryStats = {
    totalTests: labResults.length,
    abnormalTests: labResults.filter((t: any) => t.abnormal).length,
    normalTests: labResults.filter((t: any) => !t.abnormal).length,
  };

  // Get trend icon
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <ArrowUp className="w-3 h-3 text-red-400" />;
      case "down":
        return <ArrowDown className="w-3 h-3 text-emerald-400" />;
      case "stable":
        return <Minus className="w-3 h-3 text-slate-400" />;
      default:
        return null;
    }
  };

  // Get status icon
  const getStatusIcon = (abnormal: boolean) => {
    return abnormal ? (
      <AlertTriangle className="w-4 h-4 text-amber-400" />
    ) : (
      <Check className="w-4 h-4 text-emerald-400" />
    );
  };

  // Handle test selection
  const handleTestSelect = (testName: string) => {
    setSelectedTest(selectedTest === testName ? null : testName);
  };

  // Handle zoom
  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    if (direction === 'in') {
      setZoomLevel(prev => Math.min(prev + 0.2, 2));
    } else if (direction === 'out') {
      setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
    } else {
      setZoomLevel(1);
      setRotation(0);
    }
  };

  // Handle rotation
  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 ${expanded ? "" : "pointer-events-none"}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className={`bg-slate-900 rounded-xl shadow-2xl shadow-emerald-500/20 overflow-hidden ${expanded ? "w-[90vw] h-[90vh]" : "w-[400px] h-[500px]"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Microscope className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-medium text-slate-200">Lab Results Visualizer</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasAbnormalTests && (
              <div className="flex items-center gap-1 bg-amber-500/20 px-2 py-1 rounded text-xs">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="font-medium">{summaryStats.abnormalTests} Abnormal</span>
              </div>
            )}
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
          {/* Test List */}
          <div className={`bg-slate-800/30 border-r border-white/5 p-4 overflow-y-auto ${expanded ? "w-64" : "w-48"}`}>
            <h4 className="text-xs font-medium text-slate-300 mb-3">Tests</h4>
            <div className="space-y-2">
              {labResults.map((test: any) => (
                <button
                  key={test.test}
                  onClick={() => handleTestSelect(test.test)}
                  className={`w-full text-left p-2 rounded flex items-center gap-2 ${selectedTest === test.test ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
                >
                  {getStatusIcon(test.abnormal)}
                  <span className="text-xs text-slate-200">{test.test}</span>
                  {getTrendIcon(test.trend)}
                </button>
              ))}
            </div>
          </div>

          {/* Visualization Area */}
          <div className="flex-1 p-4 overflow-hidden">
            {selectedTest ? (
              <div className="h-full flex flex-col">
                {/* Test Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  className="bg-slate-800/30 rounded-lg p-4 mb-4 flex-1 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(labResults.find((t: any) => t.test === selectedTest)?.abnormal)}
                      <h4 className="text-sm font-medium text-slate-200">{selectedTest}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRotate}
                        className="p-1 rounded hover:bg-slate-700/50"
                        title="Rotate"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleZoom('out')}
                        className="p-1 rounded hover:bg-slate-700/50"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleZoom('in')}
                        className="p-1 rounded hover:bg-slate-700/50"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleZoom('reset')}
                        className="p-1 rounded hover:bg-slate-700/50"
                        title="Reset View"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Test Value Visualization */}
                  <div className="flex-1 flex items-center justify-center">
                    <motion.div
                      className="relative w-48 h-48 rounded-full bg-slate-700/30 flex items-center justify-center"
                      style={{ transform: `scale(${zoomLevel}) rotate(${rotation}deg)` }}
                    >
                      {/* Reference Range */}
                      <div className="absolute w-full h-full rounded-full border-2 border-emerald-400/30"></div>

                      {/* Current Value */}
                      <div
                        className={`absolute w-2 h-2 rounded-full ${labResults.find((t: any) => t.test === selectedTest)?.abnormal ? "bg-amber-400" : "bg-emerald-400"}`}
                        style={{ transform: `rotate(${rotation}deg) translateY(-70%)` }}
                      ></div>

                      {/* Reference Low */}
                      <div
                        className="absolute w-1 h-1 rounded-full bg-emerald-400/50"
                        style={{ transform: `rotate(${rotation}deg) translateY(-50%)` }}
                      ></div>

                      {/* Reference High */}
                      <div
                        className="absolute w-1 h-1 rounded-full bg-emerald-400/50"
                        style={{ transform: `rotate(${rotation}deg) translateY(-90%)` }}
                      ></div>

                      {/* Current Value Label */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full">
                        <div className={`px-2 py-1 rounded text-xs ${labResults.find((t: any) => t.test === selectedTest)?.abnormal ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                          {labResults.find((t: any) => t.test === selectedTest)?.value} {labResults.find((t: any) => t.test === selectedTest)?.unit}
                        </div>
                      </div>

                      {/* Reference Range Labels */}
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
                        <div className="flex gap-2">
                          <div className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-200">
                            {labResults.find((t: any) => t.test === selectedTest)?.referenceLow} {labResults.find((t: any) => t.test === selectedTest)?.unit}
                          </div>
                          <div className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-200">
                            {labResults.find((t: any) => t.test === selectedTest)?.referenceHigh} {labResults.find((t: any) => t.test === selectedTest)?.unit}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Test Details */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="bg-slate-700/30 rounded p-2">
                      <p className="text-[10px] text-slate-400">Previous Value</p>
                      <p className="text-xs text-slate-200">{labResults.find((t: any) => t.test === selectedTest)?.previousValue} {labResults.find((t: any) => t.test === selectedTest)?.unit}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded p-2">
                      <p className="text-[10px] text-slate-400">Trend</p>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(labResults.find((t: any) => t.test === selectedTest)?.trend)}
                        <p className="text-xs text-slate-200 capitalize">{labResults.find((t: any) => t.test === selectedTest)?.trend}</p>
                      </div>
                    </div>
                    <div className="bg-slate-700/30 rounded p-2 col-span-2">
                      <p className="text-[10px] text-slate-400">Reference Range</p>
                      <p className="text-xs text-slate-200">
                        {labResults.find((t: any) => t.test === selectedTest)?.referenceLow} - {labResults.find((t: any) => t.test === selectedTest)?.referenceHigh} {labResults.find((t: any) => t.test === selectedTest)?.unit}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Interpretation */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", damping: 20, stiffness: 300, delay: 0.1 }}
                  className="bg-slate-800/30 rounded-lg p-4"
                >
                  <h4 className="text-xs font-medium text-slate-300 mb-2">Interpretation</h4>
                  <p className="text-xs text-slate-200">
                    {labResults.find((t: any) => t.test === selectedTest)?.value} {labResults.find((t: any) => t.test === selectedTest)?.unit} is {labResults.find((t: any) => t.test === selectedTest)?.abnormal ? "abnormal" : "normal"}.
                    The reference range for {selectedTest} is {labResults.find((t: any) => t.test === selectedTest)?.referenceLow} to {labResults.find((t: any) => t.test === selectedTest)?.referenceHigh} {labResults.find((t: any) => t.test === selectedTest)?.unit}.
                    The previous value was {labResults.find((t: any) => t.test === selectedTest)?.previousValue} {labResults.find((t: any) => t.test === selectedTest)?.unit}, showing a {labResults.find((t: any) => t.test === selectedTest)?.trend} trend.
                  </p>
                </motion.div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center">
                <Microscope className="w-12 h-12 text-slate-500/30 mb-4" />
                <p className="text-sm text-slate-400 mb-2">Select a test to visualize</p>
                <p className="text-xs text-slate-500">Click on any test in the left panel</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default MayinLabVisualizer;