import React from 'react';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import type { VerificationStatus } from '../../shared/types.js';

interface VerificationBadgeProps {
  status: VerificationStatus;
  size?: 'sm' | 'md';
  onStatusChange?: (nextStatus: VerificationStatus) => void;
  interactive?: boolean;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  status,
  size = 'md',
  onStatusChange,
  interactive = false,
}) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'confirmed':
        return {
          label: 'Confirmed',
          icon: CheckCircle2,
          bgColor: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
          iconColor: 'text-[#059669]',
        };
      case 'unverified':
        return {
          label: 'Unverified',
          icon: AlertCircle,
          bgColor: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
          iconColor: 'text-[#D97706]',
        };
      case 'unknown':
      default:
        return {
          label: 'Unknown',
          icon: HelpCircle,
          bgColor: 'bg-[#FAF9F8] text-[#525252] border-[#E6E3E1]',
          iconColor: 'text-[#777777]',
        };
    }
  };

  const { label, icon: Icon, bgColor, iconColor } = getBadgeConfig();

  const handleNextClick = () => {
    if (!interactive || !onStatusChange) return;
    const cycle: Record<VerificationStatus, VerificationStatus> = {
      unverified: 'confirmed',
      confirmed: 'unknown',
      unknown: 'unverified',
    };
    onStatusChange(cycle[status]);
  };

  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs font-medium';

  if (interactive) {
    return (
      <button
        type="button"
        onClick={handleNextClick}
        title={`Verification Status: ${label}. Click to toggle.`}
        aria-label={`Verification status is currently ${label}. Click to cycle status.`}
        className={`inline-flex items-center gap-1 rounded-sm border transition-all hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[#1747E8] ${padding} ${bgColor}`}
      >
        <Icon className={`w-3 h-3 ${iconColor} flex-shrink-0`} aria-hidden="true" />
        <span className="font-semibold tracking-tight">{label}</span>
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border ${padding} ${bgColor}`}
      role="status"
      aria-label={`Verification status: ${label}`}
    >
      <Icon className={`w-3 h-3 ${iconColor} flex-shrink-0`} aria-hidden="true" />
      <span className="font-semibold tracking-tight">{label}</span>
    </span>
  );
};
