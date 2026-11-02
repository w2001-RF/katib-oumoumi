import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { fetchDocumentType, fetchTemplateFields } from '../../lib/api';
import { documentHtml, getHistoryEntry, renderTemplate } from '../../lib/core';
import { buildPdf, printDocument, sharePdf } from '../../lib/pdf';
import { useAsync } from '../../lib/useAsync';
import { Button, Icon, Loading, Note, Txt } from '../../components/ui';
import { radius, useTheme } from '../../theme';

// A saved document (history entry), filled with its template: share it as a
// PDF, print it, or read it on screen.
export default function Ready() {
  const { id } = useLocalSearchParams();
  const entry = getHistoryEntry(id);
  const { data, error, loading, reload } = useAsync(async () => {
    if (!entry) return null;
    const [docType, fields] = await Promise.all([
      fetchDocumentType(entry.documentTypeId),
      fetchTemplateFields(entry.documentTypeId),
    ]);
    return renderTemplate(docType.template_body, fields, entry.data);
  }, [id]);

  if (!entry) return <Note>تعذر العثور على هذه الوثيقة.</Note>;
  if (loading) return <Loading />;
  if (error) return <Note action={<Button title="إعادة المحاولة" variant="outline" onPress={reload} />}>تعذر تحميل قالب الوثيقة. تحقق من الاتصال بالإنترنت.</Note>;
  return <Actions title={entry.documentTypeName} bodyHtml={data} />;
}

function Actions({ title, bodyHtml }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(null); // 'share' | 'print'
  const [preview, setPreview] = useState(false);
  const pdfUri = useRef(null); // built once, then shared again instantly

  async function run(kind, task) {
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      console.error(e);
      Alert.alert('تعذر إتمام العملية', e?.message || 'حاول مرة أخرى.');
    } finally {
      setBusy(null);
    }
  }

  const share = () => run('share', async () => {
    pdfUri.current ??= await buildPdf(bodyHtml, title);
    await sharePdf(pdfUri.current, title);
  });
  const print = () => run('print', () => printDocument(bodyHtml, title));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.check, { backgroundColor: colors.successBg, borderColor: colors.gold500 }]}>
        <Icon name="checkCircle" color={colors.success} size={40} />
      </View>
      <Txt variant="display" size={26} color={colors.heading} accessibilityRole="header">الوثيقة جاهزة</Txt>
      <Txt color={colors.textDim} style={styles.subtitle}>{title}</Txt>

      <View style={styles.actions}>
        <Button title="مشاركة PDF" icon="share2" loading={busy === 'share'} disabled={!!busy} onPress={share} />
        <Button title="طباعة" icon="download" variant="outline" loading={busy === 'print'} disabled={!!busy} onPress={print} />
        <Button
          title={preview ? 'إخفاء المعاينة' : 'معاينة الوثيقة'}
          icon="fileText"
          variant="light"
          onPress={() => setPreview((p) => !p)}
        />
      </View>
      <Txt size={13} color={colors.textDim} style={styles.note}>
        «مشاركة PDF» ترسل الملف عبر واتساب أو البريد الإلكتروني أو تحفظه في الملفات.
      </Txt>

      {preview ? (
        <View style={[styles.paper, { borderColor: colors.frame }]}>
          <WebView
            source={{ html: documentHtml(bodyHtml, title, { extraCss: 'body { margin: 22px; font-size: 15px; }' }) }}
            style={styles.webview}
            accessibilityLabel={`معاينة ${title}`}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 36, alignItems: 'center' },
  check: { width: 84, height: 84, borderRadius: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  subtitle: { marginTop: 4, marginBottom: 24, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10 },
  note: { marginTop: 12, textAlign: 'center' },
  paper: { alignSelf: 'stretch', height: 480, marginTop: 20, borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#fff' },
  webview: { flex: 1, backgroundColor: '#fff' },
});
