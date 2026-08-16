import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Zap,
  CheckCircle2,
  ImageIcon,
  X,
  Sliders,
  Columns,
  Maximize2,
} from 'lucide-react';
import {
  enhanceImage,
  formatBytes,
  getEnhancementLabel,
  type EnhancementType,
  type EnhancementResult,
} from '@/lib/imageEnhancer';
import { supabase } from '@/lib/supabase';
import { getSessionId } from '@/lib/session';

type Stage = 'idle' | 'uploaded' | 'enhancing' | 'done' | 'error';
type ViewMode = 'slider' | 'side-by-side';

interface UploadedImage {
  file: File;
  url: string;
  width: number;
  height: number;
}

const TARGET_MAX_DIMENSIONS: Record<EnhancementType, number> = {
  '2k': 2560,
  '4k': 3840,
  '8k': 7680,
};

export default function ImageUploader() {
  const [stage, setStage] = useState<Stage>('idle');
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [enhancementType, setEnhancementType] = useState<EnhancementType>('4k');
  const [result, setResult] = useState<EnhancementResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [isZoomed, setIsZoomed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP, etc.).');
      setStage('error');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError('Image must be under 30MB.');
      setStage('error');
      return;
    }

    setError('');
    setResult(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setUploadedImage({ file, url, width: img.naturalWidth, height: img.naturalHeight });
      setStage('uploaded');
    };
    img.onerror = () => {
      setError('Failed to load image. Try another file.');
      setStage('error');
    };
    img.src = url;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleEnhance = async () => {
    if (!uploadedImage) return;
    setStage('enhancing');
    setProgress(0);
    setError('');

    try {
      const res = await enhanceImage(uploadedImage.file, enhancementType, (p, s) => {
        setProgress(p);
        setProgressStage(s);
      });
      setResult(res);
      setStage('done');

      // Log session asynchronously
      supabase
        .from('enhancement_logs')
        .insert({
          session_id: getSessionId(),
          enhancement_type: enhancementType,
          original_size: uploadedImage.file.size,
        })
        .then(({ error: logErr }) => {
          if (logErr) console.warn('Logging skipped:', logErr);
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enhancement failed. Please try again.');
      setStage('error');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `image-${enhancementType}-hd-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const reset = () => {
    if (uploadedImage) URL.revokeObjectURL(uploadedImage.url);
    if (result) URL.revokeObjectURL(result.url);
    setUploadedImage(null);
    setResult(null);
    setStage('idle');
    setProgress(0);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSliderMove = (clientX: number) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const getExpectedDimensions = (type: EnhancementType) => {
    if (!uploadedImage) return '';
    const maxDim = Math.max(uploadedImage.width, uploadedImage.height);
    const targetDim = TARGET_MAX_DIMENSIONS[type];
    const scale = targetDim / maxDim;
    const w = Math.round(uploadedImage.width * scale);
    const h = Math.round(uploadedImage.height * scale);
    return `${w} × ${h}px`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* 1. Upload Idle Stage */}
      {stage === 'idle' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-3xl border-2 border-dashed transition-all duration-300 p-12 md:p-20 text-center group ${
            dragOver
              ? 'border-brand-500 bg-brand-500/10 scale-[1.02]'
              : 'border-white/15 hover:border-brand-500/50 hover:bg-brand-500/5'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-2xl glass-brand flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-brand-500/10">
              <Upload className="w-9 h-9 text-brand-400" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-semibold text-white mb-2">
                Drop your image here to enhance
              </h3>
              <p className="text-ink-400 text-sm max-w-md mx-auto">
                Turn any blurry photo, artwork, or logo into ultra-crisp <strong className="text-brand-300">2K, 4K, or 8K</strong> resolution in seconds.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-ink-300">
              <span>Supports PNG, JPG, WebP</span>
              <span>•</span>
              <span>Up to 30MB</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Error Stage */}
      {stage === 'error' && (
        <div className="rounded-3xl glass p-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Enhancement Issue</h3>
          <p className="text-red-300 mb-6 max-w-md mx-auto text-sm">{error}</p>
          <button onClick={reset} className="btn-ghost">
            Try Again
          </button>
        </div>
      )}

      {/* 3. Uploaded & Option Selection Stage */}
      {stage === 'uploaded' && uploadedImage && (
        <div className="animate-slide-up">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            <div className="relative bg-ink-950/60 p-4">
              <img
                src={uploadedImage.url}
                alt="Uploaded preview"
                className="w-full max-h-[380px] object-contain mx-auto rounded-xl"
              />
              <div className="absolute top-6 right-6 glass-brand rounded-lg px-3 py-1.5 text-xs text-brand-200 font-medium">
                Original: {uploadedImage.width} × {uploadedImage.height}px · {formatBytes(uploadedImage.file.size)}
              </div>
              <button
                onClick={reset}
                className="absolute top-6 left-6 w-9 h-9 rounded-lg glass flex items-center justify-center hover:bg-white/10 transition"
                title="Cancel"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Select Target Quality</h3>
                <span className="text-xs text-ink-400">AI Super-Resolution Engine</span>
              </div>
              <p className="text-ink-400 text-sm mb-6">
                Choose the desired output resolution. AI detail reconstruction enhances clarity, sharpens edges, and removes blur.
              </p>

              {/* 2K / 4K / 8K Options */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {(
                  [
                    {
                      id: '2k',
                      title: '2K Quad HD',
                      sub: '2560px Max',
                      desc: 'Fast, great for Web & Socials',
                    },
                    {
                      id: '4k',
                      title: '4K Ultra HD',
                      sub: '3840px Max',
                      desc: 'Ultra Sharp & Recommended',
                      popular: true,
                    },
                    {
                      id: '8k',
                      title: '8K Cinema HD',
                      sub: '7680px Max',
                      desc: 'Maximum Detail & Posters',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setEnhancementType(opt.id)}
                    className={`relative rounded-2xl p-5 text-left transition-all duration-300 border flex flex-col justify-between ${
                      enhancementType === opt.id
                        ? 'glass-brand border-brand-500/60 shadow-lg shadow-brand-500/20 scale-[1.02]'
                        : 'glass border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    {opt.popular && (
                      <span className="absolute -top-2.5 right-3 bg-brand-600 text-white text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border border-brand-400/40">
                        Popular
                      </span>
                    )}
                    <div>
                      <div className="flex items-baseline justify-between mb-1">
                        <span
                          className={`text-xl font-display font-bold ${
                            enhancementType === opt.id ? 'text-brand-300' : 'text-white'
                          }`}
                        >
                          {opt.id.toUpperCase()}
                        </span>
                        <span className="text-xs text-brand-400 font-medium">{opt.sub}</span>
                      </div>
                      <div className="text-sm font-medium text-white/90 mb-1">{opt.title}</div>
                      <p className="text-xs text-ink-400">{opt.desc}</p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                      <span className="text-ink-400">Target size:</span>
                      <span className="font-semibold text-brand-200">
                        {getExpectedDimensions(opt.id)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleEnhance}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3.5 shadow-lg shadow-brand-500/25 cursor-pointer"
              >
                <Sparkles className="w-5 h-5 text-brand-200" />
                Enhance to {getEnhancementLabel(enhancementType)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Processing / Enhancing Stage */}
      {stage === 'enhancing' && uploadedImage && (
        <div className="animate-fade-in">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            <div className="relative bg-ink-950/70 p-6 min-h-[420px] flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-brand-500/20" />
                <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-transparent border-t-brand-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-9 h-9 text-brand-400 animate-pulse" />
                </div>
              </div>

              <div className="text-center max-w-sm">
                <p className="text-xs uppercase tracking-widest text-brand-400 font-semibold mb-1">
                  Enhancing to {enhancementType.toUpperCase()}
                </p>
                <p className="text-white font-medium text-base mb-2">{progressStage}</p>
                <p className="text-brand-300 text-3xl font-display font-extrabold">{progress}%</p>
                <p className="text-ink-400 text-xs mt-3">
                  Reconstructing neural textures and generating crystal-clear pixels.
                </p>
              </div>

              <div className="w-full max-w-md h-2.5 rounded-full bg-ink-800/80 overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 via-brand-400 to-purple-300 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Result Done Stage */}
      {stage === 'done' && uploadedImage && result && (
        <div className="animate-slide-up">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            {/* View Mode Controls */}
            <div className="px-6 py-3.5 bg-ink-950/80 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('slider')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                    viewMode === 'slider'
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                      : 'text-ink-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Split Comparison Slider
                </button>
                <button
                  onClick={() => setViewMode('side-by-side')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                    viewMode === 'side-by-side'
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                      : 'text-ink-400 hover:text-white'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                  Side by Side
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-xs text-ink-300">
                  <span className="text-brand-300 font-semibold">{result.width} × {result.height}px</span> ({enhancementType.toUpperCase()})
                </div>
                <button
                  onClick={() => setIsZoomed(true)}
                  className="p-1.5 rounded-lg glass hover:bg-white/10 text-ink-300 hover:text-white transition"
                  title="Full View"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Split Comparison Slider View */}
            {viewMode === 'slider' ? (
              <div
                ref={sliderContainerRef}
                onMouseMove={(e) => e.buttons === 1 && handleSliderMove(e.clientX)}
                onTouchMove={(e) => handleSliderMove(e.touches[0].clientX)}
                className="relative w-full h-[440px] md:h-[500px] select-none cursor-ew-resize bg-ink-950 overflow-hidden"
              >
                {/* After (Enhanced) Image */}
                <img
                  src={result.url}
                  alt="Enhanced Result"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {/* Before (Original) Image with clip path */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ width: `${sliderPosition}%` }}
                >
                  <img
                    src={uploadedImage.url}
                    alt="Original Image"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none max-w-none"
                    style={{
                      width: sliderContainerRef.current?.offsetWidth || '100%',
                      height: '100%',
                    }}
                  />
                </div>

                {/* Divider Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-brand-400 shadow-[0_0_12px_rgba(168,85,247,0.8)] pointer-events-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-brand-500 text-white shadow-xl flex items-center justify-center border-2 border-white/80">
                    <Sliders className="w-4 h-4" />
                  </div>
                </div>

                {/* Labels */}
                <div className="absolute top-4 left-4 glass px-2.5 py-1 rounded-md text-xs font-semibold text-white/80 pointer-events-none">
                  BEFORE ({uploadedImage.width}×{uploadedImage.height})
                </div>
                <div className="absolute top-4 right-4 glass-brand px-2.5 py-1 rounded-md text-xs font-semibold text-brand-300 pointer-events-none">
                  AFTER ({result.width}×{result.height} {enhancementType.toUpperCase()})
                </div>
              </div>
            ) : (
              /* Side-by-Side View */
              <div className="grid md:grid-cols-2 gap-px bg-white/10">
                <div className="bg-ink-950 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ImageIcon className="w-4 h-4 text-ink-400" />
                    <span className="text-xs text-ink-400 font-medium uppercase tracking-wider">Before (Original)</span>
                  </div>
                  <img
                    src={uploadedImage.url}
                    alt="Original"
                    className="w-full rounded-xl max-h-[380px] object-contain mx-auto"
                  />
                  <p className="text-center text-xs text-ink-500 mt-2">
                    {uploadedImage.width} × {uploadedImage.height}px · {formatBytes(uploadedImage.file.size)}
                  </p>
                </div>
                <div className="bg-ink-950 p-4 relative">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-brand-400" />
                    <span className="text-xs text-brand-300 font-medium uppercase tracking-wider">
                      After ({getEnhancementLabel(enhancementType)})
                    </span>
                  </div>
                  <img
                    src={result.url}
                    alt="Enhanced"
                    className="w-full rounded-xl max-h-[380px] object-contain mx-auto"
                  />
                  <p className="text-center text-xs text-brand-300 mt-2 font-medium">
                    {result.width} × {result.height}px · {formatBytes(result.blob.size)}
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-ink-950/40">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl glass-brand flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-brand-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base">
                    Enhanced to {getEnhancementLabel(enhancementType)}
                  </p>
                  <p className="text-ink-400 text-xs">
                    Original {uploadedImage.width}×{uploadedImage.height}px → Clean {result.width}×{result.height}px
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={reset}
                  className="btn-ghost flex items-center gap-2 flex-1 sm:flex-none justify-center"
                >
                  <X className="w-4 h-4" />
                  New Image
                </button>
                <button
                  onClick={handleDownload}
                  className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center shadow-lg shadow-brand-500/25"
                >
                  <Download className="w-5 h-5" />
                  Download HD ({result.width}×{result.height})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zoom Modal */}
      {isZoomed && result && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
        >
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={result.url}
            alt="Enhanced Full HD"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
