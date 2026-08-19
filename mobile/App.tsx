import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import React, { Component, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useConnectivity } from './src/api/connectivity';
import { queryClient } from './src/api/queryClient';
import { GamificationCelebration } from './src/components/GamificationCelebration';
import { OfflineScreen } from './src/components/OfflineScreen';
import { translate, useI18nStore } from './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initSecureStorage } from './src/storage';
import { useAuthStore } from './src/store/auth';
import { colors, radius, spacing } from './src/theme';

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

/**
 * Gates the whole app behind backend reachability: while `/health` is
 * unreachable the OfflineScreen replaces the navigator (no screen should
 * render in a state where every request would fail). The gate clears itself
 * automatically once the connection comes back.
 */
function ConnectivityGate({ children }: { children: ReactNode }) {
  const { status, retry } = useConnectivity();
  // Once offline, keep the offline screen up through the retry's 'checking'
  // phase (spinner on the button) — only a confirmed 'online' dismisses it.
  // On the very first mount 'checking' renders the app behind the splash.
  const [stuckOffline, setStuckOffline] = useState(false);
  useEffect(() => {
    if (status === 'offline') setStuckOffline(true);
    else if (status === 'online') setStuckOffline(false);
  }, [status]);

  if (status === 'offline' || (stuckOffline && status === 'checking')) {
    return <OfflineScreen retrying={status === 'checking'} onRetry={retry} />;
  }
  return <>{children}</>;
}

export default function App() {
  const restore = useAuthStore((s) => s.restore);
  const token = useAuthStore((s) => s.token);
  // If the secure-storage bootstrap fails (Keychain/Keystore unavailable),
  // restore() never runs and the app would sit on the splash forever. Fail
  // visibly with a retry instead — initSecureStorage is retryable by design.
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The credentials live in an MMKV encrypted with a device-bound key
      // (iOS Keychain / Android Keystore). The store's restore() reads them,
      // so the key must be loaded before anything touches auth state.
      try {
        await initSecureStorage();
        if (!cancelled) restore();
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restore, bootAttempt]);

  if (bootError) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View style={styles.crash}>
            <Text style={styles.crashTitle}>{translate(useI18nStore.getState().locale, 'common.somethingWrong')}</Text>
            <Text style={styles.crashBody}>{bootError}</Text>
            <Pressable
              style={styles.crashButton}
              onPress={() => {
                setBootError(null);
                setBootAttempt((n) => n + 1);
              }}
            >
              <Text style={styles.crashButtonText}>{translate(useI18nStore.getState().locale, 'common.tryAgain')}</Text>
            </Pressable>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <StatusBar style="dark" />
            <ConnectivityGate>
              <RootNavigator />
              {/* Global confetti/toasts for level-ups and new achievements —
                  mounted above the navigator, only while signed in (the stats
                  endpoint needs a JWT). */}
              {token ? <GamificationCelebration /> : null}
            </ConnectivityGate>
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
