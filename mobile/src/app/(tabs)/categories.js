import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { fetchCategories, fetchCategoryCounts } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Framed, Icon, Loading, Note, Txt } from '../../components/ui';
import { useTheme } from '../../theme';

export default function Categories() {
  const { colors } = useTheme();
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([fetchCategories(), fetchCategoryCounts()]),
    []
  );

  if (loading) return <Loading />;
  if (error) return <Note action={<Button title="إعادة المحاولة" variant="outline" onPress={reload} />}>تعذر تحميل التصنيفات.</Note>;
  const [categories, counts] = data;
  if (!categories.length) return <Note>لا توجد تصنيفات بعد.</Note>;

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {categories.map((c, i) => {
        const [bg, fg] = colors.tones[i % colors.tones.length];
        const count = counts[c.id] || 0;
        return (
          <Pressable
            key={c.id}
            style={styles.cell}
            onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id, name: c.name_ar } })}
            accessibilityRole="button"
            accessibilityLabel={`${c.name_ar}، ${count} وثيقة`}
          >
            {({ pressed }) => (
              <Framed style={[styles.tile, pressed && { opacity: 0.85 }]}>
                <View style={[styles.iconBox, { backgroundColor: bg, borderColor: fg }]}>
                  <Icon name={c.icon} color={fg} size={24} />
                </View>
                <Txt variant="bold" size={15} style={styles.center}>{c.name_ar}</Txt>
                <Txt size={13} color={colors.textDim}>{count} وثيقة</Txt>
              </Framed>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '48.5%' },
  tile: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 10, gap: 6, minHeight: 150 },
  iconBox: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  center: { textAlign: 'center' },
});
