import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { MainTabs } from './MainTabs';
import { CourseOverviewScreen } from '../screens/CourseOverviewScreen';
import { LanguageSelectScreen } from '../screens/LanguageSelectScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useT } from '../i18n';
import { useAuthStore } from '../store/auth';
import { colors } from '../theme';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  LanguageSelect: undefined;
  CourseOverview: undefined;
};

export type AppStackParamList = {
  Main: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function Splash() {
  const t = useT();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <View style={styles.splash}>
      <Animated.View
        style={{
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.08] }) }],
        }}
      >
        <Image source={require('../../assets/brand/logo-wordmark.png')} style={styles.splashLogo} resizeMode="contain" />
      </Animated.View>
      <Text style={styles.splashTagline}>{t('splash.tagline')}</Text>
    </View>
  );
}

export function RootNavigator() {
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);

  if (!initialized) {
    return <Splash />;
  }

  return (
    <NavigationContainer>
      {token ? (
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Main" component={MainTabs} />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
          <AuthStack.Screen name="LanguageSelect" component={LanguageSelectScreen} options={{ presentation: 'modal' }} />
          <AuthStack.Screen name="CourseOverview" component={CourseOverviewScreen} options={{ presentation: 'modal' }} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.authBackground,
  },
  splashLogo: {
    width: 240,
    height: 68,
  },
  splashTagline: {
    marginTop: 14,
    fontSize: 15,
    color: colors.textMuted,
  },
});
