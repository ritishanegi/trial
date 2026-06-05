import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            nautos
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/register">Start free trial</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl mx-auto text-center py-24">
          <h1 className="text-4xl sm:text-[44px] font-bold tracking-tight leading-[1.1] text-foreground">
            Find answers in your
            <br />
            maritime documents
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground max-w-lg mx-auto">
            Upload maintenance manuals and technical documents.
            Ask questions in plain English. Get answers with exact page citations.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" className="h-11 px-6" asChild>
              <Link href="/auth/register">Get started</Link>
            </Button>
            <Button variant="outline" size="lg" className="h-11 px-6" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Value props — dense, no icons */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 sm:grid-cols-3 gap-x-12 gap-y-10">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Document processing</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              OCR extracts text, tables, and key-value pairs from scanned PDFs.
              Documents are chunked, embedded, and indexed automatically.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI-powered search</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Hybrid search combines keyword matching with semantic understanding.
              Part numbers, IMO codes, and technical terms are found exactly.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fleet-wide knowledge</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Documents are scoped to vessels, shared across your fleet, or
              contributed to a master library that benefits every client.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-5">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>Martech Systems</span>
          <span>nautos.ai</span>
        </div>
      </footer>
    </main>
  );
}
