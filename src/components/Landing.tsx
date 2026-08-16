import { Shield, Sparkles, Zap, Image as ImageIcon } from 'lucide-react';
import ImageUploader from './ImageUploader';

export default function Landing() {
  return (
    <div className="min-h-screen bg-mesh">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-brand flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-brand-400" />
            </div>
            <span className="font-display font-bold text-xl text-white">Imagge4k</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 pt-16 md:pt-24 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-brand text-brand-300 text-sm font-medium mb-8 animate-fade-in">
          <Zap className="w-4 h-4" />
          AI-Powered Image Enhancement
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-extrabold text-white mb-6 leading-tight animate-slide-up">
          Turn blurry images into
          <br />
          <span className="gradient-text">crystal-clear HD</span>
        </h1>
        <p className="text-lg md:text-xl text-ink-300 max-w-2xl mx-auto mb-12 animate-slide-up">
          Upload any blurry or low-resolution image and enhance it to stunning 2K, 4K, or 8K
          quality. Fast, free, and right in your browser.
        </p>

        {/* Uploader */}
        <div className="animate-slide-up">
          <ImageUploader />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<ImageIcon className="w-6 h-6" />}
            title="2K / 4K / 8K AI Enhancement"
            description="Real AI super-resolution (ESRGAN) reconstructs genuine detail, so images stay sharp even when you zoom in close."
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="Instant Processing"
            description="Everything runs in your browser — no uploads to servers, no waiting in queues. Results in seconds."
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Private & Secure"
            description="Your images never leave your device. All enhancement happens locally on your machine."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-white text-center mb-12">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <StepCard
            number="01"
            title="Upload"
            description="Drag and drop or browse to select any blurry image from your device."
          />
          <StepCard
            number="02"
            title="Enhance"
            description="Pick 2K, 4K, or 8K resolution and let the enhancement engine do its magic."
          />
          <StepCard
            number="03"
            title="Download"
            description="Preview the before/after comparison and download your enhanced image instantly."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-4 md:px-8 flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <span className="text-sm text-ink-400">Image4K — Enhance blurry images to HD</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-2xl p-6 hover:border-brand-500/20 transition-all duration-300 group">
      <div className="w-12 h-12 rounded-xl glass-brand flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-ink-400 leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl font-display font-extrabold gradient-text mb-4">{number}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-ink-400 leading-relaxed">{description}</p>
    </div>
  );
}
