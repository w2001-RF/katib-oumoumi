import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import {
  APP_DESCRIPTION, APP_NAME, CONTACT_EMAIL, SITE_URL, TELEGRAM_BOT_URL,
} from '../../lib/core';
import { BrandMark, Framed, Icon, Txt } from '../../components/ui';
import { useTheme } from '../../theme';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

// No appearance setting here: the app follows the system's light/dark mode.
export default function Settings() {
  const { colors } = useTheme();
  const rows = [
    {
      group: 'التطبيق',
      items: [
        { icon: 'info', title: 'عن التطبيق', desc: `${APP_NAME} — v${VERSION}`, onPress: () => Alert.alert(`${APP_NAME} · الإصدار ${VERSION}`, APP_DESCRIPTION) },
        { icon: 'shield', title: 'سياسة الخصوصية', onPress: () => WebBrowser.openBrowserAsync(`${SITE_URL}#/privacy`) },
      ],
    },
    {
      group: 'دعمنا',
      items: [
        {
          icon: 'share2',
          title: 'شارك التطبيق',
          desc: 'أخبر أصدقاءك عن كاتب عمومي',
          onPress: () => Share.share({ message: `${APP_NAME} — وثائقك الإدارية في دقيقة واحدة ${SITE_URL}` }),
        },
        { icon: 'send', title: 'بوت تيليغرام', desc: 'حرّر وثيقتك بالمحادثة أو برسالة صوتية', onPress: () => Linking.openURL(TELEGRAM_BOT_URL) },
      ],
    },
    {
      group: 'تواصل معنا',
      items: [{ icon: 'mail', title: 'راسلنا', desc: CONTACT_EMAIL, onPress: () => Linking.openURL(`mailto:${CONTACT_EMAIL}`) }],
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {rows.map(({ group, items }) => (
        <View key={group}>
          <Txt variant="bold" size={13} color={colors.gold600} style={styles.group} accessibilityRole="header">{group}</Txt>
          {items.map((row) => (
            <Pressable key={row.title} onPress={row.onPress} accessibilityRole="button" accessibilityLabel={row.title} accessibilityHint={row.desc}>
              {({ pressed }) => (
                <Framed style={[styles.row, pressed && { opacity: 0.85 }]}>
                  <View style={[styles.iconBox, { backgroundColor: colors.tint }]}>
                    <Icon name={row.icon} color={colors.heading} size={18} />
                  </View>
                  <View style={styles.flex}>
                    <Txt variant="bold" size={15}>{row.title}</Txt>
                    {row.desc ? <Txt size={13} color={colors.textDim}>{row.desc}</Txt> : null}
                  </View>
                </Framed>
              )}
            </Pressable>
          ))}
        </View>
      ))}
      <View style={styles.footer}>
        <BrandMark size={44} />
        <Txt size={13} color={colors.textFaint}>{APP_NAME} v{VERSION}</Txt>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32 },
  group: { marginTop: 18, marginBottom: 8, marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 8, minHeight: 56 },
  iconBox: { width: 34, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  footer: { alignItems: 'center', gap: 8, marginTop: 28 },
});
