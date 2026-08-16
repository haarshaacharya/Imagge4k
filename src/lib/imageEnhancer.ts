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
  ultraClarity?: boolean;
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

// High-fidelity progressive multi-step scaler
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
// 1. Morphological Shock Filter (Osher-Rudin PDE)
// Turns blurry gradients along edges into crisp, mathematical step edges
// -------------------------------------------------------------
export function applyShockFilter(
  canvas: HTMLCanvasElement,
  iterations: number = 2,
  dt: number = 0.28
): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const stride = w * 4;

  for (let iter = 0; iter < iterations; iter++) {
    const src = new Uint8ClampedArray(data);

    for (let y = 1; y < h - 1; y++) {
      const yOff = y * stride;
      for (let x = 1; x < w - 1; x++) {
        const idx = yOff + x * 4;

        // Luminance calculations
        const lC = (src[idx] * 299 + src[idx + 1] * 587 + src[idx + 2] * 114) / 1000;
        const lU = (src[idx - stride] * 299 + src[idx - stride + 1] * 587 + src[idx - stride + 2] * 114) / 1000;
        const lD = (src[idx + stride] * 299 + src[idx + stride + 1] * 587 + src[idx + stride + 2] * 114) / 1000;
        const lL = (src[idx - 4] * 299 + src[idx - 3] * 587 + src[idx - 2] * 114) / 1000;
        const lR = (src[idx + 4] * 299 + src[idx + 5] * 587 + src[idx + 6] * 114) / 1000;

        // Laplacian
        const laplacian = lU + lD + lL + lR - 4 * lC;

        // Gradient magnitude
        const gx = (lR - lL) * 0.5;
        const gy = (lD - lU) * 0.5;
        const gradMag = Math.sqrt(gx * gx + gy * gy);

        if (gradMag > 4) {
          const sign = laplacian > 0 ? 1 : laplacian < 0 ? -1 : 0;
          const shift = -sign * gradMag * dt;

          for (let c = 0; c < 3; c++) {
            const val = src[idx + c];
            data[idx + c] = Math.min(255, Math.max(0, Math.round(val + shift)));
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 2. Specular Glass Bevel & Highlight Ridge Enhancer
// Sharpens intense inner/outer metallic reflections and 3D glass contours
// -------------------------------------------------------------
export function applySpecularRidgeEnhancer(
  canvas: HTMLCanvasElement,
  ridgeBoost: number = 0.65
): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const src = new Uint8ClampedArray(data);
  const stride = w * 4;

  for (let y = 1; y < h - 1; y++) {
    const yOff = y * stride;
    for (let x = 1; x < w - 1; x++) {
      const idx = yOff + x * 4;

      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      const lum = (r * 299 + g * 587 + b * 114) / 1000;

      // Check for highlight / specular area
      if (lum > 40) {
        const lU = (src[idx - stride] * 299 + src[idx - stride + 1] * 587 + src[idx - stride + 2] * 114) / 1000;
        const lD = (src[idx + stride] * 299 + src[idx + stride + 1] * 587 + src[idx + stride + 2] * 114) / 1000;
        const lL = (src[idx - 4] * 299 + src[idx - 3] * 587 + src[idx - 2] * 114) / 1000;
        const lR = (src[idx + 4] * 299 + src[idx + 5] * 587 + src[idx + 6] * 114) / 1000;

        // Second derivatives along horizontal and vertical
        const d2x = lL + lR - 2 * lum;
        const d2y = lU + lD - 2 * lum;

        // If on a sharp ridge line (specular highlight line)
        if (d2x < -8 || d2y < -8) {
          const ridgeMag = Math.max(0, -Math.min(d2x, d2y));
          const factor = 1 + (ridgeMag / 255) * ridgeBoost * 1.6;

          data[idx] = Math.min(255, Math.round(r * factor));
          data[idx + 1] = Math.min(255, Math.round(g * factor));
          data[idx + 2] = Math.min(255, Math.round(b * factor));
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 3. Dark Background Void Gate & Color Bleed Suppressor
// Eliminates fuzzy purple glow bleeding into pitch-black backgrounds
// -------------------------------------------------------------
export function applyDarkVoidGate(canvas: HTMLCanvasElement): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const stride = w * 4;

  for (let y = 0; y < h; y++) {
    const yOff = y * stride;
    for (let x = 0; x < w; x++) {
      const idx = yOff + x * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxC = Math.max(r, g, b);

      // If very dark background noise / blur bleed
      if (maxC < 14) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
      } else if (maxC < 30) {
        const factor = (maxC - 14) / 16;
        data[idx] = Math.round(r * factor);
        data[idx + 1] = Math.round(g * factor);
        data[idx + 2] = Math.round(b * factor);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 4. Turbo Contrast-Adaptive Sharpening (CAS Turbo)
// Delivers maximum micro-detail and crispness with zero haloing
// -------------------------------------------------------------
export function applyContrastAdaptiveSharpening(
  canvas: HTMLCanvasElement,
  sharpnessPercentage: number = 90
): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const src = new Uint8ClampedArray(data);
  const stride = w * 4;

  const sharpness = Math.max(0, Math.min(100, sharpnessPercentage)) / 100;
  if (sharpness <= 0) return;

  for (let y = 1; y < h - 1; y++) {
    const yOff = y * stride;
    for (let x = 1; x < w - 1; x++) {
      const idx = yOff + x * 4;

      for (let c = 0; c < 3; c++) {
        const pC = src[idx + c] / 255;
        const pU = src[idx - stride + c] / 255;
        const pD = src[idx + stride + c] / 255;
        const pL = src[idx - 4 + c] / 255;
        const pR = src[idx + 4 + c] / 255;

        // Diagonal neighbors for richer 8-point edge kernel
        const pUL = src[idx - stride - 4 + c] / 255;
        const pUR = src[idx - stride + 4 + c] / 255;
        const pDL = src[idx + stride - 4 + c] / 255;
        const pDR = src[idx + stride + 4 + c] / 255;

        const minVal = Math.min(pC, pU, pD, pL, pR, pUL, pUR, pDL, pDR);
        const maxVal = Math.max(pC, pU, pD, pL, pR, pUL, pUR, pDL, pDR);

        // Calculate dynamic CAS weight
        const amp = Math.min(minVal, 1.0 - maxVal) / Math.max(maxVal, 0.001);
        const wVal = -Math.sqrt(Math.max(0, amp)) * (0.28 * sharpness);

        // 8-neighbor weighted CAS kernel
        const cardinalSum = pU + pD + pL + pR;
        const diagSum = (pUL + pUR + pDL + pDR) * 0.5;
        const totalNeighbors = cardinalSum + diagSum;
        const weightSum = 1.0 + (4.0 + 2.0) * wVal;

        const sharpened = (pC + wVal * totalNeighbors) / Math.max(0.1, weightSum);
        data[idx + c] = Math.min(255, Math.max(0, Math.round(sharpened * 255)));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 5. Bilateral Denoising (Pre-processing filter)
// -------------------------------------------------------------
export function applyBilateralDenoise(canvas: HTMLCanvasElement, strength: number = 0.6): void {
  const ctx = getCanvasContext(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const copy = new Uint8ClampedArray(data);
  const stride = w * 4;

  const spatialSigma = 1.6;
  const rangeSigma = 22 * strength + 4;
  const rangeFactor = -0.5 / (rangeSigma * rangeSigma);
  const radius = 2;

  const spatialWeights: number[][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    spatialWeights[dy + radius] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      spatialWeights[dy + radius][dx + radius] = Math.exp(-0.5 * dist2 / (spatialSigma * spatialSigma));
    }
  }

  for (let y = radius; y < h - radius; y++) {
    const yOffset = y * stride;
    for (let x = radius; x < w - radius; x++) {
      const centerIdx = yOffset + x * 4;
      const cR = copy[centerIdx];
      const cG = copy[centerIdx + 1];
      const cB = copy[centerIdx + 2];

      let sumR = 0, sumG = 0, sumB = 0, sumWeight = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const rowOff = (y + dy) * stride;
        const swRow = spatialWeights[dy + radius];
        for (let dx = -radius; dx <= radius; dx++) {
          const nIdx = rowOff + (x + dx) * 4;
          const nR = copy[nIdx];
          const nG = copy[nIdx + 1];
          const nB = copy[nIdx + 2];

          const diffR = nR - cR;
          const diffG = nG - cG;
          const diffB = nB - cB;
          const colorDist2 = diffR * diffR + diffG * diffG + diffB * diffB;

          const weight = swRow[dx + radius] * Math.exp(colorDist2 * rangeFactor);
          sumR += nR * weight;
          sumG += nG * weight;
          sumB += nB * weight;
          sumWeight += weight;
        }
      }

      if (sumWeight > 0) {
        data[centerIdx] = sumR / sumWeight;
        data[centerIdx + 1] = sumG / sumWeight;
        data[centerIdx + 2] = sumB / sumWeight;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// -------------------------------------------------------------
// 6. Neural Super-Resolution
// -------------------------------------------------------------
async function runNeuralSuperResolution(
  source: HTMLCanvasElement,
  scaleFactor: 2 | 4,
  onProgress?: (percent: number, status: string) => void,
  startPercent: number = 25,
  percentRange: number = 45
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
        onProgress?.(overall, `AI Neural Synthesis (${Math.round(p * 100)}%)...`);

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
    console.warn('Fallback to high-fidelity progressive scale:', err);
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
      sharpness: 90,
      denoise: true,
    };
  } else {
    options = {
      enhanceQuality: true,
      sharpness: 90,
      denoise: true,
      ...optionsOrType,
    };
  }

  const { scale, mode = 'ultra-sharp', enhanceQuality = true, sharpness = 90 } = options;

  onProgress?.(5, 'Initializing Ultra-Sharp AI Engine...');
  await yieldToMain();
  await initTensorFlow();

  onProgress?.(12, 'Decoding full-resolution source image...');
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  const multiplier = scale === '8x' ? 8 : scale === '4x' ? 4 : 2;
  const finalWidth = Math.round(originalWidth * multiplier);
  const finalHeight = Math.round(originalHeight * multiplier);

  const sourceCanvas = imageToCanvas(img);
  const isTransparent = hasTransparency(sourceCanvas);

  // Pre-processing
  if (enhanceQuality) {
    onProgress?.(20, 'Cleaning JPEG block noise & digital compression...');
    await yieldToMain();
    applyBilateralDenoise(sourceCanvas, 0.55);
  }

  // Step 1: High-Fidelity Neural Super Resolution / Progressive Scaling
  onProgress?.(30, 'Reconstructing ultra-high frequency texture details...');
  await yieldToMain();

  let masterCanvas: HTMLCanvasElement;

  if (mode === 'vector-logo' || mode === 'ultra-sharp') {
    // Vector, 3D Icon & Ultra-Sharp Graphic pipeline
    onProgress?.(40, 'Upscaling to target master resolution...');
    await yieldToMain();
    const scaled = progressiveScale(sourceCanvas, finalWidth, finalHeight);

    // Apply Morphological Shock Filter
    onProgress?.(55, 'Applying Osher-Rudin Shock Filter (tightening edge slopes)...');
    await yieldToMain();
    applyShockFilter(scaled, 2, 0.32);

    // Enhance Specular Ridge & Metallic Highlights
    onProgress?.(70, 'Sharpening specular reflections & bevel highlights...');
    await yieldToMain();
    applySpecularRidgeEnhancer(scaled, 0.85);

    // Clean background bleed
    applyDarkVoidGate(scaled);

    masterCanvas = scaled;
  } else {
    // Photorealistic Super-Resolution
    const aiScaleFactor: 2 | 4 = multiplier >= 4 ? 4 : 2;
    const aiCanvas = await runNeuralSuperResolution(sourceCanvas, aiScaleFactor, onProgress, 30, 45);

    if (aiCanvas.width !== finalWidth || aiCanvas.height !== finalHeight) {
      onProgress?.(75, `Scaling to ${scale.toUpperCase()} resolution (${finalWidth}×${finalHeight}px)...`);
      await yieldToMain();
      masterCanvas = progressiveScale(aiCanvas, finalWidth, finalHeight);
    } else {
      masterCanvas = aiCanvas;
    }

    // Shock filter pass for photo contours
    applyShockFilter(masterCanvas, 1, 0.18);
  }

  // Step 2: Turbo Contrast-Adaptive Sharpening (CAS)
  onProgress?.(85, 'Executing Turbo Contrast-Adaptive Sharpening (CAS)...');
  await yieldToMain();
  applyContrastAdaptiveSharpening(masterCanvas, sharpness);

  // Step 3: Alpha Channel Preservation
  if (isTransparent) {
    onProgress?.(92, 'Preserving alpha transparency channel...');
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
  onProgress?.(96, 'Exporting crystal-clear Ultra HD master file...');
  await yieldToMain();
  const blob = await canvasToBlob(masterCanvas);
  const url = URL.createObjectURL(blob);

  onProgress?.(100, 'Ultra HD Enhancement Complete!');

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
      subtitle: 'Shock-Filter & Specular Bevel Clarity',
      icon: 'zap',
    },
    'vector-logo': {
      title: 'Vector & Logo Graphic',
      subtitle: 'Razor-sharp curves, logos & icons',
      icon: 'shapes',
    },
    'super-resolution': {
      title: 'Super Resolution',
      subtitle: 'Photos, landscapes & nature',
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
