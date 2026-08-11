import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from './src/api/client';
import { GamificationCelebration } from './src/components/GamificationCelebration';
import { translate, useI18nStore } from './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/auth';
import { colors, radius, spacing } from './src/theme';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // A 401 mid-session means the JWT expired or was revoked — end the
      // session so the app returns to the login screen instead of erroring.
      if (error instanceof ApiError && error.status === 401) {
        useAuthStore.getState().signOut();
      }
    },
  }),
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
  },
});

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error: Error | null };

/** Last line of defense: render a friendly recovery screen instead of a white screen. */
class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[app] fatal error', error);
  }

  render() {
    if (this.state.error) {
      // Class component — no hooks, so read the locale imperatively.
      const locale = useI18nStore.getState().locale;
      return (
        <View style={styles.crash}>
          <Text style={styles.crashTitle}>{translate(locale, 'common.somethingWrong')}</Text>
          <Text style={styles.crashBody}>{this.state.error.message}</Text>
          <Pressable style={styles.crashButton} onPress={() => this.setState({ error: null })}>
            <Text style={styles.crashButtonText}>{translate(locale, 'common.tryAgain')}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const restore = useAuthStore((s) => s.restore);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    restore();
  }, [restore]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <StatusBar style="dark" />
            <RootNavigator />
            {/* Global confetti/toasts for level-ups and new achievements —
                mounted above the navigator, only while signed in (the stats
                endpoint needs a JWT). */}
            {token ? <GamificationCelebration /> : null}
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  crash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  crashTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  crashBody: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  crashButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 4,
  },
  crashButtonText: {
    color: colors.textOnPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
});
