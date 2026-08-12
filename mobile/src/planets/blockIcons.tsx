import {
  Blocks,
  BookOpen,
  Brain,
  Hand,
  Headphones,
  MessageCircle,
  Mic,
  Shuffle,
  Trophy,
  Users,
} from 'lucide-react-native';
import React from 'react';
import type { PlanetLessonKind } from '../types';

/**
 * One icon per block kind of the standard ten-block path. The block list is
 * scanned rather than read, so the icon carries the meaning ("this is the
 * listening one") before the title does.
 */
const ICONS: Record<PlanetLessonKind, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  context: Hand,
  vocabulary: BookOpen,
  phrases: MessageCircle,
  structure: Blocks,
  listening: Headphones,
  pronunciation: Mic,
  recall: Brain,
  variations: Shuffle,
  conversation: Users,
  mission: Trophy,
};

export function BlockIcon({
  kind,
  size = 20,
  color,
}: {
  kind: PlanetLessonKind;
  size?: number;
  color?: string;
}) {
  // An unknown kind (content added server-side ahead of the app) still gets a
  // sensible glyph rather than an empty circle.
  const Icon = ICONS[kind] ?? BookOpen;
  return <Icon size={size} color={color} strokeWidth={2} />;
}
