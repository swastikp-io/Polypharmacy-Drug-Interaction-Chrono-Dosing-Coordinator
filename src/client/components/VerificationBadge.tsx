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
          bgColor: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          iconColor: 'text-emerald-600',
        };
      case 'unverified':
        return {
          label: 'Unverified',
          icon: AlertCircle,
          bgColor: 'bg-amber-50 text-amber-800 border-amber-300',
          iconColor: 'text-amber-600',
        };
      case 'unknown':
      default:
        return {
          label: 'Unknown',
          icon: HelpCircle,
          bgColor: 'bg-slate-100 text-slate-700 border-slate-300',
          iconColor: 'text-slate-500',
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

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  if (interactive) {
    return (
      <button
        type="button"
        onClick={handleNextClick}
        title={`Verification Status: ${label}. Click to toggle.`}
        aria-label={`Verification status is currently ${label}. Click to cycle status.`}
        className={`inline-flex items-center gap-1.5 rounded-full border transition-colors hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-clinical-500 focus:ring-offset-1 ${padding} ${bgColor}`}
      >
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${bgColor}`}
      role="status"
      aria-label={`Verification status: ${label}`}
    >
      <Icon className={`w-3.5 h-3.5 ${iconColor}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
