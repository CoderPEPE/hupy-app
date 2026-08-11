import React from 'react';
import { ChapterIntroScreen } from '../screens/ChapterIntroScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { FlashcardsScreen } from '../screens/FlashcardsScreen';
import { LessonsScreen } from '../screens/LessonsScreen';
import { PlanetsHomeScreen } from '../screens/PlanetsHomeScreen';
import { PlanetsScreen } from '../screens/PlanetsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useUiStore } from '../store/ui';

/**
 * Post-login shell: renders the active area (Chat, Flashcards, Planets).
 * The AppTabBar (bottom navigation) lives inside each screen so the center
 * "Chat" button can float above the bar.
 */
export function MainTabs() {
  const activeTab = useUiStore((s) => s.activeTab);
  const selectedPlanetId = useUiStore((s) => s.selectedPlanetId);
  const lessonIntro = useUiStore((s) => s.lessonIntro);

  if (lessonIntro) return <ChapterIntroScreen />;

  switch (activeTab) {
    case 'flashcards':
      return <FlashcardsScreen />;
    case 'planets':
      // The planets tab has two levels: the "Hi, {name}" overview list, and
      // (once a planet is opened) the per-planet lesson-path detail screen.
      return selectedPlanetId ? <PlanetsScreen /> : <PlanetsHomeScreen />;
    case 'lessons':
      return <LessonsScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'chat':
    default:
      return <ChatScreen />;
  }
}
