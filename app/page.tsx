"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [quality, setQuality] = useState("4K");
  const [uploading, setUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError("Image size must be less than 15MB.");
      return;
    }

    setError("");
    setImage(URL.createObjectURL(file));
    setUploading(true);
    setUploadedPath(null);

    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${crypto.randomUUID()}.${fileExtension}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("images")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    setUploading(false);

    if (uploadError) {
      console.error(uploadError);
      setError("Image upload failed. Please try again.");
      return;
    }

    setUploadedPath(filePath);
  };

  return (
    <main className="min-h-screen bg-[#08080b] text-white">
      {/* Header */}
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

      {/* Hero */}
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

      {/* Upload Section */}
      <section className="mx-auto mt-14 max-w-4xl px-6 pb-20">
        <label
          htmlFor="image-upload"
          className="group flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/[0.03] p-10 text-center transition hover:border-violet-500 hover:bg-violet-500/[0.04]"
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

              <span className="mt-7 rounded-xl bg-white px-7 py-3 font-semibold text-black transition group-hover:bg-violet-500 group-hover:text-white">
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

        {/* Upload Status */}
        {uploading && (
          <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 text-center">
            <p className="text-sm text-violet-300">
              Uploading image to secure storage...
            </p>
          </div>
        )}

        {uploadedPath && !uploading && (
          <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-4 text-center">
            <p className="text-sm text-green-400">
              ✓ Image uploaded successfully
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">
              {error}
            </p>
          </div>
        )}

        {/* Quality Selection */}
        {image && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <p className="mb-4 text-sm text-gray-400">
              Select output quality
            </p>

            <div className="grid grid-cols-3 gap-3">
              {["2K", "4K", "8K"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setQuality(item)}
                  className={`rounded-xl border p-4 transition ${
                    quality === item
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/30"
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

            {/* Enhance Button */}
            <button
              type="button"
              disabled={!uploadedPath || uploading}
              className="mt-6 w-full rounded-xl bg-violet-600 py-4 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✨ Enhance Image to {quality}
            </button>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center">
        <p className="text-sm text-gray-600">
          HDUltra — AI Image Enhancement
        </p>
      </footer>
    </main>
  );
}