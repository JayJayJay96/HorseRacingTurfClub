/** Commentary lines (owner 2026-11-04: fun, plain English). Index 0 of each pool is what tests pick. */
export const LINES = {
  intro: [
    'Welcome to the Turf Club! {n} horses at the gate.',
    'Ladies and gentlemen, {n} runners are ready to go!',
    '{n} horses, one big prize. Here we go!',
  ],
  prize: ["Today's prize: {p}!", 'They are racing for {p}!'],
  rainStart: ['Wet track today! Watch those puddles!', 'Rain on the course! Hold on tight!'],
  fogStart: ['Fog rolling in! Mind your neighbours!', "It's a foggy one out there!"],
  hurdle: ['{h} clips a hurdle!', 'Ooh, {h} catches the top of that fence!'],
  slip: ['Splash! {h} slips in a puddle!', 'Whoa! {h} skids on the wet track!'],
  bump: ['Bonk! {a} and {b} bump in the fog!', '{a} and {b} knock shoulders!'],
  hot: ['Hot item! {h} grabs a {b} {i}!', '{h} picks up a hot one: {b} {i}!'],
  mudderRain: ['Mudder {h} loves this rain!', '{h} is a Mudder. Bring on the puddles!'],
  tough: ['Tough {h} takes it better than most!', '{h} is Tough and handles that well.'],
  toughLasso: [
    'Golden Lasso from {by}, but Tough {v} digs in against the lasso!',
    'Tough {v} digs in against the rope!',
  ],
  off: ["And they're off!", "The gates open and they're away!", 'Here we go! The race is on!'],
  lead: [
    '{h} takes the lead!',
    '{h} hits the front!',
    "And now it's {h} in front!",
    '{h} has had enough of the view from behind!',
    '{h} grabs the lead!',
  ],
  outsider: [
    'The {o}-to-1 outsider {h} hits the front! Who saw that coming?',
    'Long shot alert! {h} at {o}-to-1 leads the field!',
  ],
  lasso: [
    'Golden Lasso! {by} stops {v}!',
    'Yee-haw! {by} lassoes the leader, and {v} is going nowhere!',
    'Golden Lasso from {by}! {v} grinds to a halt!',
  ],
  thunderclap: ['Thunderclap from {h}!', 'Ka-boom! {h} rattles the whole field!'],
  stampede: [
    '{h} stampedes through the field!',
    'Make way! {h} is charging through!',
    'Stampede! {h} bulldozes past the pack!',
  ],
  banana: ['{v} slips on a banana! Who left that there?', 'Banana peel! {v} goes for a skid!'],
  horseshoe: ['A horseshoe bounces off {v}! Ouch!', '{by} lobs a horseshoe at {v}!'],
  mess: ['{by} kicks up a storm!', 'Mud everywhere! {by} makes a mess of it!'],
  hornets: [
    'Hornets! The leaders are swatting for their lives!',
    'Here come the hornets! Bad day to be in front!',
  ],
  snack: ['{h} stops for a snack! Priorities!', 'Snack break for {h}! Right now? Really?'],
  sleepy: ["{h}'s jockey is nodding off!", "Wake up! {h}'s jockey is half asleep!"],
  trip: ['{h} trips over absolutely nothing!', 'Whoops! {h} stumbles!'],
  thunderHooves: ['Thunder Hooves! {h} takes off!', '{h} finds another gear!'],
  carrot: ['{h} munches a carrot and speeds up!', 'Carrot power for {h}!'],
  reflect: [
    'Mirror Saddle! {h} bounces it straight back at {by}!',
    'Return to sender! {h} sends it back to {by}!',
  ],
  bubble: ['{h} is safe in the Lucky Bubble!', "It bounces right off {h}'s bubble!"],
  shield: ['Shield up! {h} shrugs it off!', 'Blocked! {h} saw that coming!'],
  neck: ['Neck and neck between {a} and {b}!', 'Nothing in it! {a} and {b} side by side!'],
  crowd: ['Listen to that crowd!', 'The office is on its feet!', 'What an atmosphere in here!'],
  stretch: ['Into the final stretch!', 'Here comes the home straight!', 'They turn for home!'],
  photo: ['Photo finish! '],
  comeback: ['From last to first! '],
  win: ['{w} wins it!', '{w} takes the crown!', "And it's {w}! What a race!"],
  podiumRest: [' {b} second, {c} third.'],
  noBets: ['No bets this time. Next race!'],
  noWinners: ['No winners! The bookie keeps it all!', 'Ouch, nobody backed that one!'],
  bigWin: ['{h} cashes in {n} coins!', 'Big winner: {h} with {n} coins!'],
} as const;

export type Rand = () => number;

/** A random line from `pool` with {key} placeholders filled. */
export function line(
  pool: readonly string[],
  vars: Record<string, string | number>,
  rand: Rand,
): string {
  const text = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
