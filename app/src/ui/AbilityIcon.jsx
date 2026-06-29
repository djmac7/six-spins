import { Crosshair, Flame, Handshake, Lock, Shield, Grab } from 'lucide-react'

// Placeholder representative line-icons per attribute (real SVGs, swap for custom art later):
// 🎯→crosshair (sniper) · scoring→flame (bucket-getter) · playmaking→handshake (dimes) ·
// perimeter→lock (lockdown) · interior→shield (rim anchor) · rebounding→grab (boards).
const ICONS = {
  shooting: Crosshair,
  scoring: Flame,
  playmaking: Handshake,
  perimeter_d: Lock,
  rim_protection: Shield,
  rebounding: Grab,
}

export default function AbilityIcon({ ability, size = 16, strokeWidth = 2.2, className }) {
  const Icon = ICONS[ability]
  if (!Icon) return null
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
