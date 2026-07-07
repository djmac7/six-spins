import { Crosshair, Flame, Handshake, Shield, Timer, Grab } from 'lucide-react'

// Placeholder representative line-icons per attribute (real SVGs, swap for custom art later):
// 🎯→crosshair (sniper) · scoring→flame (bucket-getter) · playmaking→handshake (dimes) ·
// defense→shield (lockdown/anchor) · clutch→timer (dagger time) · rebounding→grab (boards).
const ICONS = {
  shooting: Crosshair,
  scoring: Flame,
  playmaking: Handshake,
  defense: Shield,
  clutch: Timer,
  rebounding: Grab,
}

export default function AbilityIcon({ ability, size = 16, strokeWidth = 2.2, className }) {
  const Icon = ICONS[ability]
  if (!Icon) return null
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
