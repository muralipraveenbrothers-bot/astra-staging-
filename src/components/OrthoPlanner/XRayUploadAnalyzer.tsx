import React, { useState, useRef } from "react";
import { Upload, Scan, Sparkles, CheckCircle2, FileImage, Layers, Activity, Database, HardDrive } from "lucide-react";
import type { FractureClassification } from "@/services/orthoClassificationData";
import { FRACTURE_CLASSIFICATIONS } from "@/services/orthoClassificationData";

interface XRayUploadAnalyzerProps {
  onClassificationDetected: (classification: FractureClassification) => void;
  selectedBone: string;
}

export function XRayUploadAnalyzer({
  onClassificationDetected,
  selectedBone,
}: XRayUploadAnalyzerProps) {
  const [analysisStage, setAnalysisStage] = useState<"IDLE" | "EXTRACTING" | "SEGMENTING" | "CLASSIFYING" | "COMPLETE">("IDLE");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dicomMeta, setDicomMeta] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [analysisResult, setAnalysisResult] = useState<{
    detectedBone: string;
    fractureFound: boolean;
    confidence: number;
    matchedClassification: FractureClassification | null;
    findings: string[];
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    runAnalysisPipeline(file.name, file.size);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const runAnalysisPipeline = (fileName: string, fileSize: number) => {
    setAnalysisStage("EXTRACTING");
    setAnalysisResult(null);

    // Determine modality
    let modality = "XR (Digital X-Ray)";
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes("ct") || lowerName.includes("dcm")) modality = "CT (Computed Tomography)";
    if (lowerName.includes("mri") || lowerName.includes("mr")) modality = "MRI (Magnetic Resonance Imaging)";

    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    // 1. Simulate DICOM extraction
    setTimeout(() => {
      setDicomMeta({
        modality,
        fileName,
        size: `${sizeMB} MB`,
        dimensions: modality.includes("CT") || modality.includes("MRI") ? "512 x 512 x 128 (3D Volume)" : "2048 x 2500 (2D Image)",
        patientPos: "HFS",
        sliceThickness: modality.includes("CT") ? "1.25mm" : "N/A",
        manufacturer: "Astra Imaging Systems",
      });
      setAnalysisStage("SEGMENTING");
    }, 1000);

    // 2. Simulate AI bone segmentation
    setTimeout(() => {
      setAnalysisStage("CLASSIFYING");
    }, 2500);

    // 3. Simulate Classification and mapping
    setTimeout(() => {
      let matched = FRACTURE_CLASSIFICATIONS.find((f) => f.bone === selectedBone);
      if (!matched) {
        matched = FRACTURE_CLASSIFICATIONS[0]; // Fallback
      }

      const result = {
        detectedBone: matched.bone.replace("_", " ").toUpperCase(),
        fractureFound: true,
        confidence: 96.4,
        matchedClassification: matched,
        findings: [
          `Cortical discontinuity observed at ${matched.region.toLowerCase()} with radiolucent fracture line.`,
          `Classification concordance: ${matched.system} ${matched.code} (${matched.name}).`,
          `Estimated initial displacement: ${matched.reconstruction3DParams.displacementMm} mm, angulation: ${matched.reconstruction3DParams.angulationDeg}°.`,
          `Automatic 3D reconstructed model and fracture geometry calibrated to planning viewport.`,
        ],
      };

      setAnalysisResult(result);
      setAnalysisStage("COMPLETE");
      onClassificationDetected(matched);
    }, 4500);
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
          <Scan className="w-4 h-4 text-cyan-400" />
          <span>Astra AI Vision · Ortho Segmentator</span>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
          AO/OTA v2026 Engine
        </span>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => analysisStage === "IDLE" || analysisStage === "COMPLETE" ? fileInputRef.current?.click() : null}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
          isDragging ? "border-cyan-400 bg-cyan-950/40" : ""
        } ${
          (analysisStage === "IDLE" || analysisStage === "COMPLETE")
            ? "cursor-pointer border-slate-700 hover:border-cyan-500/60 bg-slate-950/40 hover:bg-slate-950/80"
            : "cursor-default border-cyan-500/40 bg-cyan-950/20"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.dcm"
          className="hidden"
          onChange={handleFileUpload}
        />
        {previewUrl ? (
          <div className="flex items-center justify-center gap-4">
            <div className="relative">
              <img
                src={previewUrl}
                alt="X-ray preview"
                className="h-20 w-20 object-cover rounded border border-slate-700 shadow-lg brightness-110 contrast-125 grayscale"
              />
              {analysisStage !== "IDLE" && analysisStage !== "COMPLETE" && (
                <div className="absolute inset-0 bg-cyan-500/20 rounded border border-cyan-400 animate-pulse" />
              )}
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <FileImage className="w-3.5 h-3.5 text-cyan-400" /> 
                {dicomMeta?.fileName || "Radiograph Loaded"}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {analysisStage === "COMPLETE" ? "Drop or click to analyze another scan" : "AI pipeline active..."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2 text-slate-400">
            <Upload className="w-6 h-6 mb-1.5 text-slate-500" />
            <div className="text-xs font-semibold text-slate-300">
              Drag & Drop X-Ray, CT, or MRI DICOM
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              AI automatically detects modality, segments bone fragments, and maps to 3D.
            </div>
          </div>
        )}
      </div>

      {/* Analysis Pipeline Status */}
      {analysisStage !== "IDLE" && (
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
            <div className={`flex items-center gap-1.5 ${analysisStage === "EXTRACTING" || analysisStage === "SEGMENTING" || analysisStage === "CLASSIFYING" || analysisStage === "COMPLETE" ? "text-cyan-400" : ""}`}>
              <Database size={12} /> 1. Meta
            </div>
            <div className="flex-1 h-[1px] bg-slate-800 mx-2" />
            <div className={`flex items-center gap-1.5 ${analysisStage === "SEGMENTING" || analysisStage === "CLASSIFYING" || analysisStage === "COMPLETE" ? "text-purple-400" : ""}`}>
              <Layers size={12} /> 2. Segment
            </div>
            <div className="flex-1 h-[1px] bg-slate-800 mx-2" />
            <div className={`flex items-center gap-1.5 ${analysisStage === "CLASSIFYING" || analysisStage === "COMPLETE" ? "text-emerald-400" : ""}`}>
              <Activity size={12} /> 3. Classify
            </div>
          </div>

          {analysisStage === "EXTRACTING" && (
            <div className="flex items-center gap-2 text-xs text-cyan-300">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Extracting DICOM metadata & determining modality...</span>
            </div>
          )}
          {analysisStage === "SEGMENTING" && (
            <div className="flex items-center gap-2 text-xs text-purple-300">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Deep learning bone segmentation & 3D volume reconstruction...</span>
            </div>
          )}
          {analysisStage === "CLASSIFYING" && (
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Mapping fracture fragments to AO/OTA topological classification...</span>
            </div>
          )}
        </div>
      )}

      {/* Extracted Meta */}
      {dicomMeta && analysisStage !== "IDLE" && (
        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono bg-slate-950/60 p-2 rounded border border-slate-800 text-slate-400">
          <div className="col-span-2 text-[10px] font-bold text-slate-200 border-b border-slate-800 pb-1 flex items-center gap-1.5">
            <HardDrive className="w-3 h-3 text-cyan-400" />
            {dicomMeta.modality}
          </div>
          <div>Size: <span className="text-cyan-300">{dicomMeta.size}</span></div>
          <div>Dims: <span className="text-cyan-300">{dicomMeta.dimensions}</span></div>
          <div>Thickness: <span className="text-cyan-300">{dicomMeta.sliceThickness}</span></div>
          <div>Source: <span className="text-cyan-300">{dicomMeta.manufacturer}</span></div>
        </div>
      )}

      {/* Analysis Output & Findings */}
      {analysisStage === "COMPLETE" && analysisResult && (
        <div className="space-y-2.5 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs shadow-lg">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400 uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" />
              <span>{analysisResult.detectedBone} Fracture ID'd</span>
            </div>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
              {analysisResult.confidence}% CONF
            </span>
          </div>

          <div className="space-y-1.5 text-[11px] text-emerald-100/80">
            {analysisResult.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold mt-0.5">›</span>
                <span className="leading-snug">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
