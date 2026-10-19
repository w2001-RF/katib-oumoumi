// Must come first: the shared core reads localStorage and crypto on import.
import '../lib/polyfills';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from '@expo-google-fonts/ibm-plex-sans-arabic/useFonts';
import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic/700Bold';
import { Amiri_700Bold } from '@expo-google-fonts/amiri/700Bold';
import { headerOptions, useTheme } from '../theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colors } = useTheme();
  const [loaded, error] = useFonts({ IBMPlexSansArabic_400Regular, IBMPlexSansArabic_700Bold, Amiri_700Bold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Without the fonts the app still works in the system face.
  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ ...headerOptions(colors), headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="category/[id]" options={{ title: '' }} />
        <Stack.Screen name="doc/[id]" options={{ title: '' }} />
        <Stack.Screen name="ready/[id]" options={{ title: 'الوثيقة جاهزة' }} />
      </Stack>
    </>
  );
}
