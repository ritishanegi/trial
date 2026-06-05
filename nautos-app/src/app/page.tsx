import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#071020] font-sans">

      {/* ── Nav ── */}
      <nav className="bg-[#0a1628] border-b border-white/[0.07] h-14 px-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full border-2 border-[#f5a623] flex items-center justify-center">
            <div className="w-2 h-2 rounded-full border border-[#f5a623]" />
          </div>
          <span className="text-white text-[14px] font-semibold tracking-wide">nautos</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="text-white/60 hover:text-white text-sm px-3 py-1.5 rounded-md transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/auth/register"
            className="bg-[#f5a623] hover:bg-[#e8971a] text-[#0a1628] text-[13px] font-bold tracking-widest uppercase px-4 py-2 rounded-md transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-[#0a1628] relative overflow-hidden px-10 py-28 text-center">
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Amber glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(245,166,35,0.07) 0%, transparent 60%)",
          }}
        />

        {/* Eyebrow */}
        <div className="relative z-10 inline-flex items-center gap-2.5 text-[#f5a623] text-[11px] tracking-[0.12em] uppercase mb-7">
          <span className="h-px w-8 bg-[#f5a623]" />
          Maritime Intelligence Platform
          <span className="h-px w-8 bg-[#f5a623]" />
        </div>

        <h1 className="relative z-10 text-white text-[52px] font-extrabold leading-[1.1] tracking-tight mb-5">
          Find answers in your
          <br />
          <em className="text-white/60 font-extrabold">maritime documents</em>
        </h1>

        <p className="relative z-10 text-white/50 text-base leading-relaxed max-w-lg mx-auto mb-9">
          Upload maintenance manuals and technical documents. Ask questions in
          plain English. Get answers with exact page citations.
        </p>

        <div className="relative z-10 flex items-center justify-center gap-3">
          <Link
            href="/auth/register"
            className="bg-[#f5a623] hover:bg-[#e8971a] text-[#0a1628] text-[13px] font-bold tracking-widest uppercase px-7 py-3 rounded-md transition-colors"
          >
            Get started
          </Link>
          <Link
            href="/auth/login"
            className="border border-white/20 hover:border-white/40 text-white/70 hover:text-white text-[13px] font-semibold tracking-widest uppercase px-7 py-3 rounded-md transition-colors"
          >
            Log in
          </Link>
        </div>

        {/* Corner labels */}
        <p className="absolute z-10 bottom-4 left-10 text-[10px] text-white/20 tracking-widest">
          25°47′N 80°13′W
        </p>
        <p className="absolute z-10 bottom-4 right-10 text-[10px] text-white/20 tracking-widest">
          SYS_VER: 2.4.1
        </p>
      </section>

      {/* ── Features ── */}
      <section className="bg-[#0d1a2e] border-t border-white/[0.07] px-10 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((f) => (
            <div key={f.title} className="border-t-2 border-[#f5a623] pt-5">
              <h3 className="text-[#f0f4ff] text-sm font-semibold mb-2.5">
                {f.title}
              </h3>
              <p className="text-white/45 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#0a1628] border-t border-white/[0.07] px-10 py-4 flex items-center justify-between">
        <span className="text-white/25 text-[11px] tracking-wider">
          Martech Systems
        </span>
        <span className="text-white/25 text-[11px] tracking-wider">
          © 2026 Nautos AI
        </span>
      </footer>

    </div>
  );
}

const features = [
  {
    title: "Document processing",
    body: "OCR extracts text, tables, and key-value pairs from scanned PDFs. Documents are chunked, embedded, and indexed automatically.",
  },
  {
    title: "AI-powered search",
    body: "Hybrid search combines keyword matching with semantic understanding. Part numbers, IMO codes, and technical terms are found exactly.",
  },
  {
    title: "Fleet-wide knowledge",
    body: "Documents are scoped to vessels, shared across your fleet, or contributed to a master library that benefits every client.",
  },
];