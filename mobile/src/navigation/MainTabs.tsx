import React from 'react';
import { AudioScreen } from '../screens/AudioScreen';
import { ChapterIntroScreen } from '../screens/ChapterIntroScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { FlashcardsScreen } from '../screens/FlashcardsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LessonsScreen } from '../screens/LessonsScreen';
import { PlanetsHomeScreen } from '../screens/PlanetsHomeScreen';
import { PlanetsScreen } from '../screens/PlanetsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useUiStore } from '../store/ui';

/**
 * Post-login shell: renders the active area. The spec's five tabs are Home,
 * Planets, Chat, Flashcards and Audio; Lessons (global) and Profile stay
 * reachable internally — Profile opens from the Home avatar.
 * The AppTabBar (bottom navigation) lives inside each screen so the center
 * "Chat" button can float above the bar.
 */
export function MainTabs() {
  const activeTab = useUiStore((s) => s.activeTab);
  const selectedPlanetId = useUiStore((s) => s.selectedPlanetId);
  const lessonIntro = useUiStore((s) => s.lessonIntro);

  if (lessonIntro) return <ChapterIntroScreen />;

  switch (activeTab) {
    case 'home':
      return <HomeScreen />;
    case 'flashcards':
      return <FlashcardsScreen />;
    case 'planets':
      // The planets tab has two levels: the journey overview list, and (once
      // a planet is opened) the per-planet 10-block detail screen.
      return selectedPlanetId ? <PlanetsScreen /> : <PlanetsHomeScreen />;
    case 'audio':
      return <AudioScreen />;
    case 'lessons':
      return <LessonsScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'chat':
    default:
      return <ChatScreen />;
  }
}
