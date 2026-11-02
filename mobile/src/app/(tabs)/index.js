import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { fetchMostRequested, searchDocumentTypes } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Icon, ListCard, Loading, Note, SectionTitle, Txt } from '../../components/ui';
import { fonts, radius, useTheme } from '../../theme';

// Same home as the web app: the search field first (finding a document is
// what people come for), the hero, then the most requested documents.
export default function Home() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: docs, error, loading, reload } = useAsync(
    () => (debounced ? searchDocumentTypes(debounced) : fetchMostRequested(5)),
    [debounced]
  );

  let list;
  if (loading) list = <Loading />;
  else if (error) list = <Note action={<Button title="إعادة المحاولة" variant="outline" onPress={reload} />}>تعذر تحميل الوثائق. تحقق من الاتصال بالإنترنت.</Note>;
  else if (!docs.length) list = <Note>{debounced ? 'لا توجد نتائج مطابقة' : 'لا توجد وثائق بعد'}</Note>;
  else {
    list = docs.map((d) => (
      <ListCard
        key={d.id}
        icon={d.icon}
        title={d.name_ar}
        subtitle={`${d.usage_count} استخدام · توليد فوري`}
        onPress={() => router.push(`/doc/${d.id}`)}
      />
    ));
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.fieldBorder }]}>
        <Icon name="search" color={colors.textDim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث عن وثيقة: شكاية، توكيل، عقد كراء…"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="ابحث عن وثيقة"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary, borderColor: colors.gold500 }]}>
        <Txt variant="display" size={24} color="#e0c27a" accessibilityRole="header">
          كاتب عمومي — وثائقك الإدارية في دقيقة واحدة
        </Txt>
        <Txt size={15} color={colors.onPrimaryDim} style={styles.heroText}>
          حرّر شكاياتك وتوكيلاتك وعقودك وطلباتك الرسمية بالعربية، وحمّلها بصيغة PDF جاهزة للطباعة.
        </Txt>
        <Button title="تصفح التصنيفات" icon="grid3" variant="gold" onPress={() => router.navigate('/categories')} style={styles.heroButton} />
      </View>

      <SectionTitle>{debounced ? 'نتائج البحث' : 'الأكثر طلباً'}</SectionTitle>
      {list}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 14, minHeight: 48, marginBottom: 16,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, paddingVertical: 10, textAlign: 'right' },
  hero: { borderRadius: radius.lg, borderWidth: 1, padding: 20, marginBottom: 20, gap: 10 },
  heroText: { lineHeight: 26 },
  heroButton: { alignSelf: 'flex-start', marginTop: 4 },
});
