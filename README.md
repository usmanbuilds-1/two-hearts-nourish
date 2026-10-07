# Our Health Space

Build a production-quality mobile-first web app for exactly two people: a couple who want to track calories, macros, meals, and healthy habits together.

The app should feel like a private digital space belonging to the couple — warm, romantic, motivating, personalized and playful, but NOT childish, cheesy, overly pink, or gimmicky.

The underlying nutrition tracking should remain accurate, practical and data-focused.

The app will be used primarily from two separate phones: one phone belongs to Partner 1 and the other belongs to Partner 2.

There must be NO traditional login, email account, password, Google login, or social authentication.

Use a shared private room to connect the two phones.

⸻

1. TECHNOLOGY

Use:

* React
* TypeScript
* Tailwind CSS
* Supabase PostgreSQL
* Supabase Realtime
* Supabase Edge Functions
* Gemini API for food-photo analysis
* Browser localStorage for the local participant session

The application must be deployable as a normal web app and work well on iPhone Safari and desktop browsers.

The free tiers should be sufficient for two people.

Do not introduce paid services unless absolutely necessary.

⸻

2. CORE CONCEPT

There is one private “couple room”.

Example:

Partner 1:
Usman

Partner 2:
[Her Name]

The room internally represents:

Usman + [Her Name]

Both people use completely separate phones and browsers.

Both phones connect to the same Supabase room.

When one person logs a meal, the other person’s phone should see it automatically through Supabase Realtime.

Example:

Usman adds:

Chicken biryani
680 kcal
32g protein

Her phone should update automatically without refreshing.

If she adds:

Egg sandwich
420 kcal
22g protein

Usman’s phone should update automatically.

⸻

3. ONBOARDING

First person

Show a beautiful onboarding screen.

Headline:

“Let’s make this ours ❤️”

Subtitle:

“A little space for the two of you to eat better, stay motivated, and keep each other going.”

Ask:

“What should we call you?”

[ Name ]

Then:

“Create your shared space”

Button:

“Create our space ❤️”

Generate a secure random room code.

Example:

7KQ4-M2PX

Create a shareable URL:

/r/7KQ4-M2PX

Show:

“Your space is ready ❤️”

“Invite your partner”

[ Copy invite link ]

Also show the room code as a fallback.

The first participant becomes Partner 1.

Generate a private participant token and store it locally.

Do NOT put the participant token in the URL.

⸻

4. SECOND PERSON JOINING

The second person should preferably join by opening the shared URL.

Example:

/r/7KQ4-M2PX

Show:

“Usman invited you into your shared space ❤️”

Ask:

“What’s your name?”

[ Her Name ]

Button:

“Join us ❤️”

Create the second member.

Generate a private participant token and store it locally.

Now the room contains exactly two people.

Do not make the second person manually type the room code when they already opened the invitation link.

Still provide a manual “Enter room code” option for backup.

⸻

5. ROOM LIMIT

Each room supports exactly two members.

If a third person attempts to join:

“This space already belongs to two people ❤️”

Do not allow them to join.

⸻

6. SESSION PERSISTENCE

Each phone must remember its participant identity.

Use a secure random participant token stored locally.

When the user reopens the app:

Do not ask for their name again.

Automatically restore:

* room
* participant
* display name
* preferences

Example:

“Good morning, Usman ❤️”

The other phone should automatically restore the other participant.

If local browser data is cleared or the user changes phones, allow them to rejoin using the invitation link.

⸻

7. DATABASE

Use Supabase PostgreSQL.

Create:

rooms

id UUID primary key
room_code TEXT unique not null
created_at TIMESTAMPTZ default now()

members

id UUID primary key
room_id UUID references rooms(id) on delete cascade
display_name TEXT not null
participant_token_hash TEXT not null
daily_calorie_target INTEGER nullable
daily_protein_target NUMERIC nullable
daily_carbs_target NUMERIC nullable
daily_fat_target NUMERIC nullable
created_at TIMESTAMPTZ default now()

Maximum 2 members per room.

meals

id UUID primary key
room_id UUID references rooms(id) on delete cascade
member_id UUID references members(id) on delete cascade
food_name TEXT not null
calories INTEGER not null
protein NUMERIC not null
carbs NUMERIC not null
fat NUMERIC not null
serving_description TEXT nullable
ai_confidence TEXT nullable
meal_date DATE not null
created_at TIMESTAMPTZ default now()
updated_at TIMESTAMPTZ default now()

Add indexes for:

room_id
member_id
meal_date
created_at

⸻

8. SECURITY

This is a private app.

Implement proper Supabase Row Level Security.

Do NOT simply make the database publicly readable/writable.

A participant can only access data belonging to their own room.

A participant can only create meals for themselves.

A participant can edit/delete their own meals.

Both participants can READ meals belonging to their shared room.

Do not trust room_code alone as authorization.

Do not store raw participant tokens in the database.

Store a secure hash of the participant token.

The Gemini API key must NEVER be exposed to the frontend.

⸻

9. MAIN DASHBOARD

The dashboard should feel personal.

Do NOT make it look like MyFitnessPal.

Top:

“Good morning, Usman ❤️”

Below:

“You & [Her Name]”

Then a small motivating message that changes based on activity.

Examples:

“Another day of taking care of yourselves.”

“You’re both off to a good start.”

“Protein is looking strong today 💪”

“Nobody has fed the app today 😂”

“Yesterday was a good one. Let’s keep it going.”

Never shame the user.

Never say:

“You failed.”

“You missed your target.”

“You broke your streak.”

⸻

10. TODAY’S SHARED VIEW

Show both people’s nutrition.

Example:

YOU

1,842 kcal
96g protein

HER

1,540 kcal
82g protein

Make it visually clear who is who.

If targets exist, show progress toward targets.

Example:

1,842 / 2,400 kcal

96 / 120g protein

Do not show percentages if no target has been configured.

⸻

11. MEAL TIMELINE

Below the totals:

“Today’s little food story”

Group meals naturally:

BREAKFAST ☀️

3 eggs + roti
420 kcal
32g protein

LUNCH 🍗

Chicken biryani
680 kcal
32g protein

SNACK 🍌

Banana + yogurt
210 kcal
10g protein

DINNER 🌙

Not logged yet

Clearly show which person logged each meal.

Tapping a meal opens its details.

Users can edit or delete their own meals.

⸻

12. MANUAL FOOD ENTRY

Provide:

“+ Add Meal”

Allow manual entry without AI.

Fields:

Food name
Serving description
Calories
Protein
Carbohydrates
Fat

Button:

“Add meal ❤️”

⸻

13. AI FOOD PHOTO SCANNING

This is a major feature.

Add a prominent camera button:

“Scan Food 📷”

On iPhone Safari, use the native camera/file picker where supported.

Allow:

* Take photo
* Choose existing photo

Show the photo preview.

Allow retaking the photo.

Do NOT permanently store food images.

Compress/rescale the image before sending it for analysis.

⸻

14. GEMINI ARCHITECTURE

The browser must NOT call Gemini directly using the secret API key.

Use:

Browser
→ Supabase Edge Function
→ Gemini API
→ Edge Function
→ Browser

Store GEMINI_API_KEY as a Supabase Edge Function secret/environment variable.

Never expose it in:

* frontend source
* JavaScript bundle
* localStorage
* URL
* database
* client-side environment variables
* network responses

⸻

15. GEMINI FOOD ANALYSIS

Send the food photo to Gemini.

Use a currently available vision-capable Gemini model.

Ask Gemini to:

1. Identify visible food items.
2. Estimate portions.
3. Consider cooking method.
4. Consider visible ingredients.
5. Estimate calories.
6. Estimate protein.
7. Estimate carbohydrates.
8. Estimate fat.
9. Avoid false precision.
10. Provide an uncertainty/confidence level.
11. Return structured JSON only.

Required JSON structure:

{
“food_name”: “string”,
“serving_description”: “string”,
“calories”: number,
“protein”: number,
“carbs”: number,
“fat”: number,
“confidence”: “low | medium | high”
}

If multiple foods are visible, provide a combined meal estimate.

The AI should explicitly understand that food photographs cannot provide exact nutritional measurements.

These are estimates.

⸻

16. AI CONFIRMATION SCREEN

NEVER automatically save AI results.

After Gemini responds, show:

“What’s on the plate? 👀”

Food:

[ Chicken biryani ]

Serving:

[ approximately 350g ]

Calories:

[ 680 ]

Protein:

[ 32 ] g

Carbs:

[ 78 ] g

Fat:

[ 26 ] g

Confidence:

Medium

Every field must be editable.

Buttons:

“Looks right ❤️”

“Edit”

“Retake photo”

Only save the meal after the user confirms.

⸻

17. AI ERROR HANDLING

If Gemini fails:

“Couldn’t figure that one out. Try another photo?”

Buttons:

“Try again”

“Add manually”

If Gemini returns malformed JSON:

Handle it safely.

Never crash the app.

Validate the AI response server-side before returning it to the browser.

⸻

18. REALTIME

Use Supabase Realtime.

Subscribe to meal changes for the current room.

When either partner:

* adds a meal
* edits a meal
* deletes a meal

the other phone should update automatically.

No manual refresh.

Do not use aggressive polling.

⸻

19. 7-DAY HISTORY

Create a “Our Week ❤️” screen.

Show both people for the last 7 days.

Example:

MON
You ✓
Her ✓

TUE
You ✓
Her ✓

WED
You ✓
Her —

etc.

Show:

Average calories
Average protein
Meals logged
Days both logged meals

Use a clean chart.

Do not make it overly analytical.

⸻

20. SHARED MOTIVATION

Create a section:

“Us today ❤️”

Generate small contextual messages from real data.

Examples:

“You both logged breakfast ☀️”

“She’s 18g away from her protein goal.”

“You’re both on track today.”

“Three days logging together 🔥”

“Yesterday you both hit your protein goals.”

“Nobody has fed the app today 😂”

“One more meal in the books.”

Messages should be encouraging, not judgmental.

Never compare partners negatively.

Never say:

“You ate more than her.”

“She’s doing better than you.”

“You are behind her.”

This is a couple app, not a competition.

⸻

21. TOGETHER SCREEN

Create a dedicated:

“Together ❤️”

screen.

Show:

Usman + [Her Name]

Then shared milestones:

Meals logged together
Days active
Days both logged
Days both hit protein goals

Example:

“14 days together”

“87 meals logged”

“10 days hitting our protein goals”

Add a subtle timeline of shared activity.

Example:

Today:
Both logged breakfast ☀️

Yesterday:
Both hit protein goals 💪

3 days ago:
10th shared dinner logged 🍽️

Keep this subtle and tasteful.

⸻

22. MILESTONES

Add lightweight achievements.

Examples:

❤️ First meal together
🔥 7 days logging together
💪 Both hit protein goals
🍽️ 50 meals logged
🌱 30 days taking care of yourselves

Do NOT use childish gamification.

No XP.

No levels.

No leaderboards.

No “calorie warrior” nonsense.

⸻

23. COUPLE PERSONALIZATION

During setup allow the couple to optionally configure:

Partner names
Shared goal
Custom shared message
Optional relationship/together date

Example:

“Our goal”

“Eat better together”

Custom message:

“Getting healthier together, one meal at a time ❤️”

Display the custom message subtly throughout the app.

Allow changing it later.

⸻

24. VISUAL DESIGN

The app should feel:

Romantic
Warm
Premium
Personal
Modern
Calm
Motivating

Think:

Apple Health
WHOOP
Linear
combined with the warmth of a private couples journal.

Avoid:

* generic AI-generated SaaS appearance
* purple gradients
* excessive glassmorphism
* crypto-looking UI
* neon
* excessive hearts
* childish illustrations
* huge cartoon graphics
* excessive rounded cards
* cheesy Valentine’s Day aesthetics

Romance should come from the copy, personalization, typography, subtle animation and small details.

Not from making everything pink.

⸻

25. COLOR DIRECTION

Use a warm neutral foundation.

Dark mode should feel like:

warm charcoal / dark brown

with subtle warm coral/rose accents.

Example direction:

Background:
#121110

Surface:
#1B1917

Text:
#F4EEE8

Accent:
warm muted coral / rose

Do not hard-code these exact colors if a better accessible palette is appropriate.

Support light and dark themes if practical.

⸻

26. TYPOGRAPHY

Use beautiful, highly readable typography.

Strong hierarchy.

Large friendly headings.

Compact numerical typography for calories/macros.

Avoid overly futuristic fonts.

The app should feel premium rather than “AI generated.”

⸻

27. ANIMATION

Use subtle animations.

Examples:

Meal added:
small satisfying confirmation animation.

Realtime meal arriving:
subtle slide/fade.

Milestone:
small celebration.

Do NOT make everything bounce or glow.

Animations must not interfere with usability.

⸻

28. MOBILE NAVIGATION

Bottom navigation:

Today
Together
Week
Settings

The Scan Food button should be highly accessible from Today.

On desktop, adapt to a sidebar or top navigation.

⸻

29. SETTINGS

Include:

My name
Partner name
Daily calorie target
Daily protein target
Daily carbohydrate target
Daily fat target
Shared goal
Custom couple message
Copy invite link
Leave room
Reset local session
Theme

⸻

30. DATA BEHAVIOR

Dates must use the user’s local date appropriately.

Meals logged around midnight must not accidentally appear on the wrong day due to UTC conversion.

Store timestamps correctly.

Use meal_date for daily aggregation.

⸻

31. PRIVACY

Do not permanently store food photos.

Do not collect unnecessary personal information.

Do not add analytics unless explicitly required.

Do not add advertising.

Do not sell or share data.

This is intended to be a private two-person app.

⸻

32. PERFORMANCE

Keep the app lightweight.

Do not install unnecessary packages.

Lazy-load heavy functionality where appropriate.

Compress images before AI analysis.

Avoid unnecessary database queries.

Use Realtime instead of polling.

Cache appropriate local session information.

⸻

33. EMPTY STATES

If neither person has logged anything:

“Your food story starts here ❤️”

“Take a photo of your first meal together.”

If only one person has logged:

“[Name] has started today 👀”

If the partner hasn’t logged:

“[Name] hasn’t logged anything yet.”

Never use guilt-based messaging.

⸻

34. ERROR STATES

Handle:

* room not found
* room full
* invalid room code
* invalid session
* expired session
* Supabase unavailable
* Gemini unavailable
* malformed AI response
* image upload failure
* meal save failure
* meal update failure
* meal delete failure
* offline mode

Show human-readable messages.

Never silently fail.

⸻

35. OFFLINE BEHAVIOR

If practical, provide basic offline awareness.

If the user loses connection:

“You’re offline. We’ll reconnect when you’re back.”

Do not pretend a meal was successfully saved if Supabase has not confirmed it.

⸻

36. ACCEPTANCE TESTS

Before considering the application finished, verify:

ROOM

1. Partner 1 can create a room.
2. A secure random room code is generated.
3. An invitation URL is generated.
4. Partner 1 can copy the invitation link.
5. Partner 2 can open the link from another phone.
6. Partner 2 can enter their name and join.
7. The room supports exactly two members.
8. A third person cannot join.

SESSIONS

9. Each phone remembers its participant.
10. Refreshing the browser preserves the session.
11. Closing and reopening the browser preserves the session.
12. Participant token is not exposed in the URL.
13. Clearing browser data allows the user to rejoin.

MEALS

14. Partner 1 can manually add a meal.
15. Partner 2 can manually add a meal.
16. Each partner can edit their own meals.
17. Each partner can delete their own meals.
18. Partner 1 cannot edit Partner 2’s meal.
19. Partner 1 cannot delete Partner 2’s meal.
20. Both partners can read meals from their shared room.

REALTIME

21. Partner 1 adds a meal.
22. Partner 2 sees it without refreshing.
23. Partner 2 edits a meal.
24. Partner 1 sees the update without refreshing.
25. Delete events update both phones.

AI

26. Camera opens correctly on iPhone Safari.
27. Existing photos can also be selected.
28. Photo preview works.
29. Photo can be retaken.
30. Image is compressed before analysis.
31. Image reaches the secure Edge Function.
32. Gemini analyzes the image.
33. Gemini response is validated.
34. AI result appears in editable confirmation UI.
35. AI result is NOT saved automatically.
36. User can modify calories/macros.
37. User can confirm and save.
38. User can abandon the AI result.
39. Gemini failure produces a useful retry flow.
40. Gemini API key is never exposed to the browser.

DASHBOARD

41. Today’s calories are correct.
42. Today’s macros are correct.
43. Partner totals are correct.
44. Daily targets work.
45. 7-day history works.
46. Weekly averages are correct.
47. Together/milestone data is correct.

SECURITY

48. Cross-room data access is prevented.
49. RLS policies are actually enforced.
50. Raw participant tokens are not stored.
51. Gemini API key is server-side only.

UI

52. App works on iPhone Safari.
53. App works on desktop.
54. No horizontal scrolling on mobile.
55. Touch targets are large enough.
56. Typography is readable.
57. Dark mode looks intentional.
58. Light mode looks intentional if implemented.
59. No placeholder content remains.
60. No broken buttons remain.
61. No console errors remain.
62. No TypeScript errors remain.
63. Production build succeeds.

⸻

37. DEVELOPMENT ORDER

Build and verify in this exact order:

1. Supabase schema
2. RLS/security
3. Room creation
4. Invitation URL
5. Second-person joining
6. Local participant sessions
7. Manual meal creation
8. Meal editing/deletion
9. Dashboard calculations
10. 7-day history
11. Supabase Realtime
12. Couple personalization
13. Together/milestones
14. Gemini Edge Function
15. Camera/photo workflow
16. AI response validation
17. Editable AI confirmation
18. Error handling
19. Mobile optimization
20. Full security audit
21. Full end-to-end testing
22. Production build/deployment

Do not skip ahead to visual polish while core data/security functionality is broken.

⸻

38. IMPORTANT DEVELOPMENT RULE

Do not use fake data in the finished application.

Do not create fake AI responses.

Do not expose secrets.

Do not leave major functionality as TODOs.

Do not declare the application finished just because the UI renders.

Actually test the complete flow:

Partner 1 creates room
→ Partner 2 joins from another phone
→ Partner 1 scans food
→ Gemini analyzes it
→ Partner 1 edits the estimate
→ Partner 1 confirms
→ Supabase saves it
→ Partner 2 sees it in realtime
→ both dashboards update
→ weekly statistics update correctly.

After implementation, inspect the entire codebase for:

* security problems
* broken RLS
* TypeScript errors
* build errors
* mobile layout problems
* incorrect date handling
* realtime subscription leaks
* exposed secrets
* unnecessary API calls
* broken empty/error states

Fix all discovered issues before considering the project complete.

The final result should feel like a polished private app made specifically for two people who care about each other and are trying to become healthier together.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://two-hearts-nourish.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a9971a48-4dbd-44b3-9ff6-1fb4772f3872).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
