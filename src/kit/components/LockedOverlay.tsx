import { Lock } from 'lucide-react';
import { useKitConfig } from '../use-kit-config';

interface LockedOverlayProps {
  onUpgrade: () => void;
  /** Override the default label, e.g. "Unlock the dashboard". */
  label?: string;
}

/**
 * Translucent overlay placed inside a relatively-positioned container to
 * gate a premium component. Click or keyboard activation → onUpgrade
 * (typically opens the modal).
 */
export default function LockedOverlay({ onUpgrade, label }: LockedOverlayProps) {
  const { upgrade } = useKitConfig();
  return (
    <button
      type="button"
      className="absolute inset-0 w-full h-full border-0 bg-white/80 backdrop-blur-[2px] rounded-xl z-10 flex flex-col items-center justify-center cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset"
      onClick={onUpgrade}
    >
      <span className="bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-full p-2 mb-2 shadow-md group-hover:scale-110 transition-transform inline-flex items-center justify-center">
        <Lock size={16} aria-hidden="true" />
      </span>
      <span className="text-xs font-bold text-stone-600">{label || 'Unlock with Pro'}</span>
      <span className="text-[10px] text-stone-400 mt-0.5">{upgrade.price} {upgrade.priceCaption.toLowerCase()}</span>
    </button>
  );
}
