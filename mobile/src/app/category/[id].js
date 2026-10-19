import { ScrollView, StyleSheet } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { fetchCategory, fetchDocumentTypesByCategory } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, ListCard, Loading, Note } from '../../components/ui';

export default function CategoryDetail() {
  // `name` comes along from the categories grid so the title shows at once.
  const { id, name } = useLocalSearchParams();
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([name ? { name_ar: name } : fetchCategory(id), fetchDocumentTypesByCategory(id)]),
    [id]
  );

  const title = data?.[0]?.name_ar ?? name ?? '';
  let body;
  if (loading) body = <Loading />;
  else if (error) body = <Note action={<Button title="إعادة المحاولة" variant="outline" onPress={reload} />}>تعذر تحميل هذا التصنيف.</Note>;
  else if (!data[1].length) body = <Note>لا توجد وثائق في هذا التصنيف بعد.</Note>;
  else {
    body = data[1].map((d) => (
      <ListCard key={d.id} icon={d.icon} title={d.name_ar} subtitle={d.description_ar} onPress={() => router.push(`/doc/${d.id}`)} />
    ));
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.page}>{body}</ScrollView>
    </>
  );
}

const styles = StyleSheet.create({ page: { padding: 16 } });
