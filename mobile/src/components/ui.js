// Building blocks shared by the screens, drawn after the web app's charte:
// framed cards, gold double rules, green primary buttons.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BRAND_SVG, ICONS } from '../lib/core';
import { fonts, radius, useTheme } from '../theme';

/** Text in the app's faces. `variant`: body | bold | display. */
export function Txt({ variant = 'body', color, size, style, ...props }) {
  const { colors } = useTheme();
  const family = variant === 'display' ? fonts.display : variant === 'bold' ? fonts.bodyBold : fonts.body;
  return (
    <Text
      {...props}
      style={[{ fontFamily: family, color: color ?? colors.text, fontSize: size ?? 16, writingDirection: 'rtl' }, style]}
    />
  );
}

/** One of the web app's icons (js/core/iconPaths.js); decorative, hidden from screen readers. */
export function Icon({ name, size = 20, color }) {
  const { colors } = useTheme();
  return (
    <SvgXml
      xml={ICONS[name] || ICONS.document}
      width={size}
      height={size}
      color={color ?? colors.text}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function BrandMark({ size = 30 }) {
  return <SvgXml xml={BRAND_SVG} width={size} height={size} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

/** A section heading followed by a short gold double rule. */
export function SectionTitle({ children, style }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionTitle, style]}>
      <Txt variant="display" size={20} color={colors.heading} accessibilityRole="header">{children}</Txt>
      <View style={styles.doubleRule}>
        <View style={[styles.rule, { backgroundColor: colors.gold500 }]} />
        <View style={[styles.rule, { backgroundColor: colors.gold500 }]} />
      </View>
    </View>
  );
}

/** A card framed by a thin gold line inset from its edge, like an official form. */
export function Framed({ children, style }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.framed, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      <View pointerEvents="none" style={[styles.frameLine, { borderColor: colors.frame }]} />
      {children}
    </View>
  );
}

/** A tappable row: icon box, title, optional subtitle, and the «forward» chevron. */
export function ListCard({ icon, title, subtitle, onPress, accessibilityHint }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint}>
      {({ pressed }) => (
        <Framed style={[styles.listCard, pressed && { opacity: 0.85 }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.gold100 }]}>
            <Icon name={icon || 'document'} color={colors.gold600} />
          </View>
          <View style={styles.flex}>
            <Txt variant="bold" size={16}>{title}</Txt>
            {subtitle ? <Txt size={13} color={colors.textDim} numberOfLines={2}>{subtitle}</Txt> : null}
          </View>
          <Icon name="chevronLeft" color={colors.textFaint} />
        </Framed>
      )}
    </Pressable>
  );
}

const BUTTON_COLORS = (c) => ({
  primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
  outline: { bg: c.surface, fg: c.heading, border: c.heading },
  gold: { bg: c.gold500, fg: c.onGold, border: c.gold500 },
  danger: { bg: c.dangerBg, fg: c.danger, border: c.dangerBg },
  light: { bg: c.surface2, fg: c.text, border: c.surface2 },
});

/** Full-width by default; at least 48pt tall so it is easy to tap. */
export function Button({ title, icon, onPress, variant = 'primary', loading = false, disabled = false, compact = false, style }) {
  const { colors } = useTheme();
  const tone = BUTTON_COLORS(colors)[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: tone.bg, borderColor: tone.border, opacity: off ? 0.6 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={tone.fg} /> : icon ? <Icon name={icon} color={tone.fg} size={18} /> : null}
      <Txt variant="bold" color={tone.fg} size={compact ? 14 : 16}>{title}</Txt>
    </Pressable>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityLabel="جارٍ التحميل">
      <ActivityIndicator size="large" color={colors.heading} />
    </View>
  );
}

/** A short message in place of content (empty list, loading error). */
export function Note({ children, action }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Txt color={colors.textDim} style={styles.centerText}>{children}</Txt>
      {action}
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 12 },
  doubleRule: { width: 110, height: 5, justifyContent: 'space-between' },
  rule: { height: 1 },
  framed: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  frameLine: { position: 'absolute', top: 3, bottom: 3, left: 3, right: 3, borderWidth: 1, borderRadius: radius.sm },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10, minHeight: 64 },
  iconBox: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  button: {
    minHeight: 48, borderRadius: radius.sm, borderWidth: 1.5, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonCompact: { minHeight: 44, flex: 1, paddingHorizontal: 10 },
  center: { paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center', gap: 16 },
  centerText: { textAlign: 'center' },
});
