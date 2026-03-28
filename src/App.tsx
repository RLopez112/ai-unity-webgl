/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Layers,
  Wand2,
  Plus,
  Trash2,
  Download,
  Loader2,
  RefreshCw,
  Palette,
  Gamepad2,
  Camera,
  Save,
  FolderOpen,
  CheckCircle2
} from 'lucide-react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import { motion, AnimatePresence } from 'motion/react';
import { editImage, StyleReference } from './services/aiService';
import { UnityPlayer, setUnityKeyboardCapture } from './components/UnityPlayer';
import { applySobelFilter } from './utils/imageFilters';
import { MaskDrawer } from './components/MaskDrawer';
import { Pencil as Pen, Eraser, Move, Sparkles } from 'lucide-react';

// --- Types ---

interface OverlayItem {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface InpaintLayer {
  id: string;
  lines: any[];
  prompt: string;
}

interface InpaintLayer {
  id: string;
  lines: any[];
  prompt: string;
}

// --- Components ---

const URLImage = ({
  item,
  isSelected,
  onSelect,
  onChange
}: {
  item: OverlayItem;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (newAttrs: Partial<OverlayItem>) => void;
}) => {
  const [img] = useImage(item.src);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <React.Fragment>
      <KonvaImage
        image={img}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation}
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        draggable
        onDragEnd={(e) => {
          onChange({
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </React.Fragment>
  );
};

export default function App() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [baseImageWeight, setBaseImageWeight] = useState<number>(100);
  const [sobelImage, setSobelImage] = useState<string | null>(null);
  const [sobelWeight, setSobelWeight] = useState<number>(100);
  const [styleReferences, setStyleReferences] = useState<StyleReference[]>([]);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [showUnity, setShowUnity] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [inpaintLayers, setInpaintLayers] = useState<InpaintLayer[]>([]);
  const [selectedInpaintId, setSelectedInpaintId] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(40);

  const stageRef = useRef<any>(null);
  const unityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const [baseImgObj] = useImage(baseImage || '');
  const [resultImgObj] = useImage(resultImage || '');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Adjust canvas size to fill the main view area dynamically
  useEffect(() => {
    const checkSize = () => {
      if (containerRef.current && baseImage && !showUnity) {
        setCanvasSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    // Check size immediately
    checkSize();

    // Global keyboard capture fix for Unity WebGL
    const stopPropagationIfInputFocused = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', stopPropagationIfInputFocused, true);
    window.addEventListener('keyup', stopPropagationIfInputFocused, true);
    window.addEventListener('keypress', stopPropagationIfInputFocused, true);

    // Check size on window resize
    window.addEventListener('resize', checkSize);

    // Using a ResizeObserver is best for exact DOM changes
    let observer: ResizeObserver | null = null;
    if (containerRef.current) {
      observer = new ResizeObserver(checkSize);
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', checkSize);
      window.removeEventListener('keydown', stopPropagationIfInputFocused, true);
      window.removeEventListener('keyup', stopPropagationIfInputFocused, true);
      window.removeEventListener('keypress', stopPropagationIfInputFocused, true);
      if (observer) observer.disconnect();
    };
  }, [baseImage, showUnity]);

  // Generate Sobel filter when base image changes
  useEffect(() => {
    if (baseImage) {
      applySobelFilter(baseImage)
        .then(setSobelImage)
        .catch(err => console.error("Sobel generation failed:", err));
    } else {
      setSobelImage(null);
    }
  }, [baseImage]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'base' | 'style' | 'overlay') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (type === 'base') setBaseImage(dataUrl);
      if (type === 'style') {
        setStyleReferences([...styleReferences, { image: dataUrl, prompt: '', weight: 100 }]);
      }
      if (type === 'overlay') {
        const id = Math.random().toString(36).substr(2, 9);
        setOverlays([...overlays, {
          id,
          src: dataUrl,
          x: 50,
          y: 50,
          width: 150,
          height: 150,
          rotation: 0
        }]);
        setSelectedId(id);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProcess = async () => {
    if (!baseImage) return;
    setIsProcessing(true);
    try {
      // 1. Capture the canvas state (base + overlays)
      const compositeBase64 = stageRef.current.toDataURL();

      const inpaintRequests: any[] = [];
      if (isInpaintMode) {
        for (const layer of inpaintLayers) {
          if (layer.lines.length === 0) continue;

          // Create a temporary canvas for the mask (White on Black)
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = canvasSize.width;
          maskCanvas.height = canvasSize.height;
          const mctx = maskCanvas.getContext('2d');
          if (mctx) {
            mctx.fillStyle = 'black';
            mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
            mctx.lineCap = 'round';
            mctx.lineJoin = 'round';
            mctx.strokeStyle = 'white';

            layer.lines.forEach(line => {
              mctx.lineWidth = line.strokeWidth;
              mctx.beginPath();
              mctx.moveTo(line.points[0], line.points[1]);
              for (let i = 2; i < line.points.length; i += 2) {
                mctx.lineTo(line.points[i], line.points[i+1]);
              }
              mctx.stroke();
            });
            inpaintRequests.push({
              maskBase64: maskCanvas.toDataURL('image/png'),
              prompt: layer.prompt
            });
          }
        }
      }

      const result = await editImage(compositeBase64, prompt, styleReferences, baseImageWeight, sobelImage, sobelWeight, inpaintRequests);
      setResultImage(result);
    } catch (error) {
      console.error(error);
      alert("Error processing image. Please check your API key and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const removeOverlay = (id: string) => {
    setOverlays(overlays.filter(o => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const removeStyleRef = (index: number) => {
    setStyleReferences(styleReferences.filter((_, i) => i !== index));
  };

  const updateStylePrompt = (index: number, newPrompt: string) => {
    const newRefs = [...styleReferences];
    newRefs[index].prompt = newPrompt;
    setStyleReferences(newRefs);
  };

  const updateStyleWeight = (index: number, newWeight: number) => {
    const newRefs = [...styleReferences];
    newRefs[index].weight = newWeight;
    setStyleReferences(newRefs);
  };

  const captureUnityFrame = () => {
    if (unityCanvasRef.current) {
      try {
        const dataUrl = unityCanvasRef.current.toDataURL('image/png');
        setBaseImage(dataUrl);
        // Automatically switch to editor view if we were in Unity view
        setShowUnity(false);
      } catch (err) {
        console.error("Failed to capture Unity frame:", err);
        alert("Could not capture Unity frame. This might be due to cross-origin restrictions or WebGL buffer settings.");
      }
    }
  };

  const exportProject = async () => {
    const projectData = {
      baseImage,
      baseImageWeight,
      sobelWeight,
      styleReferences,
      overlays,
      prompt
    };
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });

    try {
      // Use the native File System Access API if available
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'ai-studio-project.json',
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();

        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } else {
        // Fallback for browsers that don't support showSaveFilePicker
        const fileName = window.prompt("Enter project name:", "ai-studio-project");
        if (!fileName) return; // User cancelled

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
        link.click();

        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      }
    } catch (err: any) {
      // Ignore AbortError (user cancelled the save dialog)
      if (err.name !== 'AbortError') {
        console.error("Failed to save project:", err);
        alert("Failed to save the project.");
      }
    }
  };

  const importProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        if (data.baseImage !== undefined) setBaseImage(data.baseImage);
        if (data.baseImageWeight !== undefined) setBaseImageWeight(data.baseImageWeight);
        if (data.sobelWeight !== undefined) setSobelWeight(data.sobelWeight);
        if (data.styleReferences !== undefined) setStyleReferences(data.styleReferences);
        if (data.overlays !== undefined) setOverlays(data.overlays);
        if (data.prompt !== undefined) setPrompt(data.prompt);
      } catch (err) {
        console.error("Failed to parse project file", err);
        alert("Invalid project file.");
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const downloadResult = async () => {
    if (!resultImage) {
      alert("No result image found. Generate an edit first.");
      return;
    }
    
    try {
      // More robust method using built-in browser parsing
      const response = await fetch(resultImage);
      const blob = await response.blob();

      // NEW: Try Native File System Access API first (most reliable)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `ai-studio-result-${Date.now()}.png`,
            types: [{
              description: 'PNG Image',
              accept: { 'image/png': ['.png'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return; // Success!
        } catch (fileErr: any) {
          // If user cancels, stop. Otherwise, try fallback.
          if (fileErr.name === 'AbortError') return;
          console.warn("Native save failed, trying fallback...", fileErr);
        }
      }
      
      // FALLBACK 1: Blob URL Download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai-studio-result-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      
    } catch (err) {
      console.error("Export Result failed:", err);
      // FALLBACK 2: Direct DataURL link
      const link = document.createElement('a');
      link.download = `ai-studio-result-${Date.now()}.png`;
      link.href = resultImage;
      link.click();
    }
  };

  const downloadCanvas = () => {
    if (!stageRef.current) {
      alert("Please switch to Editor View (00) to export the canvas composition.");
      return;
    }
    
    // Hide transformer and other UI elements for clean export
    setSelectedId(null);
    
    // Tiny delay to allow React/Konva to update before capture
    setTimeout(async () => {
      try {
        const dataUrl = stageRef.current.toDataURL({ 
          pixelRatio: 2, 
          quality: 1 
        });
        
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `ai-studio-composition-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) {
        console.error("Export failed:", err);
        alert("Export failed. This might be due to cross-origin images on the canvas.");
      }
    }, 50);
  };

  return (
    <div id="app-root" className="h-screen flex flex-col overflow-hidden bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header id="app-header" className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 id="app-title" className="text-2xl font-bold tracking-tight uppercase">AI Image Studio</h1>
          <p id="app-version" className="text-xs opacity-50 font-mono">v0.1.0 // PROTOTYPE</p>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-[#141414] rounded-full text-sm font-medium hover:bg-[#141414]/5 transition-colors cursor-pointer">
            <FolderOpen size={16} />
            Load Project
            <input type="file" accept=".json" className="hidden" onChange={importProject} />
          </label>
          <button
            onClick={exportProject}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-[#141414] rounded-full text-sm font-medium hover:bg-[#141414]/5 transition-colors"
          >
            <Save size={16} />
            Save Project
          </button>
          
          {baseImage && !showUnity && (
            <button
              onClick={downloadCanvas}
              className="flex items-center gap-2 px-4 py-2 border border-[#141414] text-[#141414] rounded-full text-sm font-medium hover:bg-[#141414]/5 transition-colors"
            >
              <ImageIcon size={16} />
              Export Canvas
            </button>
          )}

          {resultImage && (
            <button
              onClick={downloadResult}
              className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Download size={16} />
              Export Result
            </button>
          )}
        </div>
      </header>

      <main id="app-main" className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Sidebar - Controls */}
        <aside id="sidebar-controls" className="w-full lg:w-90 border-r border-[#141414] overflow-y-auto p-6 space-y-8 bg-[#E4E3E0]">
          {/* Unity Source Toggle */}
          <section id="section-source-toggle" className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono opacity-50">00</span>
              <h2 className="text-xs uppercase font-bold tracking-widest">Input Source</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowUnity(false)}
                className={`flex flex-col items-center gap-2 p-3 border border-[#141414] rounded-xl transition-colors ${!showUnity ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
              >
                <ImageIcon size={16} />
                <span className="text-[10px] font-bold uppercase">Editor</span>
              </button>
              <button
                onClick={() => setShowUnity(true)}
                className={`flex flex-col items-center gap-2 p-3 border border-[#141414] rounded-xl transition-colors ${showUnity ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
              >
                <Gamepad2 size={16} />
                <span className="text-[10px] font-bold uppercase">Unity</span>
              </button>
            </div>
          </section>

          {/* Step 1: Base Image */}
          <section id="section-base-image" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-50">01</span>
                <h2 className="text-xs uppercase font-bold tracking-widest">Base Image</h2>
              </div>
              {showUnity && (
                <button
                  onClick={captureUnityFrame}
                  className="flex items-center gap-1 px-2 py-1 bg-[#141414] text-[#E4E3E0] rounded text-[9px] font-bold uppercase hover:opacity-80 transition-opacity"
                >
                  <Camera size={12} />
                  Capture
                </button>
              )}
            </div>
            <label className="group relative flex flex-col items-center justify-center w-full h-32 border border-dashed border-[#141414] rounded-xl cursor-pointer hover:bg-[#141414] transition-colors overflow-hidden">
              {baseImage ? (
                <img src={baseImage} alt="Base" className="w-full h-full object-cover opacity-50 group-hover:opacity-20" />
              ) : (
                <div className="flex flex-col items-center gap-2 group-hover:text-[#E4E3E0]">
                  <Upload size={20} />
                  <span className="text-[10px] uppercase font-bold">Upload Input</span>
                </div>
              )}
              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'base')} />
            </label>
            {baseImage && (
              <div className="flex flex-col gap-1 mt-2 p-3 border border-[#141414] rounded-xl bg-white/5">
                <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider opacity-70">
                  <span>Influence Weight</span>
                  <span>{baseImageWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100"
                  value={baseImageWeight}
                  onChange={(e) => setBaseImageWeight(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-[#141414]/20 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                />
              </div>
            )}
          </section>

          {/* Step 2: Edge Detection */}
          <section id="section-edge-detect" className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono opacity-50">02</span>
              <h2 className="text-xs uppercase font-bold tracking-widest">Edge Detection</h2>
            </div>
            {sobelImage ? (
              <div className="relative w-full h-32 border border-[#141414] rounded-xl overflow-hidden bg-black">
                <img src={sobelImage} alt="Sobel Filter" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-2 pointer-events-none">
                  <span className="text-[10px] text-white font-mono uppercase tracking-widest">Auto-Generated Structure Map</span>
                </div>
              </div>
            ) : (
              <div className="w-full h-32 border border-dashed border-[#141414]/30 rounded-xl flex items-center justify-center">
                <span className="text-[10px] opacity-40 uppercase font-bold text-center px-4">Waiting for Base Image</span>
              </div>
            )}
            {sobelImage && (
              <div className="flex flex-col gap-1 mt-2 p-3 border border-[#141414] rounded-xl bg-white/5">
                <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider opacity-70">
                  <span>Edge Map Influence</span>
                  <span>{sobelWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100"
                  value={sobelWeight}
                  onChange={(e) => setSobelWeight(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-[#141414]/20 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                />
              </div>
            )}
            <p className="text-[10px] opacity-60 leading-tight">This edge map is automatically passed as the primary structural reference to the AI.</p>
          </section>

          {/* Step 3: Style References */}
          <section id="section-style-refs" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-50">03</span>
                <h2 className="text-xs uppercase font-bold tracking-widest">Style References</h2>
              </div>
              <label className="cursor-pointer p-1 hover:bg-[#141414] hover:text-[#E4E3E0] rounded transition-colors">
                <Plus size={16} />
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'style')} />
              </label>
            </div>

            <div className="space-y-4">
              {styleReferences.length === 0 && (
                <p className="text-[10px] opacity-40 italic">No style references added.</p>
              )}
              {styleReferences.map((ref, index) => (
                <div key={index} className="space-y-2 p-3 border border-[#141414] rounded-xl bg-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={ref.image} className="w-10 h-10 object-cover rounded border border-[#141414]" />
                      <span className="text-[10px] font-mono uppercase">Ref #{index + 1}</span>
                    </div>
                    <button
                      onClick={() => removeStyleRef(index)}
                      className="p-1 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    value={ref.prompt}
                    onChange={(e) => updateStylePrompt(index, e.target.value)}
                    placeholder="What to take from this image? (e.g., 'Color palette', 'Brush strokes')"
                    className="w-full h-16 bg-transparent border border-[#141414]/30 rounded-lg p-2 text-[10px] focus:outline-none focus:border-[#141414] resize-none"
                  />
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider opacity-70">
                      <span>Influence Weight</span>
                      <span>{ref.weight ?? 100}%</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100"
                      value={ref.weight ?? 100}
                      onChange={(e) => updateStyleWeight(index, parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-[#141414]/20 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Step 4: Overlays */}
          <section id="section-overlays" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-50">04</span>
                <h2 className="text-xs uppercase font-bold tracking-widest">PNG Overlays</h2>
              </div>
              <label className="cursor-pointer p-1 hover:bg-[#141414] hover:text-[#E4E3E0] rounded transition-colors">
                <Plus size={16} />
                <input type="file" className="hidden" accept="image/png" onChange={(e) => handleFileUpload(e, 'overlay')} />
              </label>
            </div>
            <div className="space-y-2">
              {overlays.length === 0 && (
                <p className="text-[10px] opacity-40 italic">No overlays added yet.</p>
              )}
              {overlays.map((overlay) => (
                <div
                  key={overlay.id}
                  className={`flex items-center justify-between p-2 border border-[#141414] rounded-lg cursor-pointer transition-colors ${selectedId === overlay.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
                  onClick={() => setSelectedId(overlay.id)}
                >
                  <div className="flex items-center gap-2">
                    <img src={overlay.src} className="w-6 h-6 object-contain bg-white/10 rounded" />
                    <span className="text-[10px] font-mono">Layer_{overlay.id.slice(0, 4)}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id); }}
                    className="p-1 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Step 5: Advanced Inpainting Layers */}
          <section id="section-inpaint" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-50">05</span>
                <h2 className="text-xs uppercase font-bold tracking-widest">Inpaint Layers</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const id = Math.random().toString(36).substr(2, 9);
                    setInpaintLayers([...inpaintLayers, { id, lines: [], prompt: '' }]);
                    setSelectedInpaintId(id);
                    setIsInpaintMode(true);
                  }}
                  className="p-1 hover:bg-[#141414] hover:text-[#E4E3E0] rounded transition-colors"
                  title="Add Inpaint Layer"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => setIsInpaintMode(!isInpaintMode)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${isInpaintMode ? 'bg-[#141414] text-[#E4E3E0]' : 'border border-[#141414] hover:bg-[#141414]/5'}`}
                >
                  {isInpaintMode ? 'On' : 'Off'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {inpaintLayers.length === 0 && (
                <p className="text-[10px] opacity-40 italic">No inpaint layers yet. Click + to add one.</p>
              )}
              {inpaintLayers.map((layer) => (
                <div key={layer.id} className={`space-y-3 p-3 border border-[#141414] rounded-xl transition-all ${selectedInpaintId === layer.id ? 'bg-[#141414]/5 ring-1 ring-[#141414]' : 'bg-white/5'}`}>
                  <div className="flex items-center justify-between" onClick={() => setSelectedInpaintId(layer.id)}>
                    <div className="flex items-center gap-2 cursor-pointer">
                      <div className={`w-3 h-3 rounded-full border border-[#141414] ${selectedInpaintId === layer.id ? 'bg-[#141414]' : ''}`} />
                      <span className="text-[10px] font-mono uppercase">Mask Layer #{layer.id.slice(0, 4)}</span>
                      {layer.lines.length > 0 && <span className="text-[8px] bg-[#141414] text-white px-1 rounded">Painted</span>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInpaintLayers(inpaintLayers.filter(l => l.id !== layer.id));
                        if (selectedInpaintId === layer.id) setSelectedInpaintId(null);
                      }}
                      className="p-1 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  
                  {selectedInpaintId === layer.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                           <button className="p-1.5 bg-[#141414] text-[#E4E3E0] rounded">
                            <Pen size={12} />
                          </button>
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold opacity-60">Brush Size</span>
                            <input
                              type="range"
                              min="5" max="150"
                              value={brushSize}
                              onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                              className="w-24 h-1 bg-[#141414]/20 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            const newLayers = inpaintLayers.map(l => l.id === layer.id ? { ...l, lines: [] } : l);
                            setInpaintLayers(newLayers);
                          }}
                          className="text-[9px] uppercase font-bold text-red-500 hover:opacity-70"
                        >
                          Reset
                        </button>
                      </div>
                      <textarea
                        value={layer.prompt}
                        onChange={(e) => {
                          const newLayers = inpaintLayers.map(l => l.id === layer.id ? { ...l, prompt: e.target.value } : l);
                          setInpaintLayers(newLayers);
                        }}
                        onFocus={() => setUnityKeyboardCapture(false)}
                        onBlur={() => setUnityKeyboardCapture(true)}
                        placeholder="What to change in this specific masked area? (e.g., 'Modern skyscraper', 'Waterfall')"
                        className="w-full h-20 bg-transparent border border-[#141414]/30 rounded-lg p-2 text-[10px] focus:outline-none focus:border-[#141414] resize-none"
                      />
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Step 6: General Instructions */}
          <section id="section-prompt" className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono opacity-50">06</span>
              <h2 className="text-xs uppercase font-bold tracking-widest">Global Style</h2>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setUnityKeyboardCapture(false)}
              onBlur={() => setUnityKeyboardCapture(true)}
              placeholder="Overall instructions (e.g., 'Sunset lighting', 'Oil painting style', '8k resolution')..."
              className="w-full h-32 bg-transparent border border-[#141414] rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] resize-none"
            />
          </section>

          <button
            id="btn-generate-edit"
            onClick={handleProcess}
            disabled={!baseImage || isProcessing}
            className="w-full py-4 bg-[#141414] text-[#E4E3E0] rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform active:scale-95"
          >
            {isProcessing ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Processing...
              </>
            ) : (
              <>
                <Wand2 size={18} />
                Generate Edit
              </>
            )}
          </button>
        </aside>

        {/* Main View Area */}
        <section ref={containerRef} id="main-view-area" className="flex-1 bg-[#D4D3D0] relative">
          {/* Unity View (Always mounted, conditionally visible) */}
          <motion.div
            id="unity-view-container"
            initial={{ opacity: 0, pointerEvents: 'none', position: 'absolute' }}
            animate={{
              opacity: showUnity ? 1 : 0,
              pointerEvents: showUnity ? 'auto' : 'none',
              zIndex: showUnity ? 50 : -10
            }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 w-full h-full"
          >
            <div className="w-full h-full bg-transparent">
              <UnityPlayer onCanvasReady={(canvas) => unityCanvasRef.current = canvas} />
            </div>
            {/* Capture button floats on top */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
              <button
                onClick={captureUnityFrame}
                className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-[#E4E3E0] rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-transform pointer-events-auto"
              >
                <Camera size={18} />
                Capture Current Frame as Input
              </button>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {!showUnity && !baseImage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="text-center space-y-4 pointer-events-auto">
                  <div className="w-24 h-24 border-2 border-dashed border-[#141414] rounded-full flex items-center justify-center mx-auto opacity-20">
                    <ImageIcon size={40} />
                  </div>
                  <p className="text-sm font-medium opacity-40">Upload a base image to start editing</p>
                </div>
              </motion.div>
            )}

            {!showUnity && baseImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 shadow-2xl bg-white"
                style={{ width: canvasSize.width, height: canvasSize.height }}
              >
                {/* Result Overlay (Only show if NOT in inpaint mode) */}
                {resultImage && !isInpaintMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-50 bg-white"
                  >
                    <img src={resultImage} alt="Result" className="w-full h-full object-contain" />
                    <div className="absolute top-4 right-4 flex gap-2">
                      <button
                        onClick={() => {
                          setBaseImage(resultImage); // Accept result as new base
                          setResultImage(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-full text-[10px] font-bold uppercase hover:scale-105 transition-transform"
                      >
                        <RefreshCw size={14} />
                        Keep & Edit
                      </button>
                      <button
                        onClick={() => setResultImage(null)}
                        className="p-2 bg-[#141414] text-[#E4E3E0] rounded-full hover:scale-110 transition-transform"
                        title="Back to Editor"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Editor Canvas */}
                <Stage
                  width={canvasSize.width}
                  height={canvasSize.height}
                  ref={stageRef}
                  onMouseDown={(e) => {
                    const clickedOnEmpty = e.target === e.target.getStage();
                    // Our base image often fills the whole background, so clicking it should also deselect
                    const clickedOnBaseImage = e.target.attrs?.id === 'base-image';
                    if (clickedOnEmpty || clickedOnBaseImage) {
                      setSelectedId(null);
                    }
                  }}
                >
                  <Layer>
                    {/* Background Image (Base or Result) */}
                    {(resultImgObj || baseImgObj) && (() => {
                      const activeImg = (isInpaintMode && resultImgObj) ? resultImgObj : (resultImgObj || baseImgObj);
                      if (!activeImg) return null;

                      const imgRatio = activeImg.width / activeImg.height;
                      const canvasRatio = canvasSize.width / canvasSize.height;

                      let drawWidth = canvasSize.width;
                      let drawHeight = canvasSize.height;
                      let x = 0;
                      let y = 0;

                      // object-fit: contain
                      if (imgRatio > canvasRatio) {
                        drawHeight = canvasSize.width / imgRatio;
                        y = (canvasSize.height - drawHeight) / 2;
                      } else {
                        drawWidth = canvasSize.height * imgRatio;
                        x = (canvasSize.width - drawWidth) / 2;
                      }

                      return (
                        <KonvaImage
                          id="base-image"
                          image={activeImg}
                          x={x}
                          y={y}
                          width={drawWidth}
                          height={drawHeight}
                        />
                      );
                    })()}

                    {/* Mask Drawing Layer */}
                    {overlays.map((item) => (
                      <URLImage
                        key={item.id}
                        item={item}
                        isSelected={item.id === selectedId}
                        onSelect={() => setSelectedId(item.id)}
                        onChange={(newAttrs) => {
                          const newOverlays = overlays.slice();
                          const index = overlays.findIndex(o => o.id === item.id);
                          newOverlays[index] = { ...item, ...newAttrs };
                          setOverlays(newOverlays);
                        }}
                      />
                    ))}
                  </Layer>

                  {/* Top Layer for Tools/Masking */}
                  <Layer id="tool-layer">
                    <MaskDrawer
                      width={canvasSize.width}
                      height={canvasSize.height}
                      brushSize={brushSize}
                      lines={inpaintLayers.find(l => l.id === selectedInpaintId)?.lines || []}
                      setLines={(newLines) => {
                        setInpaintLayers(inpaintLayers.map(l => l.id === selectedInpaintId ? { ...l, lines: newLines } : l));
                      }}
                      isVisible={isInpaintMode && selectedInpaintId !== null}
                    />
                  </Layer>
                </Stage>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Canvas Controls */}
          {baseImage && !resultImage && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-[#141414] text-[#E4E3E0] rounded-full shadow-xl">
              <div className="flex items-center gap-2 border-r border-white/20 pr-4">
                <Layers size={14} className="opacity-50" />
                <span className="text-[10px] uppercase font-bold tracking-widest">{overlays.length} Layers</span>
              </div>
              <button
                onClick={() => {
                  setBaseImage(null);
                  setOverlays([]);
                  setResultImage(null);
                }}
                className="text-[10px] uppercase font-bold hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Save Confirmation Toast */}
      <AnimatePresence>
        {isSaved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-[#141414] text-[#E4E3E0] rounded-2xl shadow-2xl pointer-events-none"
          >
            <CheckCircle2 size={24} className="text-green-400" />
            <div className="flex flex-col">
              <span className="text-sm font-bold uppercase tracking-wider">Project Saved</span>
              <span className="text-[10px] opacity-60">Your work has been exported</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
