// French / Latin spellings of Moroccan place names, mapped to the Arabic
// spelling used in the option lists (supabase/templates.sql, «المدن»).
// Users often type "Casablanca" or "Fès": the value must still end up as the
// Arabic option, whatever the model returned.

const ALIASES: Record<string, string[]> = {
  'الرباط': ['Rabat'],
  'الدار البيضاء': ['Casablanca', 'Casa', 'Dar El Beida', 'Dar Beida'],
  'فاس': ['Fès', 'Fez'],
  'مراكش': ['Marrakech', 'Marrakesh', 'Marrakch'],
  'طنجة': ['Tanger', 'Tangier', 'Tanja'],
  'سلا': ['Salé', 'Sla'],
  'مكناس': ['Meknès'],
  'أكادير': ['Agadir'],
  'وجدة': ['Oujda'],
  'القنيطرة': ['Kénitra'],
  'تطوان': ['Tétouan', 'Tetuan'],
  'تمارة': ['Témara'],
  'آسفي': ['Safi', 'Asfi'],
  'العيون': ['Laâyoune', 'El Aaiun', 'Layoune'],
  'المحمدية': ['Mohammedia', 'Mohamedia'],
  'خريبكة': ['Khouribga'],
  'الجديدة': ['El Jadida', 'Jadida'],
  'بني ملال': ['Béni Mellal', 'Beni Melal'],
  'الناظور': ['Nador'],
  'تازة': ['Taza'],
  'الخميسات': ['Khémisset', 'Khemisset'],
  'برشيد': ['Berrechid', 'Berchid'],
  'العرائش': ['Larache'],
  'القصر الكبير': ['Ksar El Kébir', 'Ksar Kebir'],
  'سطات': ['Settat'],
  'بوجدور': ['Boujdour'],
  'الحسيمة': ['Al Hoceïma', 'Al Hoceima', 'Hoceima', 'El Hoceima'],
  'كلميم': ['Guelmim'],
  'الرشيدية': ['Errachidia', 'Er-Rachidia'],
  'تاوريرت': ['Taourirt'],
  'إنزكان': ['Inezgane'],
  'أيت ملول': ['Aït Melloul', 'Ait Meloul'],
  'تارودانت': ['Taroudant'],
  'الصويرة': ['Essaouira'],
  'خنيفرة': ['Khénifra'],
  'سيدي قاسم': ['Sidi Kacem'],
  'سيدي سليمان': ['Sidi Slimane'],
  'بركان': ['Berkane'],
  'وادي زم': ['Oued Zem'],
  'صفرو': ['Sefrou'],
  'بنجرير': ['Benguerir', 'Ben Guerir'],
  'الفقيه بن صالح': ['Fquih Ben Salah', 'Fkih Ben Salah', 'Fkih Ben Saleh'],
  'قلعة السراغنة': ['Kelâat Sraghna', 'El Kelaa des Sraghna', 'Kelaa des Sraghna', 'Kalaat Sraghna'],
  'تيزنيت': ['Tiznit'],
  'سيدي بنور': ['Sidi Bennour'],
  'المضيق': ["M'diq", 'Mdiq'],
  'الفنيدق': ['Fnideq'],
  'أصيلة': ['Asilah', 'Assilah'],
  'جرادة': ['Jerada'],
  'جرسيف': ['Guercif'],
  'الداخلة': ['Dakhla'],
  'طنطان': ['Tan-Tan'],
  'سيدي إفني': ['Sidi Ifni'],
  'ميدلت': ['Midelt'],
  'تنغير': ['Tinghir', 'Tinerhir'],
  'زاكورة': ['Zagora'],
  'بنسليمان': ['Benslimane', 'Ben Slimane'],
  'إفران': ['Ifrane'],
  'آزرو': ['Azrou'],
  'بولمان': ['Boulemane'],
  'الحاجب': ['El Hajeb'],
  'تاونات': ['Taounate'],
  'الدريوش': ['Driouch'],
  'بوعرفة': ['Bouarfa'],
  'سوق الأربعاء الغرب': ['Souk El Arbaa', 'Souk Larbaa', 'Souk El Arbaa du Gharb'],
  'أزيلال': ['Azilal'],
  'سوق السبت أولاد النمة': ['Souk Sebt', 'Souk Sebt Oulad Nemma', 'Souk Es-Sebt'],
  'النواصر': ['Nouaceur'],
  'مديونة': ['Médiouna'],
  'اليوسفية': ['Youssoufia'],
  'شيشاوة': ['Chichaoua'],
  'تحناوت': ['Tahannaout'],
  'أرفود': ['Erfoud'],
  'بيوكرى': ['Biougra'],
  'أولاد التايمة': ['Oulad Teima', 'Ouled Teima'],
  'آسا': ['Assa'],
  'السمارة': ['Smara', 'Es-Semara'],
  'طرفاية': ['Tarfaya'],
  'أوسرد': ['Aousserd'],
};

/** Lower case, no accents, letters only: "M'diq" → "mdiq", "Fès" → "fes". */
export function foldLatin(s: string): string {
  return s.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().replaceAll(/[^a-z]/g, '');
}

const BY_LATIN = new Map<string, string>(
  Object.entries(ALIASES).flatMap(([arabic, latin]) => latin.map((name) => [foldLatin(name), arabic] as [string, string])),
);

/** The Arabic name of a place typed in Latin letters, or null when unknown. */
export function arabicPlaceName(value: string): string | null {
  const key = foldLatin(value);
  return key ? BY_LATIN.get(key) ?? null : null;
}

const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;

export function hasLatinLetters(value: string): boolean {
  return LATIN_LETTER.test(value);
}
