import { useRef, useState } from 'react';
import { AccessibilityInfo, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { fetchDocumentType, fetchTemplateFields, incrementUsage, logGeneratedDocument } from '../../lib/api';
import { addHistoryEntry, OTHER_OPTION, validateField } from '../../lib/core';
import { useAsync } from '../../lib/useAsync';
import { Button, Loading, Note } from '../../components/ui';
import { FormField } from '../../components/fields';
import { useTheme } from '../../theme';

export default function DocForm() {
  const { id } = useLocalSearchParams();
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([fetchDocumentType(id), fetchTemplateFields(id)]),
    [id]
  );

  if (loading) return <Loading />;
  if (error) return <Note action={<Button title="إعادة المحاولة" variant="outline" onPress={reload} />}>تعذر تحميل هذه الوثيقة.</Note>;
  const [docType, fields] = data;
  return (
    <>
      <Stack.Screen options={{ title: docType.name_ar }} />
      <Form docType={docType} fields={fields} />
    </>
  );
}

function Form({ docType, fields }) {
  const { colors } = useTheme();
  const [values, setValues] = useState({});
  const [others, setOthers] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const scroll = useRef(null);
  const offsets = useRef({});

  // A list set to «أخرى» takes the typed text, like on the web.
  const valueOf = (field, v = values, o = others) =>
    v[field.field_key] === OTHER_OPTION ? (o[field.field_key] ?? '') : (v[field.field_key] ?? '');

  const check = (field, v, o) => {
    const message = validateField(field, valueOf(field, v, o));
    setErrors((e) => ({ ...e, [field.field_key]: message }));
    return !message;
  };

  // Same rhythm as the web form: checked when people leave a field; an
  // untouched empty field waits for the submit; an error clears as soon as
  // the value is right.
  const onBlur = (field, v = values, o = others) => {
    if (!valueOf(field, v, o).trim() && !errors[field.field_key]) return;
    check(field, v, o);
  };
  const onChange = (field, raw) => {
    const next = { ...values, [field.field_key]: raw };
    setValues(next);
    if (errors[field.field_key]) check(field, next, others);
    return next;
  };
  const onChangeOther = (field, raw) => {
    const next = { ...others, [field.field_key]: raw };
    setOthers(next);
    if (errors[field.field_key]) check(field, values, next);
  };

  async function submit() {
    const wrong = fields.filter((f) => !check(f, values, others));
    if (wrong.length) {
      const y = offsets.current[wrong[0].field_key];
      if (y != null) scroll.current?.scrollTo({ y: Math.max(y - 16, 0) });
      AccessibilityInfo.announceForAccessibility(`يرجى تصحيح ${wrong.length === 1 ? 'الحقل المحدد' : 'الحقول المحددة'}: ${wrong[0].label_ar}`);
      return;
    }
    const filled = Object.fromEntries(fields.map((f) => [f.field_key, valueOf(f)]));
    setBusy(true);
    try {
      // The statistics are best effort: the document is made even offline.
      await Promise.allSettled([incrementUsage(docType.id), logGeneratedDocument(docType.id, filled)]);
      const record = addHistoryEntry({ documentTypeId: docType.id, documentTypeName: docType.name_ar, data: filled });
      router.replace(`/ready/${record.id}`);
    } catch (e) {
      console.error(e);
      Alert.alert('تعذر توليد الوثيقة', 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {fields.map((field) => (
          <View key={field.field_key} onLayout={(e) => { offsets.current[field.field_key] = e.nativeEvent.layout.y; }}>
            <FormField
              field={field}
              value={values[field.field_key] ?? ''}
              otherValue={others[field.field_key] ?? ''}
              error={errors[field.field_key]}
              onChange={(raw) => onChange(field, raw)}
              onChangeOther={(raw) => onChangeOther(field, raw)}
              onBlur={(picked) => onBlur(field, picked === undefined ? values : { ...values, [field.field_key]: picked })}
            />
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <Button title={busy ? 'جارٍ التوليد...' : 'توليد الوثيقة'} icon="fileText" loading={busy} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 16, paddingBottom: 24 },
  footer: { padding: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
