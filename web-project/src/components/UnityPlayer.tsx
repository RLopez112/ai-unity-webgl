import React, { useEffect, useRef, useState } from 'react';

interface UnityPlayerProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

declare global {
  interface Window {
    createUnityInstance: any;
  }
}

export const UnityPlayer: React.FC<UnityPlayerProps> = ({ onCanvasReady }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    var buildUrl = "unity-package/Build";
    var loaderUrl = buildUrl + "/1532026.loader.js";
    var config = {
      arguments: [],
      dataUrl: buildUrl + "/1532026.data",
      frameworkUrl: buildUrl + "/1532026.framework.js",
      codeUrl: buildUrl + "/1532026.wasm",
      streamingAssetsUrl: "StreamingAssets",
      companyName: "DefaultCompany",
      productName: "gonzalo rosso",
      productVersion: "0.1.0",
      devicePixelRatio: window.devicePixelRatio,
      webglContextAttributes: { preserveDrawingBuffer: true },
    };

    const script = document.createElement("script");
    script.src = loaderUrl;
    script.onload = () => {
      if (canvasRef.current && window.createUnityInstance) {
        window.createUnityInstance(canvasRef.current, config, (p: number) => {
          setProgress(p);
        }).then((unityInstance: any) => {
          // Prevent Unity from intercepting all keystrokes on the page, 
          // allowing React text inputs to function normally.
          if (unityInstance.SetFullscreen) { /* just a dummy check */ }
          canvasRef.current!.setAttribute("tabindex", "1");
          // Unity WebGL specifically uses WebGLInput.captureAllKeyboardInput
          // We can't access it easily from TS, so we might need to rely on the canvas behavior
          // But the best way is often unityInstance.SendMessage if they have a script for it,
          // or setting the canvas tabindex. 
          
          setIsLoaded(true);
          if (onCanvasReady && canvasRef.current) {
            onCanvasReady(canvasRef.current);
          }
        }).catch((message: any) => {
          console.error("Unity Load Error:", message);
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup script if needed, though Unity instances are hard to fully clean up in SPAs
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div id="unity-container" className="w-full h-full bg-transparent rounded-xl overflow-hidden relative border border-[#141414]">
      <canvas
        id="unity-canvas"
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: isLoaded ? 'block' : 'none' }}
      />

      {!isLoaded && (
        <div id="unity-loading-overlay" className="absolute inset-0 flex flex-col items-center justify-center bg-[#141414] text-[#E4E3E0] p-8">
          <div id="unity-loading-bar-container" className="w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden mb-4">
            <div
              id="unity-loading-bar-fill"
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p id="unity-loading-text" className="text-[10px] font-mono uppercase tracking-widest animate-pulse">
            Loading Unity Engine... {Math.round(progress * 100)}%
          </p>
        </div>
      )}
    </div>
  );
};
