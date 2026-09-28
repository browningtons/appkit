import { Check, X } from 'lucide-react';
import { useKitConfig } from '../use-kit-config';

interface PurchaseConfirmationProps {
  onDismiss: () => void;
}

/**
 * One-time celebration banner shown after a successful Stripe purchase
 * (`useAuth().justPurchased`). Without this, a buyer's only feedback that
 * the gate cleared is the small `ProBadge` in the header — easy to miss on
 * mobile and easy for an adopter to forget, since `App.tsx` is the file
 * real apps are told to replace.
 */
export default function PurchaseConfirmation({ onDismiss }: PurchaseConfirmationProps) {
  const config = useKitConfig();
  return (
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
          onClick={onDismiss}
          aria-label="Dismiss"
          className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
