import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Gecko Cam",
  description: "About MauMau the Leopard Gecko and the Gecko Cam setup.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-gray-800 last:border-0">
      <span className="text-gray-400 text-sm w-44 shrink-0">{label}</span>
      <span className="text-gray-100 text-sm">{value}</span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          🦎 About Gecko Cam
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          A live webcam and motion-capture system watching over MauMau, a
          Leopard Gecko living in San Francisco.
        </p>
      </div>

      <Section title="MauMau">
        <Row label="Species" value="Leopard Gecko (Eublepharis macularius)" />
        <Row label="Name" value="MauMau" />
        <Row label="Sex" value="Female" />
        <Row label="Age" value="2–3 years" />
        <Row label="Adopted" value="Tuesday, March 10, 2026" />
        <Row
          label="From"
          value={
            <a
              href="https://www.animalconnectionsf.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Animal Connection, Outer Sunset, San Francisco
            </a>
          }
        />
        <Row label="Owners" value="Opal & Elsigh" />
        <Row label="Diet" value="Dubia roaches, crickets" />
      </Section>

      <Section title="Camera & Pi">
        <Row label="Computer" value="Raspberry Pi 5 Model B Rev 1.1" />
        <Row label="Architecture" value="ARM Cortex-A76 · aarch64" />
        <Row label="RAM" value="4 GB" />
        <Row label="Storage" value="128 GB microSD" />
        <Row label="OS" value="Raspberry Pi OS 64-bit (Debian Bookworm)" />
        <Row label="Camera" value="IMX708 Wide-angle Noir (no IR cut filter)" />
        <Row label="Resolution" value="1280 × 720 @ 30 fps (HLS stream)" />
        <Row label="Motion detection" value="320 × 240 YUV420 (lores stream)" />
        <Row label="Remote access" value="Tailscale Funnel (encrypted tunnel)" />
      </Section>

      <Section title="Pi Software">
        <Row label="Python" value="3.13.5" />
        <Row label="picamera2" value="0.3.32" />
        <Row label="OpenCV" value="4.10.0" />
        <Row label="FFmpeg" value="7.1.2" />
        <Row label="nginx" value="1.26.3" />
        <Row
          label="Motion detection"
          value="MOG2 background subtraction with brightness-delta + coverage filters"
        />
        <Row label="Stream format" value="HLS · 2s segments · 10-segment rolling buffer" />
        <Row
          label="Daemon"
          value={
            <span>
              <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">gecko_cam.py</code>
              {" · systemd service"}
            </span>
          }
        />
      </Section>

      <Section title="Web App">
        <Row label="Framework" value="Next.js 16.1 (App Router)" />
        <Row label="Hosting" value="Vercel" />
        <Row label="Storage" value="Vercel Blob (clips, thumbnails, KV state)" />
        <Row label="Stream player" value="hls.js 1.5" />
        <Row label="Language" value="TypeScript · React 19" />
        <Row label="Styling" value="Tailwind CSS 3" />
        <Row
          label="Source"
          value={
            <a
              href="https://github.com/elsigh/gecko-cam"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              github.com/elsigh/gecko-cam
            </a>
          }
        />
      </Section>
    </div>
  );
}
