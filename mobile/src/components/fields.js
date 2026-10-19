// Form controls for a document's fields (v_template_fields rows). The rules
// are the web app's: same field types, same validation (core validators),
// «أخرى» lets people type a value missing from a list.
import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fieldOptions, formatDateAr, normalizeForSearch, OTHER_OPTION } from '../lib/core';
import { Button, Icon, Txt } from './ui';
import { fonts, radius, useTheme } from '../theme';

// Keyboard and capitalisation per field type (the web app's input types).
const KEYBOARD = {
  int: { keyboardType: 'number-pad' },
  phone: { keyboardType: 'phone-pad', textContentType: 'telephoneNumber', autoComplete: 'tel' },
  email: { keyboardType: 'email-address', autoCapitalize: 'none', textContentType: 'emailAddress', autoComplete: 'email' },
  cin: { autoCapitalize: 'characters', autoCorrect: false },
};

/** Label, control and error of one field. `value` is the raw string kept in the form. */
export function FormField({ field, value, otherValue, error, onChange, onChangeOther, onBlur }) {
  const { colors } = useTheme();
  const label = `${field.label_ar}${field.is_required ? '' : ' (اختياري)'}`;
  let control;
  if (field.field_type === 'select') {
    control = <SelectField field={field} value={value} label={label} invalid={!!error} onChange={(v) => { onChange(v); onBlur?.(v); }} />;
  } else if (field.field_type === 'date') {
    control = <DateField value={value} label={label} invalid={!!error} onChange={(v) => { onChange(v); onBlur?.(v); }} />;
  } else {
    control = (
      <TextInput
        value={value}
        onChangeText={onChange}
        onBlur={() => onBlur?.()}
        placeholder={field.placeholder_ar || ''}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        accessibilityHint={error || undefined}
        multiline={field.field_type === 'text'}
        {...KEYBOARD[field.field_type]}
        style={[inputStyle(colors, !!error), field.field_type === 'text' && styles.textarea]}
      />
    );
  }

  return (
    <View style={styles.field}>
      <Txt variant="bold" size={15} style={styles.label}>
        {field.is_required ? <Txt color={colors.danger} variant="bold">* </Txt> : null}
        {field.label_ar}
        {field.is_required ? null : <Txt size={13} color={colors.textDim}> (اختياري)</Txt>}
      </Txt>
      {control}
      {value === OTHER_OPTION ? (
        <TextInput
          value={otherValue}
          onChangeText={onChangeOther}
          onBlur={() => onBlur?.()}
          placeholder="اكتب القيمة"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={`${field.label_ar}: اكتب القيمة`}
          autoFocus
          style={[inputStyle(colors, !!error), styles.other]}
        />
      ) : null}
      {error ? (
        <Txt size={14} color={colors.danger} accessibilityLiveRegion="polite" style={styles.error}>{error}</Txt>
      ) : null}
    </View>
  );
}

function inputStyle(colors, invalid) {
  return [
    styles.input,
    { backgroundColor: colors.inputBg, borderColor: invalid ? colors.danger : colors.fieldBorder, color: colors.text },
  ];
}

/** A button showing the choice; tapping opens a searchable list. */
function SelectField({ field, value, label, invalid, onChange }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useMemo(
    () => fieldOptions(field).map((o) => ({ value: o, key: normalizeForSearch(o) })),
    [field]
  );
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  // «أخرى» stays visible so a missing value can always be typed.
  const visible = options.filter((o) => o.value === OTHER_OPTION || words.every((w) => o.key.includes(w)));
  const placeholder = field.placeholder_ar || '— اختر —';

  const choose = (v) => {
    setOpen(false);
    setQuery('');
    onChange(v);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'لم يتم الاختيار'}`}
        style={[inputStyle(colors, invalid), styles.selectButton]}
      >
        <Txt color={value ? colors.text : colors.textFaint} style={styles.flex}>{value || placeholder}</Txt>
        <Icon name="chevronLeft" color={colors.textDim} size={18} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={styles.sheetHead}>
            <Txt variant="display" size={20} color={colors.heading} style={styles.flex}>{field.label_ar}</Txt>
            <Button title="إغلاق" variant="light" compact style={styles.close} onPress={() => setOpen(false)} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث..."
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="ابحث في الخيارات"
            autoFocus={options.length > 8}
            style={inputStyle(colors, false)}
          />
          <FlatList
            data={visible}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Txt color={colors.textDim} style={styles.option}>لا توجد نتائج</Txt>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => choose(item.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                style={({ pressed }) => [styles.option, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.gold100 }]}
              >
                <Txt variant={item.value === value ? 'bold' : 'body'}>{item.value}</Txt>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => {
  const [y, m, d] = (s || '').split('-').map(Number);
  return y ? new Date(y, m - 1, d) : new Date();
};

/** Shows the date as «3 غشت 2026»; stores it as YYYY-MM-DD like the web form. */
function DateField({ value, label, invalid, onChange }) {
  const { colors, dark } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(fromIso(value));

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromIso(value),
        mode: 'date',
        onValueChange: (_e, date) => onChange(toIso(date)),
      });
    } else {
      setDraft(fromIso(value));
      setIosOpen(true);
    }
  };

  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDateAr(value) : 'لم يتم الاختيار'}`}
        style={[inputStyle(colors, invalid), styles.selectButton]}
      >
        <Txt color={value ? colors.text : colors.textFaint} style={styles.flex}>{value ? formatDateAr(value) : 'اختر تاريخاً'}</Txt>
        <Icon name="list" color={colors.textDim} size={18} />
      </Pressable>
      <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.dateCard, { backgroundColor: colors.surface }]}>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              themeVariant={dark ? 'dark' : 'light'}
              accentColor={colors.primary}
              onValueChange={(_e, date) => setDraft(date)}
            />
            <View style={styles.row}>
              <Button title="إلغاء" variant="light" compact onPress={() => setIosOpen(false)} />
              <Button title="تم" compact onPress={() => { setIosOpen(false); onChange(toIso(draft)); }} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { marginBottom: 18 },
  label: { marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: fonts.body, fontSize: 16, minHeight: 48, textAlign: 'right',
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  other: { marginTop: 8 },
  error: { marginTop: 5 },
  selectButton: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheet: { flex: 1, padding: 16, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { flex: 0, minWidth: 90 },
  option: { paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 20, 16, 0.55)', justifyContent: 'center', padding: 16 },
  dateCard: { borderRadius: radius.lg, padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
});
