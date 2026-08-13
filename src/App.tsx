// Demo app — a single page that exercises every kit primitive end to end.
// Real apps replace this entirely; the kit lives under src/kit/.

import { Sparkles, FileDown, Lock as LockIcon, Check, X } from 'lucide-react';
import {
  AdminBar,
  LockedOverlay,
  ProBadge,
  UpgradeModal,
  useAuth,
  useKitConfig,
  captureUtmParams,
} from './kit';

export default function App() {
  // Capture UTMs once per session. Inside the component body so that
  // KitProvider's setKitConfig() has already run by the time we read it.
  captureUtmParams();

  const config = useKitConfig();
  const auth = useAuth();

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-20">
      {auth.isAdmin && (
        <AdminBar
          isPro={auth.isPro}
          viewAs={auth.viewAs}
          setViewAs={auth.setViewAs}
          setIsAdmin={auth.setIsAdmin}
        />
      )}

      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={auth.handleLogoTap}
            className="flex items-center gap-2 font-bold text-stone-900"
            title={`Tap ${config.admin.logoTapsToToggle}× to toggle admin`}
          >
            <Sparkles size={18} className="text-amber-500" />
            {config.app.name}
          </button>
          {auth.isPro && <ProBadge />}
        </div>
      </header>

      {/* Reference rendering of useAuth().justPurchased — without this, a
          buyer's only feedback that the gate cleared is the small header
          badge. Adopters that skip this (unlike our-family-lizard and
          debt-snowball-dolphin, which both hand-built it) ship silently. */}
      {auth.justPurchased && (
        <div className="bg-emerald-700 text-white">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
              <Check size={16} />
            </div>
            <div className="flex-1 text-sm font-medium">
              Payment received — {config.app.name} Pro is unlocked.
            </div>
            <button
              type="button"
              onClick={auth.dismissJustPurchased}
              aria-label="Dismiss"
              className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h1 className="text-2xl font-bold text-stone-900 mb-2">
            appkit demo
          </h1>
          <p className="text-stone-600 leading-relaxed mb-4">
            This is the bare-minimum app that proves the kit's pieces work end
            to end. Real apps replace the contents of <code>src/App.tsx</code>{' '}
            and leave <code>src/kit/</code> alone.
          </p>
          <div className="text-xs text-stone-400 space-y-1">
            <div>
              Storage prefix: <code>{config.app.storagePrefix}</code>
            </div>
            <div>
              Analytics prefix: <code>{config.analytics.eventPrefix}</code>
            </div>
            <div>
              Tap the logo {config.admin.logoTapsToToggle}× within{' '}
              {config.admin.tapWindowMs / 1000}s to enter admin mode.
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="font-bold text-stone-900 mb-3">Free actions</h2>
          <p className="text-sm text-stone-600 mb-4">
            Anyone can do this. No paywall.
          </p>
          <button
            type="button"
            onClick={() => alert('Free thing happened.')}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-700"
          >
            Run free action
          </button>
        </section>

        <section className="bg-white rounded-2xl border border-stone-200 p-6">
          <h2 className="font-bold text-stone-900 mb-3 flex items-center gap-2">
            Premium actions <ProBadge small />
          </h2>
          <p className="text-sm text-stone-600 mb-4">
            <code>requirePro()</code> wraps the handler. Free users get the
            upgrade modal; Pro users run the action.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                auth.requirePro(
                  () => alert('Generated PDF report (mock).'),
                  'demo_pdf_button',
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800"
            >
              <FileDown size={14} /> Download PDF
            </button>
            <button
              type="button"
              onClick={() =>
                auth.requirePro(
                  () => alert('Shared (mock).'),
                  'demo_share_button',
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800"
            >
              Share link
            </button>
          </div>
        </section>

        <section className="relative bg-white rounded-2xl border border-stone-200 p-6 overflow-hidden">
          <h2 className="font-bold text-stone-900 mb-3 flex items-center gap-2">
            <LockIcon size={14} /> Locked content
          </h2>
          <p className="text-sm text-stone-600 mb-2">
            This entire panel is gated. Free users see the locked overlay; Pro
            users see the real content.
          </p>
          <div className="text-stone-400 text-sm italic">
            Imagine a chart, a dashboard, or a list of premium-only data here.
          </div>
          {!auth.isPro && (
            <LockedOverlay
              onUpgrade={() => auth.openUpgrade('demo_locked_panel')}
              label="Unlock this panel"
            />
          )}
        </section>
      </main>

      {auth.upgradeSource && (
        <UpgradeModal
          source={auth.upgradeSource}
          onClose={auth.closeUpgrade}
          onRestore={auth.handleRestore}
        />
      )}
    </div>
  );
}
