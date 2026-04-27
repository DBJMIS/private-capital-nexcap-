import { cn } from '@/lib/utils';

const PALETTE = [
  'bg-[#0B1F45] text-white',
  'bg-[#0F8A6E] text-white',
  'bg-[#C8973A] text-white',
  'bg-blue-600 text-white',
  'bg-purple-600 text-white',
  'bg-rose-600 text-white',
];

function initialsFromName(name: string) {
  const parts = name
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase() || '??';
}

function paletteIndex(name: string) {
  const c = name.trim().toUpperCase().charCodeAt(0);
  if (!Number.isFinite(c) || c < 65) return 0;
  return (c - 65) % PALETTE.length;
}

export type AvatarInitialsProps = {
  name: string;
  className?: string;
};

export function AvatarInitials({ name, className }: AvatarInitialsProps) {
  const initials = initialsFromName(name);
  const tone = PALETTE[paletteIndex(name)] ?? PALETTE[0];
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        tone,
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
