const ORIGINAL_QUOTES: string[] = [
  "Every meal together is a small act of love. 💕",
  "You can't pour from an empty cup — eat well.",
  "Healthy together, happy together. 🌱",
  "Progress, not perfection, one meal at a time.",
  "The couple that eats well together, stays well together.",
  "Fuelling up so we can keep being amazing. ✨",
  "Bodies need nourishment. Relationships need attention. You've got both.",
  "Today's good habits are tomorrow's easy choices.",
  "Eating right is the quietest form of self-respect.",
  "Small steps every day — that's how mountains get climbed.",
  "We didn't come this far to only come this far. 💪",
  "A healthy you makes a happier us.",
  "Logging meals is boring. Being healthy together is not.",
  "One more meal tracked. One more win. 🏆",
  "The best project you'll ever work on is you.",
  "Protein hits different when you're doing it together. 😄",
  "You woke up today. That's already step one.",
  "Consistency > perfection. Always.",
  "We're not on a diet. We're choosing a life. 🌿",
  "Loving you means wanting you around for a long time. 🩷",
  "Celebrate every logged meal — each one counts.",
  "Eat like you love yourself. Because you should.",
  "Strong bodies, strong bond. 💑",
  "Every green day on the streak is a love letter to future-you.",
  "You're not starting over. You're starting smarter.",
  "The goal is progress, not a number on a scale.",
  "Home-cooked or takeaway — what matters is you're eating.",
  "Fuel your body. It's carrying you somewhere great.",
  "One habit at a time. One day at a time. One meal at a time.",
  "This app isn't magic — but you showing up every day is. ✨",
  "Couples who log together, glow together. 😂",
  "Be kind to your body. It's the only one you've got.",
  "Real love is asking 'did you eat?' and actually meaning it.",
  "Nourish the body. Nourish the relationship. Nourish the soul.",
  "You're doing better than you think. 🙏",
  "Health isn't a destination. It's a direction.",
  "Protein before dessert — adulting unlocked. 🔓",
  "We log the meals so we can enjoy the life.",
  "A little effort every day beats a huge effort once a month.",
  "Your future self is rooting for you right now.",
  "Two people. One goal. Let's go. 🚀",
  "The best time to start was yesterday. Second best? Right now.",
  "Eating together is an act of intimacy. Treasure it.",
  "Not all heroes wear capes. Some just hit their protein goals. 🦸",
  "Body goals, relationship goals — why not both?",
  "The streak is just proof that love is consistent. 🔥",
  "Tired? Eat something. Cranky? Drink water. Struggling? You're human.",
  "Healthy doesn't mean perfect. It means intentional.",
  "Two hearts, one wellness journey. ❤️",
  "Every bite you log is data. Every day you improve is growth.",
  "We chose each other. Let's choose our health too.",
  "Looking after yourself is looking after us.",
  "You're not just eating for you — you're eating for all the adventures ahead.",
  "It's not about being the best. It's about being better than yesterday.",
];

/**
 * 50 original, profanity-free lines inspired by recurring themes in Reddit
 * relationship discussions: small acts of service, remembering details,
 * food as care, long-distance rituals, gentle check-ins, and everyday support.
 * These are paraphrases/original writing, not copied Reddit comments.
 */
export const REDDIT_INSPIRED_QUOTES: readonly string[] = [
  "Love is remembering how they take their tea without asking.",
  "Being cared for can look like a glass of water before you knew you were thirsty.",
  "Small kindnesses are how ordinary days become ours.",
  "Sometimes love is simply asking, “Have you eaten yet?”",
  "The little things are not little when they make someone feel seen.",
  "A snack saved for you is a tiny way of saying, “I thought of you.”",
  "Consistency is romantic: showing up, checking in, remembering.",
  "One warm meal can say what a paragraph cannot.",
  "Love notices the details nobody else thinks to remember.",
  "Home is the person who makes sure you are fed and heard.",
  "You do not need a grand gesture when someone remembers the small stuff.",
  "Care is making room for each other’s weird little routines.",
  "A quiet check-in can mean more than a dramatic speech.",
  "The best love often looks ordinary from the outside.",
  "Making life easier for each other is its own kind of romance.",
  "Bring the water. Save the last bite. Ask how the day went.",
  "Love is learning what comforts them and remembering it next time.",
  "Thoughtfulness is remembering the thing they mentioned once.",
  "Being on the same team matters more than doing everything the same way.",
  "A cup of tea made without asking can feel like a hug.",
  "The sweetest habits are the ones that say, “I know you.”",
  "Caring for each other is built in tiny repeated moments.",
  "You can be far apart and still be part of each other’s everyday life.",
  "Ask if they ate. Ask if they slept. Mean it.",
  "A shared routine can turn distance into something softer.",
  "Love is not reading minds; it is paying attention.",
  "Save them the snack they like. That is romance with receipts.",
  "Good relationships are full of small, boring acts of devotion.",
  "Remembering their order is a love language with calories.",
  "The goal is not perfect days; it is feeling like a team on messy ones.",
  "Some days, caring means reminding each other to eat.",
  "Make space for rest, food, laughter, and each other.",
  "The strongest “I love you” can be “I brought you something to eat.”",
  "Tiny rituals are how two separate lives start feeling connected.",
  "Notice what makes their day easier and do a little of that.",
  "Love is letting someone be tired without making them explain everything.",
  "A thoughtful message at the right time can feel like coming home.",
  "Keep choosing each other in the unremarkable parts of the day.",
  "Care looks like remembering, checking in, and following through.",
  "Being loved well feels like being considered even when you are not in the room.",
  "Distance changes the logistics, not the tenderness.",
  "Send the photo. Save the memory. Tell them you thought of them.",
  "A relationship grows when both people feel safe to be ordinary.",
  "The best kind of care does not keep score.",
  "Love is a thousand tiny “I remembered” moments.",
  "Sometimes date night is just eating and talking without rushing.",
  "Support can be simple: listen, encourage, and make sure they ate.",
  "There is something deeply romantic about being included in someone’s routine.",
  "A good partner makes the ordinary feel shared.",
  "Take care of yourself too; the person who loves you wants you well.",
];

export const ALL_QUOTES: readonly string[] = [...ORIGINAL_QUOTES, ...REDDIT_INSPIRED_QUOTES];

function hashDay(day:string):number {
  let hash=2166136261;
  for(const ch of day){
    hash^=ch.charCodeAt(0);
    hash=Math.imul(hash,16777619);
  }
  return hash>>>0;
}

/** Stable for a supplied local YYYY-MM-DD, avoiding UTC midnight changes. */
export function quoteForDay(day:string): string {
  const idx=hashDay(day)%ALL_QUOTES.length;
  return ALL_QUOTES[idx] ?? ALL_QUOTES[0] ?? "";
}

/** Legacy fallback for call sites without a local date. */
export function dailyQuote(): string {
  const d=new Date();
  const local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  return quoteForDay(local);
}
