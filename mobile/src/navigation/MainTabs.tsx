import React from 'react';
import { ChatScreen } from '../screens/ChatScreen';
import { FlashcardsScreen } from '../screens/FlashcardsScreen';
import { PlanetsScreen } from '../screens/PlanetsScreen';
import { useUiStore } from '../store/ui';

/**
 * Post-login shell: renders the active area (Chat, Flashcards, Planets).
 * The AppTabBar (bottom navigation) lives inside each screen so the center
 * "Chat" button can float above the bar.
 */
export function MainTabs() {
  const activeTab = useUiStore((s) => s.activeTab);

  switch (activeTab) {
    case 'flashcards':
      return <FlashcardsScreen />;
    case 'planets':
      return <PlanetsScreen />;
    case 'chat':
    default:
      return <ChatScreen />;
  }
}
