// The charte « Makhzen » of the web app (css/styles.css :root tokens), for
// React Native. Light by default; dark follows the system setting (no
// in-app switch, the platform owns that choice).
import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f5f0',
  surface: '#ffffff',
  surface2: '#eeebe1',
  inputBg: '#ffffff',
  border: '#e4dfd0',
  fieldBorder: '#8f8978',
  frame: '#d9cfb4',
  text: '#1b1a17',
  textDim: '#6b665a',
  textFaint: '#76705f',
  heading: '#0f4c3a',
  link: '#0f4c3a',
  primary: '#0f4c3a',
  primary900: '#0a3428',
  onPrimary: '#f6f1e2',
  onPrimaryDim: '#cfc7ae',
  gold600: '#8a6a24',
  gold500: '#b8913a',
  gold400: '#d4b46a',
  gold100: '#f3ead3',
  onGold: '#1b1a17',
  seal: '#b22234',
  success: '#1f7a4d',
  successBg: '#e3f2e8',
  danger: '#b22234',
  dangerBg: '#f8e6e6',
  tint: '#e7efe9',
  tones: [
    ['#e3efe8', '#0f4c3a'], ['#f5ecd6', '#8a6a24'], ['#f8e4e5', '#b22234'],
    ['#f1e8de', '#6b4a2b'], ['#e4eaf5', '#1e4c9a'], ['#dff0ed', '#136f63'],
  ],
};

const dark = {
  ...light,
  bg: '#0e1412',
  surface: '#161e1b',
  surface2: '#1d2723',
  inputBg: '#111815',
  border: '#2a3530',
  fieldBorder: '#66716b',
  frame: '#3f3a2a',
  text: '#ece6d6',
  textDim: '#a8a191',
  textFaint: '#938d7c',
  heading: '#9ad4bb',
  link: '#9ad4bb',
  primary: '#15654d',
  primary900: '#0a2e24',
  gold600: '#dcbc6c',
  gold500: '#c9a24a',
  gold400: '#e0c27a',
  gold100: '#2b2516',
  success: '#62c493',
  successBg: '#15301f',
  danger: '#f0767f',
  dangerBg: '#3a1b1e',
  tint: '#1b2b24',
  tones: [
    ['#183229', '#8fd1b5'], ['#2f2817', '#e0c27a'], ['#361c20', '#f08f97'],
    ['#2e241b', '#d6b08a'], ['#1a2438', '#9db8ec'], ['#142e2b', '#7fd3c6'],
  ],
};

// Font families loaded in src/app/_layout.js (@expo-google-fonts).
export const fonts = {
  body: 'IBMPlexSansArabic_400Regular',
  bodyBold: 'IBMPlexSansArabic_700Bold',
  display: 'Amiri_700Bold',
};

export const radius = { sm: 6, md: 8, lg: 10 };

export function useTheme() {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? dark : light, dark: scheme === 'dark' };
}

// Green title bar, like the web app's header (stack and tab screens).
export function headerOptions(colors) {
  return {
    headerStyle: { backgroundColor: colors.primary },
    headerTintColor: colors.onPrimary,
    headerTitleStyle: { fontFamily: fonts.display, fontSize: 21 },
    headerTitleAlign: 'center',
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
  };
}
