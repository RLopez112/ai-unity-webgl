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
  Camera
} from 'lucide-react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import { motion, AnimatePresence } from 'motion/react';
import { editImage, StyleReference } from './services/aiService';
import { UnityPlayer } from './components/UnityPlayer';

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
  const [styleReferences, setStyleReferences] = useState<StyleReference[]>([]);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [showUnity, setShowUnity] = useState(false);
  
  const stageRef = useRef<any>(null);
  const unityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [baseImgObj] = useImage(baseImage || '');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Adjust canvas size when base image loads
  useEffect(() => {
    if (baseImgObj) {
      const maxWidth = window.innerWidth * 0.6;
      const maxHeight = window.innerHeight * 0.7;
      let width = baseImgObj.width;
      let height = baseImgObj.height;

      const ratio = width / height;
      if (width > maxWidth) {
        width = maxWidth;
        height = width / ratio;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }

      setCanvasSize({ width, height });
    }
  }, [baseImgObj]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'base' | 'style' | 'overlay') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (type === 'base') setBaseImage(dataUrl);
      if (type === 'style') {
        setStyleReferences([...styleReferences, { image: dataUrl, prompt: '' }]);
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
      
      const result = await editImage(compositeBase64, prompt, styleReferences);
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

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.download = 'ai-studio-result.png';
    link.href = resultImage;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">AI Image Studio</h1>
          <p className="text-xs opacity-50 font-mono">v1.0.0 // PROTOTYPE</p>
        </div>
        <div className="flex gap-4">
          {resultImage && (
            <button 
              onClick={downloadResult}
              className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-[#E4E3E0] rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Download size={16} />
              Export
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-col lg:flex-row h-[calc(100vh-88px)]">
        {/* Sidebar - Controls */}
        <aside className="w-full lg:w-80 border-r border-[#141414] overflow-y-auto p-6 space-y-8 bg-[#E4E3E0]">
          {/* Unity Source Toggle */}
          <section className="space-y-4">
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
          <section className="space-y-4">
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
          </section>

          {/* Step 2: Style References */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-50">02</span>
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
                </div>
              ))}
            </div>
          </section>

          {/* Step 3: Overlays */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono opacity-50">03</span>
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
                    <span className="text-[10px] font-mono">Layer_{overlay.id.slice(0,4)}</span>
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

          {/* Step 4: Prompt */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono opacity-50">04</span>
              <h2 className="text-xs uppercase font-bold tracking-widest">AI Instructions</h2>
            </div>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the desired changes (e.g., 'Enhance lighting', 'Blend overlays naturally', 'Cyberpunk aesthetic')..."
              className="w-full h-32 bg-transparent border border-[#141414] rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] resize-none"
            />
          </section>

          <button 
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
        <section className="flex-1 bg-[#D4D3D0] overflow-hidden relative flex items-center justify-center p-8">
          <AnimatePresence mode="wait">
            {showUnity ? (
              <motion.div 
                key="unity-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full max-w-4xl max-h-[600px] shadow-2xl"
              >
                <UnityPlayer onCanvasReady={(canvas) => unityCanvasRef.current = canvas} />
                <div className="mt-4 flex justify-center">
                  <button 
                    onClick={captureUnityFrame}
                    className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-[#E4E3E0] rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                  >
                    <Camera size={18} />
                    Capture Current Frame as Input
                  </button>
                </div>
              </motion.div>
            ) : !baseImage ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-4"
              >
                <div className="w-24 h-24 border-2 border-dashed border-[#141414] rounded-full flex items-center justify-center mx-auto opacity-20">
                  <ImageIcon size={40} />
                </div>
                <p className="text-sm font-medium opacity-40">Upload a base image to start editing</p>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative shadow-2xl bg-white"
                style={{ width: canvasSize.width, height: canvasSize.height }}
              >
                {/* Result Overlay */}
                {resultImage && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-50 bg-white"
                  >
                    <img src={resultImage} alt="Result" className="w-full h-full object-contain" />
                    <div className="absolute top-4 right-4 flex gap-2">
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
                    if (clickedOnEmpty) setSelectedId(null);
                  }}
                >
                  <Layer>
                    {/* Base Image */}
                    {baseImgObj && (
                      <KonvaImage
                        image={baseImgObj}
                        width={canvasSize.width}
                        height={canvasSize.height}
                      />
                    )}
                    
                    {/* Overlays */}
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
    </div>
  );
}
