import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCircle2, Mic, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCatalogStats } from '../api/hooks';
import { PrimaryButton } from '../components/PrimaryButton';
import { Card, ScreenHeader } from '../components/ui';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useT } from '../i18n';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'CourseOverview'>;

function StatTile({ value, label }: { value: number | undefined; label: string }) {
  return (
    <Card style={styles.statTile}>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function MethodStep({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * Pre-login course overview. Every number shown here is a live count from
 * `/api/planets/catalog` (planets / sentences / lessons actually seeded in
 * the database) — there are no marketing estimates or projected outcomes on
 * this screen.
 */
export function CourseOverviewScreen({ navigation }: Props) {
  const t = useT();
  const { data: stats, isLoading } = useCatalogStats();

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.speechRow}>
          <Image source={require('../../assets/brand/mascot-astronaut.png')} style={styles.mascot} resizeMode="contain" />
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{t('course.bubble')}</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>{t('course.eyebrow')}</Text>
        <Text style={styles.title}>{t('course.title')}</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t('course.loading')}</Text>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <StatTile value={stats?.planets} label={t('course.statPlanets')} />
            <StatTile value={stats?.sentences} label={t('course.statSentences')} />
            <StatTile value={stats?.lessons} label={t('course.statLessons')} />
          </View>
        )}

        <Card style={styles.methodCard}>
          <MethodStep
            icon={<Mic size={18} color={colors.primary} />}
            title={t('course.stepSpeak')}
            body={t('course.stepSpeakBody')}
          />
          <MethodStep
            icon={<CheckCircle2 size={18} color={colors.primary} />}
            title={t('course.stepCorrect')}
            body={t('course.stepCorrectBody')}
          />
          <MethodStep
            icon={<RefreshCw size={18} color={colors.primary} />}
            title={t('course.stepReview')}
            body={t('course.stepReviewBody')}
          />
        </Card>

        <Text style={styles.bodyText}>{t('course.body')}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton title={t('course.cta')} onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  speechRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  mascot: {
    width: 72,
    height: 108,
  },
  bubble: {
    flex: 1,
    marginLeft: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 4,
    padding: spacing.sm + 2,
  },
  bubbleText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  eyebrow: {
    ...typography.eyebrow,
    marginTop: spacing.md,
    color: colors.primary,
  },
  title: {
    ...typography.display,
    marginTop: 2,
    color: colors.text,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  statValue: {
    ...typography.display,
    fontSize: 24,
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
    fontWeight: '600',
    color: colors.textMuted,
  },
  methodCard: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    ...typography.body,
    fontWeight: '800',
    color: colors.text,
  },
  stepBody: {
    ...typography.caption,
    marginTop: 1,
    color: colors.textMuted,
  },
  bodyText: {
    ...typography.body,
    marginTop: spacing.lg,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.lg,
  },
});
