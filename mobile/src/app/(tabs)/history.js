import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { deleteHistoryEntry, formatDateTimeShort, getHistory } from '../../lib/core';
import { Button, Framed, Icon, Note, Txt } from '../../components/ui';
import { useTheme } from '../../theme';

// Documents made on this device (kept on the device only, like on the web).
export default function History() {
  const { colors } = useTheme();
  const [items, setItems] = useState(() => getHistory());

  // Back from a new document: show it.
  useFocusEffect(useCallback(() => setItems(getHistory()), []));

  const remove = (item) =>
    Alert.alert('حذف الوثيقة من السجل؟', `${item.documentTypeName}\nلا يمكن التراجع عن هذا الحذف.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          deleteHistoryEntry(item.id);
          setItems(getHistory());
        },
      },
    ]);

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.page}
      ListEmptyComponent={
        <Note action={<Button title="تصفح التصنيفات" variant="outline" onPress={() => router.navigate('/categories')} />}>
          لم تنشئ أي وثيقة بعد. الوثائق التي تحرّرها تظهر هنا لتحميلها من جديد.
        </Note>
      }
      renderItem={({ item }) => (
        <Framed style={styles.card}>
          <View style={styles.top}>
            <View style={[styles.iconBox, { backgroundColor: colors.gold100 }]}>
              <Icon name="document" color={colors.gold600} />
            </View>
            <View style={styles.flex}>
              <Txt variant="bold">{item.documentTypeName}</Txt>
              <Txt size={13} color={colors.textDim}>{formatDateTimeShort(item.createdAt)}</Txt>
            </View>
          </View>
          <View style={styles.row}>
            <Button compact title="فتح" icon="open" variant="light" onPress={() => router.push(`/ready/${item.id}`)} />
            <Button compact title="حذف" icon="trash" variant="danger" onPress={() => remove(item)} />
          </View>
        </Framed>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, flexGrow: 1 },
  card: { padding: 16, marginBottom: 12, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', gap: 8 },
});
