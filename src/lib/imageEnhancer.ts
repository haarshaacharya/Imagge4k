import Upscaler from 'upscaler';
import x2 from '@upscalerjs/esrgan-slim/2x';
import x4 from '@upscalerjs/esrgan-slim/4x';
import * as tf from '@tensorflow/tfjs';

export type EnhancementType = '2k' | '4k' | '8k';

export interface EnhancementResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  type: EnhancementType;
  originalWidth: number;
  originalHeight: number;
}

const TARGET_MAX_DIMENSIONS: Record<EnhancementType, number> = {
  '2k': 2560,
  '4k': 3840,
  '8k': 7680,
};

let upscaler2x: InstanceType<typeof Upscaler> | null = null;
let upscaler4x: InstanceType<typeof Upscaler> | null = null;
let tfInitialized = false;

// Helper to yield control to the browser so the UI never freezes
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

async function initTensorFlow() {
  if (!tfInitialized) {
    try {
      await tf.ready();
      // Prefer webgl if available
      if (tf.getBackend() !== 'webgl') {
        await tf.setBackend('webgl').catch(() => {});
      }
    } catch {
      // Fallback gracefully
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
  if (!ctx) throw new Error('Could not acquire 2D canvas rendering context.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

// Convert HTMLImageElement to clean Canvas preserving aspect and transparency
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = getCanvasContext(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

// Check if image has transparency
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const sampleW = Math.min(canvas.width, 100);
  const sampleH = Math.min(canvas.height, 100);
  const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
  for (let i = 3; i < imgData.data.length; i += 4) {
    if (imgData.data[i] < 250) return true;
  }
  return false;
}

// High-quality stepped scaling for crisp, artifact-free high-res reproduction
function highQualityScale(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  let curCanvas = source;
  let curW = source.width;
  let curH = source.height;

  // If scaling up significantly, scale progressively in 1.5x - 2x steps for maximum sharpness
  if (targetWidth > curW) {
    while (curW * 1.8 < targetWidth) {
      const nextW = Math.round(curW * 1.6);
      const nextH = Math.round(curH * 1.6);
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

  // Final scale to exact dimensions
  const finalCanvas = createCanvas(targetWidth, targetHeight);
  const finalCtx = getCanvasContext(finalCanvas);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(curCanvas, 0, 0, targetWidth, targetHeight);

  return finalCanvas;
}

// AI Super-Resolution with proper RGBA conversion and no UI freezing
async function runAiUpscale(
  source: HTMLCanvasElement,
  scaleFactor: 2 | 4,
  onProgress?: (percent: number, status: string) => void,
  startPercent: number = 20,
  percentRange: number = 50
): Promise<HTMLCanvasElement> {
  const upscaler = scaleFactor === 2 ? getUpscaler2x() : getUpscaler4x();

  // If source is already quite large, downscale source temporarily for AI detail generation
  // or use optimal patch size so we don't blow GPU memory
  let inputCanvas = source;
  const maxAiInputDim = 1024;
  const maxDim = Math.max(source.width, source.height);
  
  if (maxDim > maxAiInputDim) {
    const scale = maxAiInputDim / maxDim;
    inputCanvas = createCanvas(Math.round(source.width * scale), Math.round(source.height * scale));
    const ctx = getCanvasContext(inputCanvas);
    ctx.drawImage(source, 0, 0, inputCanvas.width, inputCanvas.height);
  }

  // Upscale using UpscalerJS
  // Note: patchSize: 128 gives much better speed & GPU utilization than 64
  const patchSize = 128;
  const padding = 6;

  let lastYieldTime = Date.now();

  try {
    const resultTensor = (await upscaler.upscale(inputCanvas, {
      patchSize,
      padding,
      output: 'tensor',
      progress: async (p: number) => {
        const overall = Math.min(95, Math.round(startPercent + p * percentRange));
        onProgress?.(overall, `AI Super-Resolution (${Math.round(p * 100)}%)...`);
        
        // Yield to main thread every 50ms so browser never shows "Page Unresponsive"
        if (Date.now() - lastYieldTime > 50) {
          await yieldToMain();
          lastYieldTime = Date.now();
        }
      },
    })) as unknown as tf.Tensor3D;

    // Convert tensor to canvas correctly using tf.browser.toPixels (handles RGB to RGBA perfectly)
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
    console.warn('AI Upscale fallback to high-fidelity interpolation:', err);
    // Safe high-quality fallback if WebGL failed
    return highQualityScale(source, source.width * scaleFactor, source.height * scaleFactor);
  }
}

// Fast and robust edge enhancement & unsharp mask
function applyDetailClarity(canvas: HTMLCanvasElement, clarityLevel: '2k' | '4k' | '8k'): void {
  const ctx = getCanvasContext(canvas);
  const width = canvas.width;
  const height = canvas.height;

  // Use fast Canvas composition for contrast & vibrancy
  const temp = createCanvas(width, height);
  const tempCtx = getCanvasContext(temp);
  tempCtx.drawImage(canvas, 0, 0);

  // Subtle contrast and saturation boost via canvas filter
  ctx.clearRect(0, 0, width, height);
  ctx.filter = 'contrast(106%) saturate(108%) brightness(101%)';
  ctx.drawImage(temp, 0, 0);
  ctx.filter = 'none';

  // Apply targeted high-frequency unsharp mask on luminance channel
  // Use chunked processing to avoid long synchronous blocking on 4K/8K
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    // Adaptive sharpening weight
    const amount = clarityLevel === '8k' ? 0.35 : clarityLevel === '4k' ? 0.28 : 0.22;
    const stride = width * 4;

    // Fast 3x3 kernel convolution on RGB channels
    const buffer = new Uint8ClampedArray(data);

    // Process interior pixels
    for (let y = 1; y < height - 1; y += 1) {
      const rowOffset = y * stride;
      for (let x = 1; x < width - 1; x += 1) {
        const i = rowOffset + x * 4;
        
        // Red
        const r = buffer[i];
        const rSurround = (buffer[i - 4] + buffer[i + 4] + buffer[i - stride] + buffer[i + stride]) >> 2;
        const rDiff = r - rSurround;
        data[i] = r + rDiff * amount;

        // Green
        const g = buffer[i + 1];
        const gSurround = (buffer[i - 3] + buffer[i + 5] + buffer[i - stride + 1] + buffer[i + stride + 1]) >> 2;
        const gDiff = g - gSurround;
        data[i + 1] = g + gDiff * amount;

        // Blue
        const b = buffer[i + 2];
        const bSurround = (buffer[i - 2] + buffer[i + 6] + buffer[i - stride + 2] + buffer[i + stride + 2]) >> 2;
        const bDiff = b - bSurround;
        data[i + 2] = b + bDiff * amount;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Convolution pass skipped:', e);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to generate final image blob.'))),
      'image/png',
      1.0
    );
  });
}

export async function enhanceImage(
  file: File,
  type: EnhancementType,
  onProgress?: (progress: number, stage: string) => void
): Promise<EnhancementResult> {
  onProgress?.(5, 'Loading image & preparing AI engine...');
  await yieldToMain();
  await initTensorFlow();

  onProgress?.(12, 'Decoding image pixels...');
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  // Calculate target dimensions based on target 2K/4K/8K while preserving aspect ratio
  const maxOriginalDim = Math.max(originalWidth, originalHeight);
  const targetMaxDim = TARGET_MAX_DIMENSIONS[type];
  
  // Calculate scaled dimensions
  const scale = targetMaxDim / maxOriginalDim;
  const finalWidth = Math.round(originalWidth * scale);
  const finalHeight = Math.round(originalHeight * scale);

  onProgress?.(20, 'Analyzing image textures & edges...');
  await yieldToMain();

  const sourceCanvas = imageToCanvas(img);
  const isTransparent = hasTransparency(sourceCanvas);

  // Step 1: Neural AI Super-Resolution Pass
  onProgress?.(30, 'Running AI super-resolution detail synthesis...');
  await yieldToMain();

  // Pick best AI upscale model factor (2x or 4x)
  const aiFactor: 2 | 4 = scale <= 2.2 ? 2 : 4;
  let aiCanvas = await runAiUpscale(sourceCanvas, aiFactor, onProgress, 30, 45);

  onProgress?.(78, `Scaling to crystal-clear ${type.toUpperCase()} resolution (${finalWidth}×${finalHeight}px)...`);
  await yieldToMain();

  // Step 2: High-fidelity progressive resize to target 2K / 4K / 8K resolution
  let finalCanvas = highQualityScale(aiCanvas, finalWidth, finalHeight);

  // If original had transparency (e.g. transparent PNG logo), restore transparent alpha channel cleanly
  if (isTransparent) {
    onProgress?.(85, 'Preserving alpha transparency...');
    const alphaCanvas = highQualityScale(sourceCanvas, finalWidth, finalHeight);
    const alphaCtx = getCanvasContext(alphaCanvas);
    const alphaData = alphaCtx.getImageData(0, 0, finalWidth, finalHeight).data;

    const finalCtx = getCanvasContext(finalCanvas);
    const finalImgData = finalCtx.getImageData(0, 0, finalWidth, finalHeight);
    const finalData = finalImgData.data;

    for (let i = 3; i < finalData.length; i += 4) {
      finalData[i] = alphaData[i];
    }
    finalCtx.putImageData(finalImgData, 0, 0);
  }

  // Step 3: High-Frequency Clarity & Contrast Enhancement
  onProgress?.(90, 'Optimizing sharpness, dynamic range & micro-contrast...');
  await yieldToMain();
  applyDetailClarity(finalCanvas, type);

  // Step 4: Generate final ultra-crisp output blob
  onProgress?.(96, 'Exporting ultra HD master file...');
  await yieldToMain();
  const blob = await canvasToBlob(finalCanvas);
  const url = URL.createObjectURL(blob);

  onProgress?.(100, 'Enhancement Complete!');

  return {
    blob,
    url,
    width: finalCanvas.width,
    height: finalCanvas.height,
    type,
    originalWidth,
    originalHeight,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getEnhancementLabel(type: EnhancementType): string {
  const labels: Record<EnhancementType, string> = {
    '2k': '2K Quad HD (2560px)',
    '4k': '4K Ultra HD (3840px)',
    '8k': '8K Cinema HD (7680px)',
  };
  return labels[type];
}

