import {
  Award,
  BookOpen,
  Calendar,
  Crown,
  Flag,
  Flame,
  Gem,
  Globe,
  GraduationCap,
  Layers,
  Medal,
  MessageCircle,
  Mic,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from 'lucide-react-native';
import { colors } from '../theme';
import type { AchievementTier } from '../api/gamification';

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

/** Every `icon` value used by the seeded achievements
 * (migrations/2026-08-11-000010_achievements). Unknown names fall back to
 * Award, so a new achievement is never blocked on a client release. */
const ICONS: Record<string, IconComponent> = {
  award: Award,
  'book-open': BookOpen,
  calendar: Calendar,
  crown: Crown,
  flag: Flag,
  flame: Flame,
  gem: Gem,
  globe: Globe,
  'graduation-cap': GraduationCap,
  layers: Layers,
  medal: Medal,
  'message-circle': MessageCircle,
  mic: Mic,
  rocket: Rocket,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  target: Target,
  trophy: Trophy,
  zap: Zap,
};

export function achievementIcon(name: string): { Icon: IconComponent } {
  return { Icon: ICONS[name] ?? Award };
}

/** Tier drives the colour, so rarity reads at a glance. */
export const TIER_COLORS: Record<AchievementTier, { tint: string; soft: string }> = {
  bronze: { tint: '#B45309', soft: '#FEF3C7' },
  silver: { tint: '#64748B', soft: '#E2E8F0' },
  gold: { tint: colors.gold, soft: colors.warningSoft },
  platinum: { tint: colors.primary, soft: colors.primarySoft },
};
