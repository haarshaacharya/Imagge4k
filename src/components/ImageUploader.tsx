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
  Shapes,
  User,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import {
  enhanceImage,
  formatBytes,
  getEnhancementLabel,
  getModeLabel,
  type EnhancementScale,
  type EnhancementMode,
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

export default function ImageUploader() {
  const [stage, setStage] = useState<Stage>('idle');
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  
  // Default to Ultra Sharp Studio mode for razor-sharp logos & graphics
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>('ultra-sharp');
  const [scale, setScale] = useState<EnhancementScale>('4x');
  const [enhanceQuality, setEnhanceQuality] = useState<boolean>(true);
  const [sharpness, setSharpness] = useState<number>(95);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

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
    if (file.size > 50 * 1024 * 1024) {
      setError('Image must be under 50MB.');
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
      const res = await enhanceImage(
        uploadedImage.file,
        {
          scale,
          mode: enhancementMode,
          enhanceQuality,
          sharpness,
        },
        (p, s) => {
          setProgress(p);
          setProgressStage(s);
        }
      );
      setResult(res);
      setStage('done');

      // Log session asynchronously
      supabase
        .from('enhancement_logs')
        .insert({
          session_id: getSessionId(),
          enhancement_type: scale === '8x' ? '8k' : scale === '4x' ? '4k' : '2k',
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
    a.download = `imagge4k-${result.mode}-${result.scale}-${result.width}x${result.height}.png`;
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

  const getMultiplierNum = (s: EnhancementScale) => (s === '8x' ? 8 : s === '4x' ? 4 : 2);

  const getCalculatedDimensions = (targetScale: EnhancementScale) => {
    if (!uploadedImage) return '';
    const mult = getMultiplierNum(targetScale);
    return `${uploadedImage.width * mult} × ${uploadedImage.height * mult}px`;
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
                Drop your image or logo here to enhance
              </h3>
              <p className="text-ink-400 text-sm max-w-md mx-auto">
                Turn blurry photos, neon bevels, or logos into razor-sharp <strong className="text-brand-300">2K, 4K, or 8K</strong> resolution with Ultra-Sharp Studio Engine.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-ink-300">
              <span>Supports PNG, JPG, WebP</span>
              <span>•</span>
              <span>Shock-Filter & Turbo CAS</span>
              <span>•</span>
              <span>Up to 50MB</span>
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
          <button onClick={reset} className="btn-ghost cursor-pointer">
            Try Again
          </button>
        </div>
      )}

      {/* 3. Uploaded & Option Selection Stage */}
      {stage === 'uploaded' && uploadedImage && (
        <div className="animate-slide-up">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            {/* Image Preview Banner */}
            <div className="relative bg-ink-950/70 p-4 border-b border-white/10">
              <img
                src={uploadedImage.url}
                alt="Uploaded preview"
                className="w-full max-h-[340px] object-contain mx-auto rounded-xl"
              />
              <div className="absolute top-6 right-6 glass-brand rounded-lg px-3 py-1.5 text-xs text-brand-200 font-medium border border-brand-500/30">
                Original: {uploadedImage.width} × {uploadedImage.height}px · {formatBytes(uploadedImage.file.size)}
              </div>
              <button
                onClick={reset}
                className="absolute top-6 left-6 w-9 h-9 rounded-lg glass flex items-center justify-center hover:bg-white/10 transition cursor-pointer"
                title="Cancel"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Controls Panel */}
            <div className="p-6 md:p-8 space-y-6">
              {/* Row 1: AI Model / Mode Selector */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  Select AI Enhancement Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(
                    [
                      {
                        id: 'ultra-sharp',
                        title: 'Ultra Sharp Studio',
                        desc: 'Shock filter, metallic bevels & razor edges',
                        icon: Zap,
                        badge: 'Ultra Crisp',
                      },
                      {
                        id: 'vector-logo',
                        title: 'Vector & Logo',
                        desc: 'Anti-aliased curves & text sharpness',
                        icon: Shapes,
                      },
                      {
                        id: 'super-resolution',
                        title: 'Super Resolution',
                        desc: 'Photos, landscapes & real textures',
                        icon: Sparkles,
                      },
                      {
                        id: 'face-portrait',
                        title: 'Face & Portrait',
                        desc: 'Skin clarity, eyes & hair depth',
                        icon: User,
                      },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    const isSelected = enhancementMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setEnhancementMode(m.id)}
                        className={`relative rounded-2xl p-4 text-left transition-all duration-200 border flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? 'glass-brand border-brand-500/70 shadow-lg shadow-brand-500/20 bg-brand-500/15'
                            : 'glass border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        {m.badge && (
                          <span className="absolute -top-2.5 right-3 bg-brand-600 text-white text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border border-brand-400/40">
                            {m.badge}
                          </span>
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-brand-500/30 text-brand-300' : 'bg-white/5 text-ink-300'}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-ink-200'}`}>
                              {m.title}
                            </span>
                          </div>
                          <p className="text-xs text-ink-400 line-clamp-2">{m.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: Upscale Multiplier & Quality Toggles */}
              <div className="grid sm:grid-cols-2 gap-6 pt-2 border-t border-white/10">
                {/* Upscale Multipliers */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2 flex items-center justify-between">
                    <span>Upscale Multiplier</span>
                    <span className="text-xs text-brand-400 font-normal">
                      Output: {getCalculatedDimensions(scale)}
                    </span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: '2x', label: '2×', title: '2K Quad HD' },
                        { id: '4x', label: '4×', title: '4K Ultra HD', popular: true },
                        { id: '8x', label: '8×', title: '8K Cinema HD' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setScale(opt.id)}
                        className={`relative py-3 px-3 rounded-xl font-medium text-sm transition-all duration-200 border flex flex-col items-center justify-center cursor-pointer ${
                          scale === opt.id
                            ? 'bg-brand-600/30 text-brand-200 border-brand-500 shadow-md shadow-brand-500/20 font-bold'
                            : 'bg-white/[0.03] text-ink-300 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {opt.popular && (
                          <span className="absolute -top-2 bg-brand-500 text-[9px] px-1.5 py-0.2 rounded-full font-bold text-white uppercase">
                            Best
                          </span>
                        )}
                        <span className="text-base font-display">{opt.label}</span>
                        <span className="text-[10px] text-ink-400">{opt.title}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality & Detail Toggles */}
                <div className="flex flex-col justify-center gap-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-brand-500/20 text-brand-300">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">Enhance Quality</div>
                        <div className="text-xs text-ink-400">Shock-filter & specular ridge sharpness</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enhanceQuality}
                        onChange={(e) => setEnhanceQuality(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-ink-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-brand-300 hover:text-brand-200 flex items-center gap-1 self-start cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    {showAdvanced ? 'Hide Sharpness Tuning' : 'Adjust CAS Sharpness (Default 95%)'}
                    <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Advanced Sharpness Slider */}
              {showAdvanced && (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-300 font-medium">Turbo Contrast-Adaptive Sharpness (CAS)</span>
                    <span className="text-brand-300 font-bold">{sharpness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={sharpness}
                    onChange={(e) => setSharpness(Number(e.target.value))}
                    className="w-full accent-brand-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-ink-500">
                    <span>Balanced (50%)</span>
                    <span>High (85%)</span>
                    <span>Ultra Razor Sharp (100%)</span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                onClick={handleEnhance}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base py-4 shadow-xl shadow-brand-500/25 cursor-pointer rounded-2xl"
              >
                <Zap className="w-5 h-5 text-brand-200" />
                Upscale to {scale.toUpperCase()} ({getCalculatedDimensions(scale)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Processing / Enhancing Stage */}
      {stage === 'enhancing' && uploadedImage && (
        <div className="animate-fade-in">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            <div className="relative bg-ink-950/80 p-8 min-h-[420px] flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-brand-500/20" />
                <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-transparent border-t-brand-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-9 h-9 text-brand-400 animate-pulse" />
                </div>
              </div>

              <div className="text-center max-w-md">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 text-xs font-semibold mb-2">
                  <Zap className="w-3.5 h-3.5" />
                  Mode: {getModeLabel(enhancementMode).title} ({scale.toUpperCase()})
                </div>
                <p className="text-white font-medium text-base mb-2">{progressStage}</p>
                <p className="text-brand-300 text-4xl font-display font-extrabold">{progress}%</p>
                <p className="text-ink-400 text-xs mt-3">
                  Generating ultra-sharp specular ridges & anti-aliased pixels at {getCalculatedDimensions(scale)}.
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

      {/* 5. Result Done Stage (Interactive Comparison Slider) */}
      {stage === 'done' && uploadedImage && result && (
        <div className="animate-slide-up">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            {/* View Mode Controls Bar */}
            <div className="px-6 py-3.5 bg-ink-950/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('slider')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                    viewMode === 'slider'
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                      : 'text-ink-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Split Comparison Slider
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('side-by-side')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
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
                  <span className="text-brand-300 font-semibold">{result.width} × {result.height}px</span> ({result.scale.toUpperCase()})
                </div>
                <button
                  type="button"
                  onClick={() => setIsZoomed(true)}
                  className="p-1.5 rounded-lg glass hover:bg-white/10 text-ink-300 hover:text-white transition cursor-pointer"
                  title="Full View / Zoom"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Split Comparison Slider View */}
            {viewMode === 'slider' ? (
              <div
                ref={sliderContainerRef}
                onMouseDown={(e) => handleSliderMove(e.clientX)}
                onMouseMove={(e) => e.buttons === 1 && handleSliderMove(e.clientX)}
                onTouchMove={(e) => handleSliderMove(e.touches[0].clientX)}
                className="relative w-full h-[460px] md:h-[540px] select-none cursor-ew-resize bg-ink-950 overflow-hidden"
              >
                {/* After (Enhanced) Image */}
                <img
                  src={result.url}
                  alt="Enhanced Result"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />

                {/* Before (Original) Image with clip mask */}
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
                  className="absolute top-0 bottom-0 w-0.5 bg-brand-400 shadow-[0_0_15px_rgba(168,85,247,0.9)] pointer-events-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-brand-500 text-white shadow-2xl flex items-center justify-center border-2 border-white/90">
                    <Sliders className="w-4 h-4" />
                  </div>
                </div>

                {/* Labels */}
                <div className="absolute top-4 left-4 glass px-3 py-1.5 rounded-lg text-xs font-semibold text-white/90 pointer-events-none border border-white/10">
                  Before {uploadedImage.width} × {uploadedImage.height}
                </div>
                <div className="absolute top-4 right-4 glass-brand px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-200 pointer-events-none border border-brand-500/40">
                  After {result.width} × {result.height} ({result.scale.toUpperCase()})
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
                      After ({getEnhancementLabel(result.scale)})
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

            {/* Bottom Actions Bar */}
            <div className="p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-ink-950/60 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl glass-brand flex items-center justify-center border border-brand-500/30">
                  <Zap className="w-6 h-6 text-brand-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base">
                    Upscaled to {getEnhancementLabel(result.scale)}
                  </p>
                  <p className="text-ink-400 text-xs">
                    Mode: {getModeLabel(result.mode).title} · {result.width}×{result.height}px
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={reset}
                  className="btn-ghost flex items-center gap-2 flex-1 sm:flex-none justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Upscale Another
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="btn-primary flex items-center gap-2 flex-1 sm:flex-none justify-center shadow-lg shadow-brand-500/25 cursor-pointer"
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
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
        >
          <button
            type="button"
            onClick={() => setIsZoomed(false)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-full max-h-[92vh] flex flex-col items-center gap-2">
            <img
              src={result.url}
              alt="Enhanced Full HD"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
            />
            <div className="glass px-4 py-1.5 rounded-full text-xs text-ink-300">
              Master Resolution: <span className="text-brand-300 font-bold">{result.width} × {result.height}px</span> ({result.scale.toUpperCase()})
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
