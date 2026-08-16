"use client";

import { useState } from "react";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [quality, setQuality] = useState("4K");

  const handleImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImage(URL.createObjectURL(file));
  };

  return (
    <main className="min-h-screen bg-[#08080b] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="text-2xl font-bold">
            HD<span className="text-violet-500">Ultra</span>
          </div>

          <div className="text-sm text-gray-400">
            AI Image Enhancer
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-20 text-center">
        <div className="inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
          ✨ AI Powered Image Enhancement
        </div>

        <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-7xl">
          Turn blurry photos into
          <span className="block text-violet-500">
            Ultra HD
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
          Enhance your photos with AI and upscale them to
          2K, 4K or 8K quality.
        </p>
      </section>

      <section className="mx-auto mt-14 max-w-4xl px-6 pb-20">
        <label
          htmlFor="image-upload"
          className="group flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/[0.03] p-10 text-center transition hover:border-violet-500"
        >
          {image ? (
            <img
              src={image}
              alt="Uploaded image"
              className="max-h-[330px] max-w-full rounded-2xl object-contain"
            />
          ) : (
            <>
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-500/10 text-4xl">
                ↑
              </div>

              <h2 className="text-2xl font-semibold">
                Upload your image
              </h2>

              <p className="mt-3 text-gray-500">
                Drag & drop or click to choose an image
              </p>

              <span className="mt-7 rounded-xl bg-white px-7 py-3 font-semibold text-black">
                Choose Image
              </span>
            </>
          )}

          <input
            id="image-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];

              if (file) {
                handleImage(file);
              }
            }}
          />
        </label>

        {image && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <p className="mb-4 text-sm text-gray-400">
              Select output quality
            </p>

            <div className="grid grid-cols-3 gap-3">
              {["2K", "4K", "8K"].map((item) => (
                <button
                  key={item}
                  onClick={() => setQuality(item)}
                  className={`rounded-xl border p-4 transition ${
                    quality === item
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="text-xl font-bold">
                    {item}
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Ultra HD
                  </div>
                </button>
              ))}
            </div>

            <button className="mt-6 w-full rounded-xl bg-violet-600 py-4 font-semibold transition hover:bg-violet-500">
              ✨ Enhance Image
            </button>
          </div>
        )}
      </section>
    </main>
  );
}