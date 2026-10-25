import { useState, useEffect, useRef } from "react";
import { X, XCircle, Zap, RefreshCw, Maximize2, Minimize2, List, Search, AlertTriangle, CheckCircle, Circle, Cpu, ArrowUpRight, ArrowDownLeft, ArrowUpLeft, ArrowDownRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinAnatomyViewerProps {
  onClose: () => void;
  anatomyType: string;
}

export function MayinAnatomyViewer({
  onClose,
  anatomyType,
}: MayinAnatomyViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [rotationX, setRotationX] = useState(0);
  const [rotationY, setRotationY] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedStructure, setSelectedStructure] = useState<string | null>(null);
  const [highlightedStructures, setHighlightedStructures] = useState<string[]>([]);
  const anatomyRef = useRef<any>(null);

  // Anatomy data structure - in a real implementation, this would come from actual 3D models
  const anatomyData = {
    heart: {
      name: "Heart",
      structures: [
        { id: "aorta", name: "Aorta", category: "Vessel" },
        { id: "pulmonary-artery", name: "Pulmonary Artery", category: "Vessel" },
        { id: "pulmonary-vein", name: "Pulmonary Vein", category: "Vessel" },
        { id: "vena-cava", name: "Vena Cava", category: "Vessel" },
        { id: "left-atrium", name: "Left Atrium", category: "Chamber" },
        { id: "right-atrium", name: "Right Atrium", category: "Chamber" },
        { id: "left-ventricle", name: "Left Ventricle", category: "Chamber" },
        { id: "right-ventricle", name: "Right Ventricle", category: "Chamber" },
        { id: "mitral-valve", name: "Mitral Valve", category: "Valve" },
        { id: "tricuspid-valve", name: "Tricuspid Valve", category: "Valve" },
        { id: "aortic-valve", name: "Aortic Valve", category: "Valve" },
        { id: "pulmonary-valve", name: "Pulmonary Valve", category: "Valve" },
        { id: "coronary-artery", name: "Coronary Artery", category: "Vessel" },
        { id: "pericardium", name: "Pericardium", category: "Sac" },
      ],
      connections: [
        ["aorta", "left-ventricle"],
        ["pulmonary-artery", "right-ventricle"],
        ["pulmonary-vein", "left-atrium"],
        ["vena-cava", "right-atrium"],
        ["left-atrium", "left-ventricle", "mitral-valve"],
        ["right-atrium", "right-ventricle", "tricuspid-valve"],
        ["left-ventricle", "aorta", "aortic-valve"],
        ["right-ventricle", "pulmonary-artery", "pulmonary-valve"],
      ],
    },
    brain: {
      name: "Brain",
      structures: [
        { id: "cerebrum", name: "Cerebrum", category: "Lobe" },
        { id: "cerebellum", name: "Cerebellum", category: "Lobe" },
        { id: "brainstem", name: "Brainstem", category: "Stem" },
        { id: "frontal-lobe", name: "Frontal Lobe", category: "Lobe" },
        { id: "parietal-lobe", name: "Parietal Lobe", category: "Lobe" },
        { id: "temporal-lobe", name: "Temporal Lobe", category: "Lobe" },
        { id: "occipital-lobe", name: "Occipital Lobe", category: "Lobe" },
        { id: "thalamus", name: "Thalamus", category: "Nucleus" },
        { id: "hypothalamus", name: "Hypothalamus", category: "Nucleus" },
        { id: "hippocampus", name: "Hippocampus", category: "Limbic" },
        { id: "amygdala", name: "Amygdala", category: "Limbic" },
        { id: "corpus-callosum", name: "Corpus Callosum", category: "Commissure" },
      ],
      connections: [
        ["frontal-lobe", "cerebrum"],
        ["parietal-lobe", "cerebrum"],
        ["temporal-lobe", "cerebrum"],
        ["occipital-lobe", "cerebrum"],
        ["thalamus", "cerebrum"],
        ["hypothalamus", "cerebrum"],
        ["hippocampus", "cerebrum"],
        ["amygdala", "cerebrum"],
        ["corpus-callosum", "cerebrum"],
        ["brainstem", "cerebrum"],
        ["cerebellum", "brainstem"],
      ],
    },
    knee: {
      name: "Knee Joint",
      structures: [
        { id: "femur", name: "Femur", category: "Bone" },
        { id: "tibia", name: "Tibia", category: "Bone" },
        { id: "fibula", name: "Fibula", category: "Bone" },
        { id: "patella", name: "Patella", category: "Bone" },
        { id: "acl", name: "Anterior Cruciate Ligament", category: "Ligament" },
        { id: "pcl", name: "Posterior Cruciate Ligament", category: "Ligament" },
        { id: "mcl", name: "Medial Collateral Ligament", category: "Ligament" },
        { id: "lcl", name: "Lateral Collateral Ligament", category: "Ligament" },
        { id: "meniscus-medial", name: "Medial Meniscus", category: "Cartilage" },
        { id: "meniscus-lateral", name: "Lateral Meniscus", category: "Cartilage" },
        { id: "articular-cartilage", name: "Articular Cartilage", category: "Cartilage" },
        { id: "synovial-membrane", name: "Synovial Membrane", category: "Membrane" },
        { id: "joint-capsule", name: "Joint Capsule", category: "Capsule" },
      ],
      connections: [
        ["femur", "tibia"],
        ["femur", "fibula"],
        ["patella", "femur"],
        ["patella", "tibia"],
        ["acl", "femur", "tibia"],
        ["pcl", "femur", "tibia"],
        ["mcl", "femur", "tibia"],
        ["lcl", "femur", "tibia"],
        ["meniscus-medial", "femur", "tibia"],
        ["meniscus-lateral", "femur", "tibia"],
        ["articular-cartilage", "femur", "tibia"],
        ["synovial-membrane", "joint-capsule"],
      ],
    },
    spine: {
      name: "Spine",
      structures: [
        { id: "cervical", name: "Cervical Spine", category: "Region" },
        { id: "thoracic", name: "Thoracic Spine", category: "Region" },
        { id: "lumbar", name: "Lumbar Spine", category: "Region" },
        { id: "sacral", name: "Sacral Spine", category: "Region" },
        { id: "vertebrae", name: "Vertebrae", category: "Bone" },
        { id: "intervertebral-disc", name: "Intervertebral Disc", category: "Disc" },
        { id: "spinal-cord", name: "Spinal Cord", category: "Nerve" },
        { id: "nerve-root", name: "Nerve Root", category: "Nerve" },
        { id: "ligament-flavum", name: "Ligament Flavum", category: "Ligament" },
        { id: "anterior-longitudinal", name: "Anterior Longitudinal Ligament", category: "Ligament" },
        { id: "posterior-longitudinal", name: "Posterior Longitudinal Ligament", category: "Ligament" },
      ],
      connections: [
        ["vertebrae", "cervical"],
        ["vertebrae", "thoracic"],
        ["vertebrae", "lumbar"],
        ["vertebrae", "sacral"],
        ["intervertebral-disc", "vertebrae"],
        ["spinal-cord", "vertebrae"],
        ["nerve-root", "spinal-cord"],
        ["ligament-flavum", "vertebrae"],
        ["anterior-longitudinal", "vertebrae"],
        ["posterior-longitudinal", "vertebrae"],
      ],
    }
  };

  // Get anatomy data for the selected type
  const currentAnatomy = anatomyData[anatomyType as keyof typeof anatomyData] || anatomyData.heart;

  // Get structure by ID
  const getStructureById = (id: string) => {
    return currentAnatomy.structures.find((s: any) => s.id === id);
  };

  // Handle structure selection
  const handleStructureSelect = (structureId: string) => {
    setSelectedStructure(selectedStructure === structureId ? null : structureId);
  };

  // Handle highlighting structures
  const handleHighlightStructure = (structureId: string) => {
    setHighlightedStructures(prev => {
      if (prev.includes(structureId)) {
        return prev.filter(id => id !== structureId);
      } else {
        return [...prev, structureId];
      }
    });
  };

  // Handle rotation
  const handleRotate = (axis: 'x' | 'y', direction: 'positive' | 'negative') => {
    if (axis === 'x') {
      setRotationX(prev => (prev + (direction === 'positive' ? 15 : -15) + 360) % 360);
    } else {
      setRotationY(prev => (prev + (direction === 'positive' ? 15 : -15) + 360) % 360);
    }
  };

  // Handle zoom
  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    if (direction === 'in') {
      setZoomLevel(prev => Math.min(prev + 0.2, 3));
    } else if (direction === 'out') {
      setZoomLevel(prev => Math.max(prev - 0.2, 0.3));
    } else {
      setZoomLevel(1);
      setRotationX(0);
      setRotationY(0);
    }
  };

  // Handle reset view
  const handleResetView = () => {
    setRotationX(0);
    setRotationY(0);
    setZoomLevel(1);
    setSelectedStructure(null);
    setHighlightedStructures([]);
  };

  // Handle list structures
  const handleListStructures = () => {
    // In a real implementation, this would open a sidebar or modal
    alert(`Structures in ${currentAnatomy.name}:\n${currentAnatomy.structures.map(s => `- ${s.name} (${s.category})`).join('\n')}`);
  };

  // Handle search structures
  const handleSearchStructures = () => {
    // In a real implementation, this would open a search dialog
    const searchTerm = prompt("Enter structure name to search:");
    if (searchTerm) {
      const matches = currentAnatomy.structures.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matches.length > 0) {
        setSelectedStructure(matches[0].id);
        alert(`Found: ${matches.map(m => m.name).join(', ')}`);
      } else {
        alert(`No structures found matching "${searchTerm}"`);
      }
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
            <Zap className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-medium text-slate-200">{currentAnatomy.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-1 rounded text-xs">
              <Circle className="w-3 h-3 text-emerald-400" />
              <span className="font-medium">{selectedStructure || "No Selection"}</span>
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
        <div className="flex-1 overflow-hidden flex">
          {/* Controls Panel */}
          <div className="bg-slate-800/30 border-r border-white/5 p-4 flex flex-col">
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleListStructures}
                className="flex-1 p-2 rounded text-xs hover:bg-slate-700/50"
              >
                <List className="w-4 h-4" />
                <span>Structures</span>
              </button>
              <button
                onClick={handleSearchStructures}
                className="flex-1 p-2 rounded text-xs hover:bg-slate-700/50"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-medium text-slate-300 mb-2">Controls</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRotate('x', 'positive')}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Rotate X+"
                >
                  <ArrowUpRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleRotate('x', 'negative')}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Rotate X-"
                >
                  <ArrowDownLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleRotate('y', 'positive')}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Rotate Y+"
                >
                  <ArrowUpLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleRotate('y', 'negative')}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Rotate Y-"
                >
                  <ArrowDownRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleZoom('in')}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Zoom In"
                >
                  <Zap className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleZoom('out')}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Zoom Out"
                >
                  <Zap className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleResetView()}
                  className="p-1 rounded hover:bg-slate-700/50"
                  title="Reset View"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Selected Structure Info */}
            {selectedStructure && (
              <div className="mt-4 p-3 bg-slate-700/30 rounded">
                <h4 className="text-xs font-medium text-slate-300 mb-2">Selected Structure</h4>
                <div className="flex items-center gap-2 mb-2">
                  {getStructureById(selectedStructure) && (
                    <>
                      <Circle className="w-3 h-3 text-emerald-400" />
                      <span className="font-medium">{getStructureById(selectedStructure)?.name}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-200">{getStructureById(selectedStructure)?.category}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleHighlightStructure(selectedStructure)}
                    className="p-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30"
                  >
                    <CheckCircle className="w-3 h-3" />
                    <span className="text-xs">{highlightedStructures.includes(selectedStructure) ? "Unhighlight" : "Highlight"}</span>
                  </button>
                  <button
                    onClick={() => {
                      setHighlightedStructures(prev => prev.filter(id => id !== selectedStructure));
                    }}
                    className="p-1 rounded bg-slate-600/20 hover:bg-slate-600/30"
                  >
                    <XCircle className="w-3 h-3" />
                    <span className="text-xs">Remove Highlight</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Anatomy Visualization */}
          <div className="flex-1 overflow-hidden relative">
            <div
              ref={anatomyRef}
              className="w-full h-full bg-slate-900 flex items-center justify-center"
              style={{
                transform: `rotateX(${rotationX}deg) rotateY(${rotationY}deg) scale(${zoomLevel})`,
                transformOrigin: "center"
              }}
            >
              {/* Simplified 2D representation of anatomy - in a real implementation, this would be a 3D model */}
              <div className="relative w-64 h-64">
                {/* Background */}
                <div className="absolute inset-0 rounded-full bg-slate-800/30"></div>

                {/* Structures */}
                {currentAnatomy.structures.map((structure: any) => {
                  const isSelected = structure.id === selectedStructure;
                  const isHighlighted = highlightedStructures.includes(structure.id);

                  // Simple positioning based on structure ID hash (in a real app, this would be actual 3D coordinates)
                  const angle = (structure.id.split('-').reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0) % 360) * (Math.PI / 180);
                  const distance = 20 + (Math.sin(angle * 2) * 15);
                  const x = 50 + Math.cos(angle) * distance;
                  const y = 50 + Math.sin(angle) * distance;

                  return (
                    <motion.div
                      key={structure.id}
                      className="absolute w-6 h-6 rounded-full"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        backgroundColor: isSelected
                          ? "bg-emerald-400"
                          : isHighlighted
                            ? "bg-amber-400"
                            : "bg-slate-600/30",
                        border: isSelected
                          ? "2px solid white"
                            : "none",
                        transform: `scale(${isSelected ? 1.3 : 1})`,
                        zIndex: isSelected ? 10 : isHighlighted ? 5 : 1
                      }}
                    >
                      {/* Structure label */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1">
                        <div className="px-1 py-0 text-[8px] rounded bg-slate-800/90 text-slate-100 whitespace-nowrap">
                          {structure.name}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Connections */}
                {currentAnatomy.connections.map((connection: any[], index: number) => (
                  <motion.path
                    key={index}
                    className="stroke-slate-400/50"
                    // In a real implementation, we would calculate the actual path between structures
                    d={`M 50,50 L 50,50`}
                    style={{
                      opacity: highlightedStructures.some(id => connection.includes(id)) ? 0.7 : 0.3
                    }}
                  />
                ))}

                {/* Center point */}
                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400/50"></div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default MayinAnatomyViewer;