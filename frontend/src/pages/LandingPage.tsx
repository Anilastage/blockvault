import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Link2,
  FileDigit,
  FolderLock,
  Eye,
  Wallet,
  ArrowRight,
  Upload,
  Fingerprint,
  Blocks,
  BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  { icon: Fingerprint, title: 'Tamper Detection', text: 'A single changed byte produces a different hash — modifications are caught instantly.' },
  { icon: Blocks, title: 'Blockchain Security', text: 'Document fingerprints live on an immutable Ethereum ledger that no one can silently alter.' },
  { icon: FileDigit, title: 'Fingerprint Verification', text: 'Industry-standard cryptographic hashing computed from the raw document bytes.' },
  { icon: FolderLock, title: 'Secure Document Management', text: 'Encrypted-at-rest storage with strict per-user authorization on every file.' },
  { icon: Eye, title: 'Transparent Records', text: 'Every registration is a public transaction — auditable by anyone, forever.' },
  { icon: Wallet, title: 'One-Click Demo Wallet', text: 'Connect the built-in demo wallet instantly — no browser extension needed.' },
];

const steps = [
  { icon: Upload, title: 'Upload Document', text: 'Select any PDF, DOCX or image up to 10 MB.' },
  { icon: FileDigit, title: 'Create Fingerprint', text: 'Your browser computes the document fingerprint locally.' },
  { icon: Link2, title: 'Store Hash On-Chain', text: 'The demo wallet signs the transaction instantly to anchor it.' },
  { icon: BadgeCheck, title: 'Verify Anytime', text: 'Re-hash later and compare against the chain.' },
];

const techs = ['React', 'Node.js', 'MongoDB', 'Ethereum', 'Solidity', 'Hardhat'];

export const LandingPage = () => (
  <div>
    {/* Hero */}
    <section className="relative overflow-hidden bg-dark">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(600px circle at 20% 20%, rgba(99,102,241,0.35), transparent 55%), radial-gradient(700px circle at 80% 60%, rgba(6,182,212,0.22), transparent 55%)',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-primary-300">
            <Blocks className="h-3.5 w-3.5" />
            Blockchain-Powered Document Verification
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Verify Every Document.
            <br />
            <span className="bg-gradient-to-r from-primary-400 to-accent bg-clip-text text-transparent">
              Trust Every Record.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            BlockVault anchors a cryptographic fingerprint of your documents onto an
            Ethereum-compatible blockchain, giving you tamper-proof proof of integrity you can
            check in seconds — from anywhere, forever.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" fullWidth className="sm:w-auto" icon={<ArrowRight className="h-4 w-4" />}>
                Get Started
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" fullWidth className="sm:w-auto">
                Sign in
              </Button>
            </Link>
          </div>
        </div>

        {/* Pipeline visual */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { icon: Upload, label: 'Document' },
            { icon: FileDigit, label: 'Fingerprint' },
            { icon: Blocks, label: 'Blockchain' },
            { icon: ShieldCheck, label: 'Verification' },
          ].map(({ icon: Icon, label }, i) => (
            <div key={label} className="relative flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:flex-col sm:text-center">
              <Icon className="h-7 w-7 shrink-0 text-primary-400" />
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Step {i + 1}</p>
              </div>
              {i < 3 && (
                <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-600 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Features */}
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-dark">Why BlockVault</h2>
        <p className="mt-3 text-slate-500">Everything you need for provable document integrity.</p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card group p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-500 transition-colors group-hover:bg-primary-500 group-hover:text-white">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-dark">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </section>

    {/* How it works */}
    <section className="bg-slate-50 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-dark">How It Works</h2>
          <p className="mt-3 text-slate-500">Four steps between your document and permanent proof.</p>
        </div>
        <ol className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="card relative p-6">
              <span className="absolute right-5 top-5 text-4xl font-extrabold text-slate-100">
                {i + 1}
              </span>
              <Icon className="h-8 w-8 text-accent" />
              <h3 className="mt-4 font-semibold text-dark">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* Technology */}
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="card flex flex-col items-center gap-6 p-8 sm:p-10">
        <h2 className="text-xl font-semibold text-dark">Built With Proven Technology</h2>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {techs.map((t) => (
            <span
              key={t}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-600"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="relative overflow-hidden bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-600 py-16">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          Secure Your Documents With Blockchain
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-primary-100">
          Create a free account, connect the demo wallet, and register your first document hash in under
          two minutes.
        </p>
        <Link to="/register" className="mt-7 inline-block">
          <Button size="lg" className="bg-white !text-primary-600 hover:!bg-primary-50 shadow-lg">
            Create Free Account
          </Button>
        </Link>
      </div>
    </section>
  </div>
);
