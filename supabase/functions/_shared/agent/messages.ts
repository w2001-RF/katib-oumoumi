// Fixed bot texts (Moroccan Darija, Arabic script). Kept out of the model so
// the consent notice and error messages are always exactly what was approved.

const PRIVACY =
  'باش نخدم معاك، المعلومات اللي غادي تعطيني (السمية، رقم البطاقة، التيليفون...) والرسائل الصوتية والتصاور ' +
  'كيتصيفطو لخدمات ذكاء اصطناعي خارجية باش نفهمهم، وكنحتافظو بيهم غير باش نوجدو الوثيقة ديالك ونعاودو نخدمو بيهم من بعد.\n' +
  'الرسائل الصوتية والتصاور ما كنحتافظوش بيهم. المحادثات القديمة كتمسح من بعد 30 يوم.\n' +
  'تقدر تشوف شنو محفوظ عليك بـ /mydata، وتمسحو كامل فأي وقت بـ /forget.';

const bullets = (labels: string[]) => labels.map((l) => '• ' + l).join('\n');
const quoted = (labels: string[]) => labels.map((l) => '«' + l + '»').join(' و');

function statusNext(missing: string[], confirming: boolean): string {
  if (confirming) return 'كلشي واجد، كنتسناو غير التأكيد ديالك.';
  if (missing.length) return `باقي خاصني: ${missing.join('، ')}.`;
  return 'باقي غير شي معلومات اختيارية.';
}

export const MSG = {
  consent:
    'السلام عليكم، أنا كاتب عمومي ديال "كاتب عمومي" 👋\n' +
    'نقدر نوجد ليك شكاية، وكالة، عقد... غير بالهضرة، بالكتابة ولا بتصويرة.\n\n' +
    PRIVACY + '\n\n' +
    'واش موافق؟ جاوب بـ "نعم" ولا كليكي على الزر.',
  privacy: `🔒 الخصوصية\n${PRIVACY}`,
  consentButton: '✅ موافق',
  consentNeeded: 'باش نبداو خاصك توافق أولاً. جاوب بـ "نعم" ولا كليكي على "موافق".',
  welcome: 'مرحبا بيك! قول ليا بالهضرة ولا بالكتابة شنو المشكل ديالك ولا شنو الوثيقة اللي محتاج.',
  askWhichDocument: 'شنو هي الوثيقة اللي محتاج؟ عاود ليا شوية على المشكل ديالك.',
  chooseDocument: 'واش كتقصد وحدة من هادو؟ جاوب بالرقم:',
  noMatch: 'سمح ليا، هاد الوثيقة باقا ما كايناش عندنا. الوثائق اللي كاينين:',
  chosen: (name: string) => `مزيان، غادي نوجد ليك: ${name} 📝`,
  imageNotSupported: 'سمح ليا، دابا ما نقدرش نقرا التصاور. عافاك كتب ولا قول ليا المعلومات.',
  imageBeforeDocument: 'وصلاتني التصويرة 👍 ولكن قول ليا أولاً شنو الوثيقة اللي بغيتي، ومن بعد عاود صيفطها.',
  voiceNotSupported: 'سمح ليا، دابا ما نقدرش نسمع الرسائل الصوتية. عافاك كتب ليا.',
  unsupported: 'سمح ليا، هاد النوع ديال الملفات ما نقدرش نقراه. صيفط تصويرة ولا كتب ليا.',
  emptyTranscript: 'ما فهمتش الرسالة الصوتية مزيان. عاود عافاك بشوية وفبلاصة هادئة.',
  voiceTooLong: (minutes: number) => `الرسالة الصوتية طويلة بزاف ⏱️ عافاك قسمها لرسائل قصار (أقل من ${minutes} دقايق)، ولا كتب ليا.`,
  voiceFailed: 'سمح ليا، ما قدرتش نسمع الرسالة الصوتية دابا 😔 عاود صيفطها من بعد شوية، ولا كتب ليا.',
  heard: (transcript: string) => `🎙️ سمعت: «${transcript}»`,
  voiceOn: 'تمام، غادي نجاوبك حتى بالصوت 🔊 باش توقفها كتب /voice.',
  voiceOff: 'تمام، غادي نجاوبك غير بالكتابة. باش ترجع الصوت كتب /voice.',
  voiceRepliesUnavailable: 'سمح ليا، الردود الصوتية ما مفعلاش دابا. تقدر تصيفط ليا رسائل صوتية ونجاوبك بالكتابة.',
  confirmIntro: 'هادي هي المعلومات اللي عندي:',
  confirmQuestion: 'واش كلشي صحيح؟',
  confirmYes: '✅ صحيح، وجد الوثيقة',
  confirmEdit: '✏️ بغيت نبدل شي حاجة',
  whatToEdit: 'قول ليا شنو بغيتي تبدل (مثلاً: "رقم التيليفون هو 0612345678").',
  generating: 'كنوجد ليك الوثيقة دابا ⏳',
  done: 'ها هي الوثيقة ديالك جاهزة ✅',
  htmlFallback: 'حل هاد الملف فالمتصفح وطبعو (Imprimer).',
  nextSteps: 'شنو خاصك دير دابا:',
  another: 'إلا بغيتي وثيقة أخرى، غير قول ليا.',
  cancelled: 'تلغات الوثيقة. إلا بغيتي تبدا من جديد قول ليا شنو محتاج.',
  forgotten: 'تمسحو جميع المعلومات ديالك. إلا بغيتي ترجع تخدم معايا، كتب /start.',
  help:
    'كيفاش تخدم معايا:\n' +
    '• قول ليا (بالهضرة ولا بالكتابة) شنو محتاج، ونسولك على المعلومات اللي ناقصين.\n' +
    '• تقدر تصيفط تصويرة ديال لاكارط ولا ديال شي ورقة.\n\n' +
    'الأوامر:\n' +
    '/documents — الوثائق اللي نقدر نوجد\n' +
    '/status — فين وصلنا فالوثيقة\n' +
    '/edit — نبدلو شي معلومة\n' +
    '/skip — نفوتو سؤال اختياري\n' +
    '/new — نبداو وثيقة جديدة\n' +
    '/voice — الردود الصوتية (تشغيل / إيقاف)\n' +
    '/mydata — المعلومات المحفوظة عليك\n' +
    '/privacy — الخصوصية\n' +
    '/forget — مسح المعلومات ديالك\n' +
    '/help — المساعدة',
  unknownCommand: 'ما فهمتش هاد الأمر. كتب /help باش تشوف الأوامر.',
  documentsList: 'هادي هي الوثائق اللي نقدر نوجد ليك. اختار وحدة:',
  documentsBusy: (name: string) => `راك دابا كتوجد: ${name}. إلا بغيتي وثيقة أخرى، كتب /new ومن بعد اختار.`,
  statusNone: 'ما كاين حتى وثيقة كنوجدوها دابا. قول ليا شنو محتاج ولا كتب /documents.',
  statusChoosing: 'باقي ما اخترناش الوثيقة. قول ليا شنو محتاج ولا كتب /documents.',
  status: (name: string, filled: number, total: number, missing: string[], confirming: boolean) =>
    `📄 ${name}\nعندي ${filled} من ${total} ديال المعلومات.\n${statusNext(missing, confirming)}`,
  nothingToSkip: 'ما كاين حتى سؤال اختياري نقدرو نفوتوه دابا.',
  nothingToEdit: 'ما عندي حتى معلومة دابا باش نبدلها. قول ليا شنو الوثيقة اللي محتاج.',
  editIntro: 'هادي هي المعلومات اللي عندي حتى دابا:',
  editSkipped: (labels: string[]) => `معلومات اختيارية ما عطيتينيش (تقدر تزيدها دابا):\n${bullets(labels)}`,
  skippedCanAdd: (labels: string[]) =>
    `مافيها باس، فوتنا ${quoted(labels)} حيت اختيارية. إلا بغيتي تزيدها من بعد، كتب /edit.`,
  mydataEmpty: 'ما محفوظ عندي حتى معلومة عليك.',
  mydataProfile: 'المعلومات الشخصية (كنعاودو نستعملوها فالوثائق الجاية):',
  mydataCurrent: (name: string) => `الوثيقة اللي كتوجد دابا (${name}):`,
  mydataForget: 'باش تمسحهم كاملين، كتب /forget.',
  error: 'وقع مشكل تقني 😔 عاود من بعد شوية عافاك.',
  busy: 'الخدمة عامرة بزاف دابا ⏳ عاود صيفط نفس الرسالة من بعد دقيقة عافاك، المعلومات اللي عطيتيني محفوظين.',
  requiredCannotSkip: (label: string) => `«${label}» ضروري فهاد الوثيقة، ما يمكنش نخليوه خاوي.`,
};

// Whole-message answers, compared as words (no regex, so no backtracking).
const YES_WORDS = new Set([
  'نعم', 'ايه', 'إيه', 'اه', 'آه', 'أه', 'واخا', 'صحيح', 'موافق', 'مزيان', 'يه',
  'ok', 'okay', 'oui', 'yes', "d'accord", 'wakha', 'iyeh', '1',
]);
const CANCEL_WORDS = new Set(['/new', '/cancel', 'إلغاء', 'الغي', 'ألغي', 'بدا من جديد', 'annuler', 'cancel']);
const TRAILING_PUNCTUATION = new Set(['.', '!', '?', '؟']);

function asAnswer(text: string): string {
  let s = text.trim().toLowerCase();
  while (TRAILING_PUNCTUATION.has(s.at(-1) ?? '')) s = s.slice(0, -1);
  return s.trim();
}

export const isYes = (text: string) => YES_WORDS.has(asAnswer(text));
export const isCancel = (text: string) => CANCEL_WORDS.has(text.trim().toLowerCase());

// --- Commands -------------------------------------------------------------------

/** Shown in Telegram's command menu (set_commands.ts): name without the slash, short description. */
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: 'new', description: 'نبداو وثيقة جديدة' },
  { command: 'documents', description: 'الوثائق اللي نقدر نوجد' },
  { command: 'status', description: 'فين وصلنا فالوثيقة' },
  { command: 'edit', description: 'نبدلو شي معلومة' },
  { command: 'skip', description: 'نفوتو سؤال اختياري' },
  { command: 'voice', description: 'الردود الصوتية (تشغيل / إيقاف)' },
  { command: 'mydata', description: 'المعلومات المحفوظة عليا' },
  { command: 'privacy', description: 'الخصوصية' },
  { command: 'forget', description: 'مسح المعلومات ديالي' },
  { command: 'help', description: 'المساعدة' },
];

const COMMAND_RE = /^\/([a-z]+)(?:@\w+)?$/;

/** "/Help@KatibOumoumiBot" -> "help"; null when the message is not a single command. */
export function parseCommand(text: string): string | null {
  const m = COMMAND_RE.exec(text.trim().toLowerCase());
  return m ? m[1] : null;
}

/** Names of the saved profile attributes (agent_user_profiles.data), for /mydata. */
export const PROFILE_LABELS: Record<string, string> = {
  full_name: 'السمية الكاملة',
  cin: 'رقم البطاقة الوطنية',
  birth_date: 'تاريخ الازدياد',
  address: 'العنوان',
  phone: 'رقم التيليفون',
  email: 'الإيميل',
  city: 'المدينة',
};
