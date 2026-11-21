/** Original, human-edited notes for a private couples space.
 * These are not quotations attributed to public figures or scraped comments.
 * Kept in two groups for compatibility with older imports/tests.
 */
const ORIGINAL_QUOTES: readonly string[] = [
  "I like knowing that somewhere in your day, you thought of me.",
  "I wish we were having breakfast together right now.",
  "You make ordinary days worth looking forward to.",
  "Come eat with me. I saved you a place.",
  "My favourite plan is whatever brings me closer to you.",
  "I love that I get to know you a little better every day.",
  "I miss the small things we haven't even done together yet.",
  "You don't have to have a perfect day to tell me about it.",
  "I hope something today makes you smile the way you make me smile.",
  "I'd choose a quiet evening with you over a hundred big nights out.",
  "Every time my phone lights up, a little part of me hopes it's you.",
  "I want to hear about the boring bits of your day, too.",
  "If we could share one thing right now, I'd pick a meal and a long conversation.",
  "I'm still going to steal a bite of your food.",
  "Take your time today. I'll be here when you're done.",
  "You can tell me when you're tired. I don't need you to pretend.",
  "I wish I could bring you something warm to eat.",
  "Some days I just want to sit beside you and do nothing at all.",
  "There's no special occasion. I just really love you.",
  "I hope you know how often you cross my mind.",
  "I'd rather hear your voice than get the perfect goodnight text.",
  "I like the way our days have started to include each other.",
  "One day, we'll choose dinner without checking the time difference.",
  "Save me a story from your day. I want to hear it later.",
  "You make me want to slow down and enjoy the little things.",
  "I love you on the ordinary days, not just the exciting ones.",
  "I would gladly listen to you talk about your day for hours.",
  "Take care of yourself today. You're very important to someone.",
  "I like that we can be silly together.",
  "I can't wait for all the meals we haven't shared yet.",
  "You are the part of tomorrow I look forward to.",
  "I hope you ate something good today, love.",
  "I don't need a grand date. I just want time with you.",
  "Even when we're busy, I like knowing we're on the same team.",
  "I want to know your favourite comfort food by heart.",
  "I'm rooting for you quietly, all day long.",
  "I wish I could give you a hug instead of sending this.",
  "Thank you for letting me be part of your everyday life.",
  "I'd love to make you breakfast and then go back to bed.",
  "Somewhere between the little chats, you became my favourite person.",
  "I love how easily you can make me laugh.",
  "We can have a slow day. There's nothing wrong with that.",
  "I hope we never stop finding tiny reasons to celebrate each other.",
  "Being together doesn't have to mean doing something.",
  "Tell me what you ate. Then tell me everything else.",
  "I'd travel a long way just to share an ordinary afternoon with you.",
  "I love the idea of coming home and finding you there.",
  "Let's take good care of each other, without keeping score.",
  "I want a thousand simple days with you.",
  "There's so much I still want to do with you."
];

/** Original affectionate notes, not verbatim Reddit quotations. */
export const REDDIT_INSPIRED_QUOTES: readonly string[] = [
  "I kept the last bite for you. That's how much I like you.",
  "Have you eaten, love? I'm checking because I care.",
  "I hope your day was kind to you. If not, tell me about it.",
  "One day, goodnight won't have to mean goodbye for now.",
  "You make the distance feel worth it.",
  "I like our little routine of checking on each other.",
  "I'd happily make you tea and listen to you complain.",
  "I can't fix every bad day, but I can stay and listen.",
  "Don't forget lunch. I know you get busy.",
  "I want to know all your strange little food preferences.",
  "I'd take a walk with you without needing a destination.",
  "I wish I could hand you a snack through the screen.",
  "You're allowed to be quiet with me, too.",
  "I like that we can laugh about absolutely nothing.",
  "If today was hard, I wish I could hold your hand.",
  "Some days, I miss you before we've even said goodbye.",
  "One of my favourite things is hearing what made you laugh today.",
  "I'd remember your order, even if you changed it every week.",
  "I hope you have a meal today that feels like a treat.",
  "I don't want the highlights only. Tell me the messy parts, too.",
  "I'd do the grocery run with you just to spend more time together.",
  "There's a version of this day where we're eating side by side. I like imagining it.",
  "I love that I can be ridiculous around you.",
  "Please eat before you tell me you're fine.",
  "I want to share a kitchen with you, even on the messy days.",
  "I'd bring you soup if I knew you weren't feeling well.",
  "I miss hearing you laugh without a phone between us.",
  "Let's try a new place together someday.",
  "I hope you can rest tonight. I'll be thinking of you.",
  "I don't mind waiting for your reply. Just get home safe.",
  "I'd make the long journey just for a short hug.",
  "Tell me the best thing you ate today.",
  "There's something lovely about being part of each other's routines.",
  "I like making plans with you, even tiny ones.",
  "You're my favourite person to do absolutely nothing with.",
  "I wish I knew exactly when I'd see you next.",
  "I'll never get tired of your little updates.",
  "I want more photos of our ordinary days together.",
  "I'd choose your company over the fanciest restaurant.",
  "I know you can take care of yourself. I still want to help.",
  "I hope something reminds you today how loved you are.",
  "Let's have a meal together when we can, no rush.",
  "You don't have to be cheerful for me to want to talk to you.",
  "I'd like to know how you take your coffee, and make it for you.",
  "I'd share my fries with you. Most of them, anyway.",
  "I like the comfort of knowing you're there.",
  "Sometimes I just wish you were sitting across the table.",
  "Tell me when you get home. I'll feel better knowing you're safe.",
  "You deserve a proper meal, not just whatever you grabbed between tasks.",
  "Whatever today looks like, I'm happy we're doing life together."
];

export const ALL_QUOTES: readonly string[] = [...ORIGINAL_QUOTES, ...REDDIT_INSPIRED_QUOTES];

/** Restored original couple voice: affectionate and quietly encouraging.
 * Home rotates through 49 of the original 50 notes plus 11 supporting
 * lines from the existing library. The one line the member specifically
 * disliked is deliberately excluded, not deleted from the legacy catalog.
 * These are editorial lines, not partner-authored messages.
 */
const SUPPORTIVE_DAILY_QUOTES: readonly string[] = [
  "I hope your day was kind to you. If not, tell me about it.",
  "One day, goodnight won't have to mean goodbye for now.",
  "You make the distance feel worth it.",
  "I can't fix every bad day, but I can stay and listen.",
  "Don't forget lunch. I know you get busy.",
  "You're allowed to be quiet with me, too.",
  "If today was hard, I wish I could hold your hand.",
  "I hope you have a meal today that feels like a treat.",
  "I know you can take care of yourself. I still want to help.",
  "I hope something reminds you today how loved you are.",
  "Whatever today looks like, I'm happy we're doing life together.",
];

export const TODAY_QUOTES: readonly string[] = [
  ...ORIGINAL_QUOTES.filter(q => q !== "There's no special occasion. I just really love you."),
  ...SUPPORTIVE_DAILY_QUOTES,
];

function hashDay(day:string):number {
  let hash=2166136261;
  for(const ch of day){
    hash^=ch.charCodeAt(0);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}

/** Stable local calendar date. A 60-day cycle avoids accidental repeats
 * between nearby days, unlike the old hash/modulo selection. */
export function quoteForDay(day: string): string {
  const ordinal = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? Math.floor(Date.parse(day + "T00:00:00Z") / 86_400_000)
    : NaN;
  const seed = Number.isFinite(ordinal) ? ordinal : hashDay(day);
  const index = ((seed % TODAY_QUOTES.length) + TODAY_QUOTES.length) % TODAY_QUOTES.length;
  return TODAY_QUOTES[index] ?? TODAY_QUOTES[0] ?? "";
}

/** Legacy fallback for call sites without a local date. */
export function dailyQuote(): string {
  const d=new Date();
  const local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  return quoteForDay(local);
}
