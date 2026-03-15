export const applySobelFilter = (imageBase64: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const width = img.width;
      const height = img.height;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject('No 2d context available');
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      const grayscale = new Float32Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        // Luminance
        grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      
      const sobelData = new Uint8ClampedArray(data.length);
      const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let pixelX = 0;
          let pixelY = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const val = grayscale[(y + ky) * width + (x + kx)];
              const weightX = kernelX[(ky + 1) * 3 + (kx + 1)];
              const weightY = kernelY[(ky + 1) * 3 + (kx + 1)];
              
              pixelX += val * weightX;
              pixelY += val * weightY;
            }
          }
          
          const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
          const i = (y * width + x) * 4;
          
          const clamp = Math.min(255, magnitude);
          sobelData[i] = clamp;     // R
          sobelData[i + 1] = clamp; // G
          sobelData[i + 2] = clamp; // B
          sobelData[i + 3] = 255;   // Alpha
        }
      }
      
      // Handle borders
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
            const i = (y * width + x) * 4;
            sobelData[i] = 0;
            sobelData[i + 1] = 0;
            sobelData[i + 2] = 0;
            sobelData[i + 3] = 255;
          }
        }
      }
      
      const outputImageData = new ImageData(sobelData, width, height);
      ctx.putImageData(outputImageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = imageBase64;
  });
};
