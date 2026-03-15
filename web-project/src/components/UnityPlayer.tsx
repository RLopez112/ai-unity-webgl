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
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const buildUrl = "unity-package/Build";
    const loaderUrl = `${buildUrl}/1532026.loader.js`;
    const config = {
      arguments: [],
      dataUrl: `${buildUrl}/1532026.data.br`,
      frameworkUrl: `${buildUrl}/1532026.framework.js.br`,
      codeUrl: `${buildUrl}/1532026.wasm.br`,
      streamingAssetsUrl: "StreamingAssets",
      companyName: "DefaultCompany",
      productName: "gonzalo rosso",
      productVersion: "0.1.0",
    };

    const script = document.createElement("script");
    script.src = loaderUrl;
    script.onload = () => {
      if (canvasRef.current && window.createUnityInstance) {
        window.createUnityInstance(canvasRef.current, config, (p: number) => {
          setProgress(p);
        }).then((unityInstance: any) => {
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
    <div id="unity-container" className="w-full h-full bg-black rounded-xl overflow-hidden relative border border-[#141414]">
      <canvas
        id="unity-canvas"
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: isLoaded ? 'block' : 'none' }}
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141414] text-[#E4E3E0] p-8">
          <div className="w-full max-w-xs h-1 bg-white/10 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest animate-pulse">
            Loading Unity Engine... {Math.round(progress * 100)}%
          </p>
        </div>
      )}
    </div>
  );
};
