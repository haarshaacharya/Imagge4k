import Upscaler from 'upscaler';
import x2 from '@upscalerjs/esrgan-slim/2x';
import x4 from '@upscalerjs/esrgan-slim/4x';
import * as tf from '@tensorflow/tfjs';

export type EnhancementScale = '2x' | '4x' | '8x';
export type EnhancementMode = 'ultra-sharp' | 'vector-logo' | 'super-resolution' | 'face-portrait';

// Backwards compatibility
export type EnhancementType = '2k' | '4k' | '8k';

export interface EnhancementOptions {
  scale: EnhancementScale;
  mode: EnhancementMode;
  enhanceQuality?: boolean;
  sharpness?: number; // 0 to 100
  denoise?: boolean;
}

export interface EnhancementResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  scale: EnhancementScale;
  mode: EnhancementMode;
  originalWidth: number;
  originalHeight: number;
  type: EnhancementType;
}

let upscaler2x: InstanceType<typeof Upscaler> | null = null;
let upscaler4x: InstanceType<typeof Upscaler> | null = null;
let tfInitialized = false;

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

async function initTensorFlow() {
  if (!tfInitialized) {
    try {
      await tf.ready();
      if (tf.getBackend() !== 'webgl') {
        await tf.setBackend('webgl').catch(() => {});
      }
    } catch {
      // Fallback
    }
    tfInitialized = true;
  }
}

function getUpscaler2x(): InstanceType<typeof Upscaler> {
  if (!upscaler2x) {
    upscaler2x = new Upscaler({ model: x2 });
  }
  return upscaler2x;
}

function getUpscaler4x(): InstanceType<typeof Upscaler> {
  if (!upscaler4x) {
    upscaler4x = new Upscaler({ model: x4 });
  }
  return upscaler4x;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file.'));
    };
    img.src = url;
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not acquire 2D canvas context.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = getCanvasContext(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const sampleW = Math.min(canvas.width, 80);
  const sampleH = Math.min(canvas.height, 80);
  const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
  for (let i = 3; i < imgData.data.length; i += 4) {
    if (imgData.data[i] < 250) return true;
  }
  return false;
}

// Progressive stepped scale for high-fidelity interpolation
function progressiveScale(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  let curCanvas = source;
  let curW = source.width;
  let curH = source.height;

  if (targetWidth > curW) {
    while (curW * 1.6 < targetWidth) {
      const nextW = Math.round(curW * 1.5);
      const nextH = Math.round(curH * 1.5);
      const stepCanvas = createCanvas(nextW, nextH);
      const stepCtx = getCanvasContext(stepCanvas);
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(curCanvas, 0, 0, nextW, nextH);
      curCanvas = stepCanvas;
      curW = nextW;
      curH = nextH;
    }
  }

  const finalCanvas = createCanvas(targetWidth, targetHeight);
  const finalCtx = getCanvasContext(finalCanvas);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(curCanvas, 0, 0, targetWidth, targetHeight);

  return finalCanvas;
}

// -------------------------------------------------------------
// 1. Color-Safe Luminance-Only Ultra Sharpening & Micro-Contrast
// Transforms blurry edges & specular bevels into razor-sharp lines
// without ANY color distortion or artifacts
// -------------------------------------------------------------
export function applyLuminanceEdgeSharpening(
  canvas: HTMLCanvasElement,
  sharpnessPercentage: number = 85,
  mode: EnhancementMode = 'ultra-sharp'
): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const stride = w * 4;

  const strength = Math.max(0.1, Math.min(1.0, sharpnessPercentage / 100));
  const isGraphicMode = mode === 'ultra-sharp' || mode === 'vector-logo';
  const sharpAmount = isGraphicMode ? 0.75 * strength : 0.45 * strength;

  // Extract luminance map
  const lumMap = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yOff = y * stride;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const idx = yOff + x * 4;
      // Standard Rec. 709 luminance
      lumMap[rowOff + x] = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    }
  }

  // Multi-pass adaptive luminance convolution
  for (let y = 1; y < h - 1; y++) {
    const yOff = y * stride;
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = yOff + x * 4;
      const lIdx = rowOff + x;

      const lC = lumMap[lIdx];
      const lU = lumMap[lIdx - w];
      const lD = lumMap[lIdx + w];
      const lL = lumMap[lIdx - 1];
      const lR = lumMap[lIdx + 1];

      // Cardinal Laplacian
      const lap = lU + lD + lL + lR - 4 * lC;

      // Diagonal neighbors
      const lUL = lumMap[lIdx - w - 1];
      const lUR = lumMap[lIdx - w + 1];
      const lDL = lumMap[lIdx + w - 1];
      const lDR = lumMap[lIdx + w + 1];
      const diagLap = (lUL + lUR + lDL + lDR) * 0.5 - 2 * lC;

      // Combined high-pass delta
      const delta = -(lap + diagLap * 0.5);

      // Local min/max bounding to guarantee zero halos
      const minN = Math.min(lC, lU, lD, lL, lR, lUL, lUR, lDL, lDR);
      const maxN = Math.max(lC, lU, lD, lL, lR, lUL, lUR, lDL, lDR);

      // Desired sharp luminance bounded strictly
      let targetLum = lC + delta * sharpAmount;
      targetLum = Math.max(minN, Math.min(maxN, targetLum));

      if (lC > 0.01) {
        const ratio = targetLum / lC;
        // Scale RGB proportionally so color / hue never shifts
        data[idx] = Math.min(255, Math.max(0, Math.round(data[idx] * ratio)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(data[idx + 1] * ratio)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(data[idx + 2] * ratio)));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 2. High-Frequency Ridge & Micro-Specular Polish
// Enhances thin highlights and ridges cleanly
// -------------------------------------------------------------
export function applySpecularPolish(canvas: HTMLCanvasElement, amount: number = 0.35): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const stride = w * 4;

  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yOff = y * stride;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const idx = yOff + x * 4;
      lum[rowOff + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  for (let y = 1; y < h - 1; y++) {
    const yOff = y * stride;
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = yOff + x * 4;
      const lIdx = rowOff + x;
      const lC = lum[lIdx];

      if (lC > 40) {
        const lU = lum[lIdx - w];
        const lD = lum[lIdx + w];
        const lL = lum[lIdx - 1];
        const lR = lum[lIdx + 1];

        const d2x = lL + lR - 2 * lC;
        const d2y = lU + lD - 2 * lC;

        if (d2x < -4 || d2y < -4) {
          const ridge = Math.max(0, -Math.min(d2x, d2y));
          const factor = 1 + (ridge / 255) * amount;

          data[idx] = Math.min(255, Math.round(data[idx] * factor));
          data[idx + 1] = Math.min(255, Math.round(data[idx + 1] * factor));
          data[idx + 2] = Math.min(255, Math.round(data[idx + 2] * factor));
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 3. Neural AI Super-Resolution (ESRGAN)
// Generates genuine high-resolution texture details with WebGL
// -------------------------------------------------------------
async function runNeuralSuperResolution(
  source: HTMLCanvasElement,
  scaleFactor: 2 | 4,
  onProgress?: (percent: number, status: string) => void,
  startPercent: number = 25,
  percentRange: number = 50
): Promise<HTMLCanvasElement> {
  const upscaler = scaleFactor === 2 ? getUpscaler2x() : getUpscaler4x();
  const patchSize = 128;
  const padding = 8;
  let lastYieldTime = Date.now();

  try {
    const resultTensor = (await upscaler.upscale(source, {
      patchSize,
      padding,
      output: 'tensor',
      progress: async (p: number) => {
        const overall = Math.min(95, Math.round(startPercent + p * percentRange));
        onProgress?.(overall, `Neural Super-Resolution (${Math.round(p * 100)}%)...`);

        if (Date.now() - lastYieldTime > 50) {
          await yieldToMain();
          lastYieldTime = Date.now();
        }
      },
    })) as unknown as tf.Tensor3D;

    const outHeight = resultTensor.shape[0];
    const outWidth = resultTensor.shape[1];
    const outCanvas = createCanvas(outWidth, outHeight);

    await tf.browser.toPixels(
      tf.tidy(() => tf.clipByValue(resultTensor, 0, 255).cast('int32') as tf.Tensor3D),
      outCanvas
    );

    resultTensor.dispose();
    return outCanvas;
  } catch (err) {
    console.warn('Neural upscale fallback to high-fidelity progressive scale:', err);
    return progressiveScale(source, source.width * scaleFactor, source.height * scaleFactor);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to export final image.'))),
      'image/png',
      1.0
    );
  });
}

// -------------------------------------------------------------
// Main Enhancement Function
// -------------------------------------------------------------
export async function enhanceImage(
  file: File,
  optionsOrType: EnhancementScale | EnhancementType | EnhancementOptions,
  onProgress?: (progress: number, stage: string) => void
): Promise<EnhancementResult> {
  let options: EnhancementOptions;
  if (typeof optionsOrType === 'string') {
    const scaleMap: Record<string, EnhancementScale> = {
      '2k': '2x',
      '4k': '4x',
      '8k': '8x',
      '2x': '2x',
      '4x': '4x',
      '8x': '8x',
    };
    options = {
      scale: scaleMap[optionsOrType] || '4x',
      mode: 'ultra-sharp',
      enhanceQuality: true,
      sharpness: 85,
      denoise: true,
    };
  } else {
    options = {
      enhanceQuality: true,
      sharpness: 85,
      denoise: true,
      ...optionsOrType,
    };
  }

  const { scale, mode = 'ultra-sharp', sharpness = 85 } = options;

  onProgress?.(5, 'Initializing Neural AI Super-Resolution Engine...');
  await yieldToMain();
  await initTensorFlow();

  onProgress?.(12, 'Decoding image pixels...');
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  const multiplier = scale === '8x' ? 8 : scale === '4x' ? 4 : 2;
  const finalWidth = Math.round(originalWidth * multiplier);
  const finalHeight = Math.round(originalHeight * multiplier);

  const sourceCanvas = imageToCanvas(img);
  const isTransparent = hasTransparency(sourceCanvas);

  // Step 1: Neural AI Super-Resolution Pass (ESRGAN 4x / 2x)
  // This generates the actual high-resolution details and sharp contours cleanly
  onProgress?.(25, 'Running Neural Super-Resolution synthesis...');
  await yieldToMain();

  const aiScaleFactor: 2 | 4 = multiplier >= 4 ? 4 : 2;
  const aiCanvas = await runNeuralSuperResolution(
    sourceCanvas,
    aiScaleFactor,
    onProgress,
    25,
    55
  );

  let masterCanvas: HTMLCanvasElement;
  if (aiCanvas.width !== finalWidth || aiCanvas.height !== finalHeight) {
    onProgress?.(80, `Refining master ${scale.toUpperCase()} resolution (${finalWidth}×${finalHeight}px)...`);
    await yieldToMain();
    masterCanvas = progressiveScale(aiCanvas, finalWidth, finalHeight);
  } else {
    masterCanvas = aiCanvas;
  }

  // Step 2: Color-Safe Luminance Edge & Specular Sharpening
  onProgress?.(88, 'Polishing razor-sharp edges & specular clarity...');
  await yieldToMain();
  applyLuminanceEdgeSharpening(masterCanvas, sharpness, mode);

  if (mode === 'ultra-sharp' || mode === 'vector-logo') {
    applySpecularPolish(masterCanvas, 0.4);
  }

  // Step 3: Alpha Channel Preservation (for transparent logos)
  if (isTransparent) {
    onProgress?.(93, 'Preserving alpha transparency channel...');
    const alphaCanvas = progressiveScale(sourceCanvas, finalWidth, finalHeight);
    const alphaCtx = getCanvasContext(alphaCanvas);
    const alphaData = alphaCtx.getImageData(0, 0, finalWidth, finalHeight).data;

    const finalCtx = getCanvasContext(masterCanvas);
    const finalImgData = finalCtx.getImageData(0, 0, finalWidth, finalHeight);
    const finalData = finalImgData.data;

    for (let i = 3; i < finalData.length; i += 4) {
      finalData[i] = alphaData[i];
    }
    finalCtx.putImageData(finalImgData, 0, 0);
  }

  // Step 4: Export Master PNG
  onProgress?.(97, 'Exporting pristine Ultra HD image...');
  await yieldToMain();
  const blob = await canvasToBlob(masterCanvas);
  const url = URL.createObjectURL(blob);

  onProgress?.(100, 'Enhancement Complete!');

  const typeCompat: EnhancementType = scale === '8x' ? '8k' : scale === '4x' ? '4k' : '2k';

  return {
    blob,
    url,
    width: masterCanvas.width,
    height: masterCanvas.height,
    scale,
    mode,
    originalWidth,
    originalHeight,
    type: typeCompat,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getEnhancementLabel(scale: EnhancementScale | EnhancementType): string {
  const labels: Record<string, string> = {
    '2x': '2K Quad HD (2×)',
    '4x': '4K Ultra HD (4×)',
    '8x': '8K Cinema Master (8×)',
    '2k': '2K Quad HD (2×)',
    '4k': '4K Ultra HD (4×)',
    '8k': '8K Cinema Master (8×)',
  };
  return labels[scale] || '4K Ultra HD';
}

export function getModeLabel(mode: EnhancementMode): { title: string; subtitle: string; icon: string } {
  const map: Record<EnhancementMode, { title: string; subtitle: string; icon: string }> = {
    'ultra-sharp': {
      title: 'Ultra Sharp Studio',
      subtitle: 'Neural Super-Resolution & Razor Edges',
      icon: 'zap',
    },
    'vector-logo': {
      title: 'Vector & Logo Graphic',
      subtitle: 'Anti-aliased curves & text sharpness',
      icon: 'shapes',
    },
    'super-resolution': {
      title: 'Super Resolution',
      subtitle: 'Photos, landscapes & real textures',
      icon: 'sparkles',
    },
    'face-portrait': {
      title: 'Portrait & Face',
      subtitle: 'Skin, eyes, hair & facial depth',
      icon: 'user',
    },
  };
  return map[mode] || map['ultra-sharp'];
}
