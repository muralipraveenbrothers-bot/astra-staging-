import { useState, useEffect, useRef } from "react";
import { X, FileText, AlertTriangle, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, ChevronLeft, ChevronRight, Search, Printer, Share2, Download, LayoutDashboard, Image, File, FileSpreadsheet, FileCode, FileAudio, FileVideo, FileArchive, FileText as FileIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinReportVisualizerProps {
  onClose: () => void;
  reportData: any;
}

export function MayinReportVisualizer({
  onClose,
  reportData,
}: MayinReportVisualizerProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [showToolbar, setShowToolbar] = useState(true);
  const [activeTab, setActiveTab] = useState("report");
  const reportContainerRef = useRef<HTMLDivElement>(null);

  // Extract report data or use placeholder if none provided
  const report = reportData || {
    title: "Chest X-Ray",
    modality: "X-Ray",
    date: "2023-11-15",
    doctor: "Dr. Arjun",
    patient: {
      name: "Ravi Kumar",
      uhid: "UHID12345",
      age: 45,
      gender: "Male",
    },
    findings: [
      "Normal cardiothoracic ratio",
      "Clear lung fields",
      "No focal consolidation or effusion",
    ],
    impression: "Normal chest radiograph",
    pages: [
      {
        type: "image",
        url: "/images/chest-xray-page1.jpg",
        description: "Chest X-Ray - PA View",
      },
      {
        type: "image",
        url: "/images/chest-xray-page2.jpg",
        description: "Chest X-Ray - Lateral View",
      },
    ],
    attachments: [
      {
        name: "Report.pdf",
        type: "pdf",
        size: "245 KB",
      },
      {
        name: "Findings.csv",
        type: "csv",
        size: "42 KB",
      },
    ],
  };

  // Get file icon based on type
  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return <FileText className="w-4 h-4" />;
      case "csv":
        return <FileSpreadsheet className="w-4 h-4" />;
      case "xls":
      case "xlsx":
        return <FileSpreadsheet className="w-4 h-4" />;
      case "doc":
      case "docx":
        return <FileText className="w-4 h-4" />;
      case "txt":
        return <FileText className="w-4 h-4" />;
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
        return <Image className="w-4 h-4" />;
      case "mp3":
      case "wav":
      case "ogg":
        return <FileAudio className="w-4 h-4" />;
      case "mp4":
      case "avi":
      case "mov":
        return <FileVideo className="w-4 h-4" />;
      case "zip":
      case "rar":
        return <FileArchive className="w-4 h-4" />;
      default:
        return <FileIcon className="w-4 h-4" />;
    }
  };

  // Handle page navigation
  const handlePageChange = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    } else if (direction === 'next' && currentPage < report.pages.length) {
      setCurrentPage(prev => prev + 1);
    }
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

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Handle download
  const handleDownload = (attachment: any) => {
    // In a real implementation, this would download the file
    console.log(`Downloading ${attachment.name}`);
  };

  // Handle share
  const handleShare = () => {
    // In a real implementation, this would open a share dialog
    console.log("Sharing report");
  };

  // Handle fullscreen
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      reportContainerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
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
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-medium text-slate-200">{report.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-1 rounded text-xs">
              <FileText className="w-3 h-3 text-emerald-400" />
              <span className="font-medium">{report.modality}</span>
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
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <AnimatePresence>
            {showToolbar && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="bg-slate-800/30 border-b border-white/5 p-2 flex items-center gap-2"
              >
                <button
                  onClick={() => handlePageChange('prev')}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-50"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-300">Page {currentPage} of {report.pages.length}</span>
                <button
                  onClick={() => handlePageChange('next')}
                  disabled={currentPage === report.pages.length}
                  className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-50"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-white/10 mx-2"></div>

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

                <div className="h-4 w-px bg-white/10 mx-2"></div>

                <button
                  onClick={handlePrint}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={handleShare}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Share"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleFullscreen}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Report Content */}
          <div className="flex-1 overflow-hidden flex">
            {/* Sidebar */}
            <div className={`bg-slate-800/30 border-r border-white/5 p-4 overflow-y-auto ${expanded ? "w-64" : "w-48"}`}>
              <div className="flex gap-1 mb-4">
                <button
                  onClick={() => setActiveTab("report")}
                  className={`flex-1 p-2 rounded text-xs ${activeTab === "report" ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
                >
                  Report
                </button>
                <button
                  onClick={() => setActiveTab("attachments")}
                  className={`flex-1 p-2 rounded text-xs ${activeTab === "attachments" ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
                >
                  Attachments
                </button>
              </div>

              {activeTab === "report" ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-slate-300 mb-2">Patient</h4>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-200"><span className="font-medium">Name:</span> {report.patient.name}</p>
                      <p className="text-xs text-slate-200"><span className="font-medium">UHID:</span> {report.patient.uhid}</p>
                      <p className="text-xs text-slate-200"><span className="font-medium">Age/Gender:</span> {report.patient.age}/{report.patient.gender}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-slate-300 mb-2">Report Details</h4>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-200"><span className="font-medium">Title:</span> {report.title}</p>
                      <p className="text-xs text-slate-200"><span className="font-medium">Modality:</span> {report.modality}</p>
                      <p className="text-xs text-slate-200"><span className="font-medium">Date:</span> {report.date}</p>
                      <p className="text-xs text-slate-200"><span className="font-medium">Doctor:</span> {report.doctor}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-slate-300 mb-2">Findings</h4>
                    <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
                      {report.findings.map((finding: string, i: number) => (
                        <li key={i}>{finding}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-slate-300 mb-2">Impression</h4>
                    <p className="text-xs text-slate-200">{report.impression}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-medium text-slate-300 mb-2">Attachments</h4>
                  <div className="space-y-2">
                    {report.attachments.map((attachment: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-slate-700/30 rounded">
                        <div className="p-1 rounded bg-emerald-500/20">
                          {getFileIcon(attachment.type)}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-200">{attachment.name}</p>
                          <p className="text-[10px] text-slate-400">{attachment.size}</p>
                        </div>
                        <button
                          onClick={() => handleDownload(attachment)}
                          className="p-1 rounded hover:bg-slate-600/50"
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Report Viewer */}
            <div className="flex-1 overflow-hidden">
              <div
                ref={reportContainerRef}
                className="w-full h-full bg-slate-800/30 flex items-center justify-center"
              >
                {report.pages[currentPage - 1]?.type === "image" ? (
                  <motion.div
                    className="relative w-full h-full flex items-center justify-center"
                    style={{ transform: `scale(${zoomLevel}) rotate(${rotation}deg)` }}
                  >
                    <img
                      src={report.pages[currentPage - 1].url}
                      alt={report.pages[currentPage - 1].description}
                      className="max-w-full max-h-full object-contain"
                    />
                  </motion.div>
                ) : (
                  <div className="p-4">
                    <p className="text-sm text-slate-400">Unsupported report format</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default MayinReportVisualizer;