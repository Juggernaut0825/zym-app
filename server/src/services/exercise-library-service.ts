const RAW_EXERCISE_IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

export interface ExerciseLibraryEntry {
  key: string;
  sourceId: string;
  name: string;
  group: 'chest' | 'back' | 'shoulders' | 'legs' | 'arms' | 'core';
  equipment: string;
  aliases: string[];
  thumbnailUrl: string;
  demoUrl: string;
  imageUrls: string[];
}

interface ExerciseLibrarySeed {
  key: string;
  sourceId: string;
  name: string;
  group: ExerciseLibraryEntry['group'];
  equipment: string;
  aliases: string[];
}

export interface ExerciseLibraryMatch {
  entry: ExerciseLibraryEntry;
  score: number;
}

const EXERCISE_LIBRARY_SEEDS: ExerciseLibrarySeed[] = [
  {
    key: 'bench_press_barbell_flat',
    sourceId: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Barbell Bench Press',
    group: 'chest',
    equipment: 'barbell',
    aliases: ['flat bench press', 'barbell bench', 'bb bench press'],
  },
  {
    key: 'bench_press_barbell_incline',
    sourceId: 'Barbell_Incline_Bench_Press_-_Medium_Grip',
    name: 'Incline Barbell Bench Press',
    group: 'chest',
    equipment: 'barbell',
    aliases: ['incline bench press', 'incline bb bench', 'barbell incline press'],
  },
  {
    key: 'bench_press_dumbbell_flat',
    sourceId: 'Dumbbell_Bench_Press',
    name: 'Dumbbell Bench Press',
    group: 'chest',
    equipment: 'dumbbell',
    aliases: ['db bench press', 'flat dumbbell press'],
  },
  {
    key: 'bench_press_dumbbell_incline',
    sourceId: 'Incline_Dumbbell_Press',
    name: 'Incline Dumbbell Press',
    group: 'chest',
    equipment: 'dumbbell',
    aliases: ['incline db press', 'incline dumbbell bench press'],
  },
  {
    key: 'chest_press_machine',
    sourceId: 'Leverage_Chest_Press',
    name: 'Machine Chest Press',
    group: 'chest',
    equipment: 'machine',
    aliases: ['plate loaded chest press', 'lever chest press'],
  },
  {
    key: 'chest_press_cable',
    sourceId: 'Cable_Chest_Press',
    name: 'Cable Chest Press',
    group: 'chest',
    equipment: 'cable',
    aliases: ['standing cable chest press'],
  },
  {
    key: 'chest_fly_cable',
    sourceId: 'Flat_Bench_Cable_Flyes',
    name: 'Cable Fly',
    group: 'chest',
    equipment: 'cable',
    aliases: ['cable flyes', 'cable chest fly', 'flat cable fly'],
  },
  {
    key: 'chest_fly_dumbbell',
    sourceId: 'Dumbbell_Flyes',
    name: 'Dumbbell Fly',
    group: 'chest',
    equipment: 'dumbbell',
    aliases: ['db fly', 'flat dumbbell fly'],
  },
  {
    key: 'push_up',
    sourceId: 'Pushups',
    name: 'Push-Up',
    group: 'chest',
    equipment: 'bodyweight',
    aliases: ['pushup', 'push up', 'bodyweight push-up'],
  },
  {
    key: 'lat_pulldown_wide',
    sourceId: 'Wide-Grip_Lat_Pulldown',
    name: 'Wide-Grip Lat Pulldown',
    group: 'back',
    equipment: 'cable',
    aliases: ['wide grip lat pulldown', 'lat pulldown'],
  },
  {
    key: 'lat_pulldown_close',
    sourceId: 'Close-Grip_Front_Lat_Pulldown',
    name: 'Close-Grip Lat Pulldown',
    group: 'back',
    equipment: 'cable',
    aliases: ['close grip lat pulldown', 'neutral grip pulldown'],
  },
  {
    key: 'pull_up',
    sourceId: 'Pullups',
    name: 'Pull-Up',
    group: 'back',
    equipment: 'bodyweight',
    aliases: ['pullup', 'wide grip pull-up'],
  },
  {
    key: 'chin_up',
    sourceId: 'Chin-Up',
    name: 'Chin-Up',
    group: 'back',
    equipment: 'bodyweight',
    aliases: ['chinup', 'underhand pull-up'],
  },
  {
    key: 'seated_cable_row',
    sourceId: 'Seated_Cable_Rows',
    name: 'Seated Cable Row',
    group: 'back',
    equipment: 'cable',
    aliases: ['cable row', 'seated row'],
  },
  {
    key: 'one_arm_dumbbell_row',
    sourceId: 'One-Arm_Dumbbell_Row',
    name: 'One-Arm Dumbbell Row',
    group: 'back',
    equipment: 'dumbbell',
    aliases: ['single-arm dumbbell row', 'single arm db row', 'one arm row'],
  },
  {
    key: 'bent_over_barbell_row',
    sourceId: 'Bent_Over_Barbell_Row',
    name: 'Bent-Over Barbell Row',
    group: 'back',
    equipment: 'barbell',
    aliases: ['barbell row', 'bent over row', 'bb row'],
  },
  {
    key: 'dumbbell_incline_row',
    sourceId: 'Dumbbell_Incline_Row',
    name: 'Chest-Supported Dumbbell Row',
    group: 'back',
    equipment: 'dumbbell',
    aliases: ['chest supported row', 'incline dumbbell row', 'supported dumbbell row'],
  },
  {
    key: 'high_row_machine',
    sourceId: 'Leverage_High_Row',
    name: 'Machine High Row',
    group: 'back',
    equipment: 'machine',
    aliases: ['high row', 'plate loaded high row'],
  },
  {
    key: 'straight_arm_pulldown',
    sourceId: 'Straight-Arm_Pulldown',
    name: 'Straight-Arm Pulldown',
    group: 'back',
    equipment: 'cable',
    aliases: ['straight arm pulldown', 'lat prayer pulldown'],
  },
  {
    key: 'face_pull',
    sourceId: 'Face_Pull',
    name: 'Face Pull',
    group: 'back',
    equipment: 'cable',
    aliases: ['rope face pull'],
  },
  {
    key: 'band_pull_apart',
    sourceId: 'Band_Pull_Apart',
    name: 'Band Pull-Apart',
    group: 'back',
    equipment: 'bands',
    aliases: ['band pull apart', 'pull-apart'],
  },
  {
    key: 'shoulder_press_dumbbell',
    sourceId: 'Dumbbell_Shoulder_Press',
    name: 'Dumbbell Shoulder Press',
    group: 'shoulders',
    equipment: 'dumbbell',
    aliases: ['db shoulder press', 'dumbbell overhead press'],
  },
  {
    key: 'shoulder_press_seated_dumbbell',
    sourceId: 'Seated_Dumbbell_Press',
    name: 'Seated Dumbbell Shoulder Press',
    group: 'shoulders',
    equipment: 'dumbbell',
    aliases: ['seated db shoulder press', 'seated dumbbell press'],
  },
  {
    key: 'shoulder_press_barbell',
    sourceId: 'Barbell_Shoulder_Press',
    name: 'Barbell Shoulder Press',
    group: 'shoulders',
    equipment: 'barbell',
    aliases: ['barbell overhead press', 'bb shoulder press'],
  },
  {
    key: 'arnold_press',
    sourceId: 'Arnold_Dumbbell_Press',
    name: 'Arnold Press',
    group: 'shoulders',
    equipment: 'dumbbell',
    aliases: ['arnold dumbbell press'],
  },
  {
    key: 'lateral_raise_dumbbell',
    sourceId: 'Side_Lateral_Raise',
    name: 'Dumbbell Lateral Raise',
    group: 'shoulders',
    equipment: 'dumbbell',
    aliases: ['lateral raise', 'side raise', 'db lateral raise'],
  },
  {
    key: 'lateral_raise_cable',
    sourceId: 'Cable_Seated_Lateral_Raise',
    name: 'Cable Lateral Raise',
    group: 'shoulders',
    equipment: 'cable',
    aliases: ['cable lateral raise', 'single-arm cable lateral raise'],
  },
  {
    key: 'rear_delt_fly_cable',
    sourceId: 'Cable_Rear_Delt_Fly',
    name: 'Cable Rear Delt Fly',
    group: 'shoulders',
    equipment: 'cable',
    aliases: ['rear delt fly', 'reverse cable fly'],
  },
  {
    key: 'rear_delt_fly_dumbbell',
    sourceId: 'Seated_Bent-Over_Rear_Delt_Raise',
    name: 'Rear Delt Fly',
    group: 'shoulders',
    equipment: 'dumbbell',
    aliases: ['rear delt raise', 'reverse dumbbell fly', 'bent-over rear delt raise'],
  },
  {
    key: 'squat_barbell_back',
    sourceId: 'Barbell_Squat',
    name: 'Barbell Back Squat',
    group: 'legs',
    equipment: 'barbell',
    aliases: ['back squat', 'barbell squat', 'bb squat'],
  },
  {
    key: 'squat_barbell_front',
    sourceId: 'Front_Barbell_Squat',
    name: 'Front Squat',
    group: 'legs',
    equipment: 'barbell',
    aliases: ['front squat', 'barbell front squat'],
  },
  {
    key: 'squat_goblet',
    sourceId: 'Goblet_Squat',
    name: 'Goblet Squat',
    group: 'legs',
    equipment: 'dumbbell',
    aliases: ['db goblet squat', 'kettlebell goblet squat'],
  },
  {
    key: 'leg_press',
    sourceId: 'Leg_Press',
    name: 'Leg Press',
    group: 'legs',
    equipment: 'machine',
    aliases: ['machine leg press'],
  },
  {
    key: 'deadlift_romanian',
    sourceId: 'Romanian_Deadlift',
    name: 'Romanian Deadlift',
    group: 'legs',
    equipment: 'barbell',
    aliases: ['rdl', 'barbell rdl', 'romanian dead lift'],
  },
  {
    key: 'deadlift_barbell',
    sourceId: 'Barbell_Deadlift',
    name: 'Barbell Deadlift',
    group: 'legs',
    equipment: 'barbell',
    aliases: ['deadlift', 'conventional deadlift', 'bb deadlift'],
  },
  {
    key: 'lunge_dumbbell',
    sourceId: 'Dumbbell_Lunges',
    name: 'Dumbbell Lunge',
    group: 'legs',
    equipment: 'dumbbell',
    aliases: ['db lunge', 'walking dumbbell lunge', 'dumbbell lunge'],
  },
  {
    key: 'lunge_walking_barbell',
    sourceId: 'Barbell_Walking_Lunge',
    name: 'Barbell Walking Lunge',
    group: 'legs',
    equipment: 'barbell',
    aliases: ['walking lunge', 'barbell lunge'],
  },
  {
    key: 'split_squat_dumbbell',
    sourceId: 'Split_Squat_with_Dumbbells',
    name: 'Dumbbell Split Squat',
    group: 'legs',
    equipment: 'dumbbell',
    aliases: ['split squat', 'bulgarian split squat', 'db split squat'],
  },
  {
    key: 'hip_thrust_barbell',
    sourceId: 'Barbell_Hip_Thrust',
    name: 'Barbell Hip Thrust',
    group: 'legs',
    equipment: 'barbell',
    aliases: ['hip thrust', 'bb hip thrust', 'glute bridge hip thrust'],
  },
  {
    key: 'leg_curl_lying',
    sourceId: 'Lying_Leg_Curls',
    name: 'Lying Leg Curl',
    group: 'legs',
    equipment: 'machine',
    aliases: ['lying hamstring curl', 'leg curl'],
  },
  {
    key: 'leg_curl_seated',
    sourceId: 'Seated_Leg_Curl',
    name: 'Seated Leg Curl',
    group: 'legs',
    equipment: 'machine',
    aliases: ['seated hamstring curl'],
  },
  {
    key: 'leg_extension',
    sourceId: 'Leg_Extensions',
    name: 'Leg Extension',
    group: 'legs',
    equipment: 'machine',
    aliases: ['quad extension', 'machine leg extension'],
  },
  {
    key: 'calf_raise_standing',
    sourceId: 'Standing_Calf_Raises',
    name: 'Standing Calf Raise',
    group: 'legs',
    equipment: 'machine',
    aliases: ['calf raise', 'standing calf raise'],
  },
  {
    key: 'calf_raise_seated',
    sourceId: 'Seated_Calf_Raise',
    name: 'Seated Calf Raise',
    group: 'legs',
    equipment: 'machine',
    aliases: ['seated calf raise'],
  },
  {
    key: 'biceps_curl_barbell',
    sourceId: 'Barbell_Curl',
    name: 'Barbell Curl',
    group: 'arms',
    equipment: 'barbell',
    aliases: ['bb curl', 'standing barbell curl'],
  },
  {
    key: 'biceps_curl_dumbbell',
    sourceId: 'Dumbbell_Bicep_Curl',
    name: 'Dumbbell Curl',
    group: 'arms',
    equipment: 'dumbbell',
    aliases: ['db curl', 'dumbbell biceps curl'],
  },
  {
    key: 'hammer_curl',
    sourceId: 'Hammer_Curls',
    name: 'Hammer Curl',
    group: 'arms',
    equipment: 'dumbbell',
    aliases: ['db hammer curl', 'alternating hammer curl'],
  },
  {
    key: 'preacher_curl',
    sourceId: 'Preacher_Curl',
    name: 'Preacher Curl',
    group: 'arms',
    equipment: 'barbell',
    aliases: ['ez preacher curl', 'barbell preacher curl'],
  },
  {
    key: 'triceps_pushdown_rope',
    sourceId: 'Triceps_Pushdown_-_Rope_Attachment',
    name: 'Rope Triceps Pushdown',
    group: 'arms',
    equipment: 'cable',
    aliases: ['rope pushdown', 'triceps rope pushdown', 'rope pressdown'],
  },
  {
    key: 'triceps_pushdown_bar',
    sourceId: 'Triceps_Pushdown',
    name: 'Triceps Pushdown',
    group: 'arms',
    equipment: 'cable',
    aliases: ['straight bar pushdown', 'triceps pressdown'],
  },
  {
    key: 'overhead_triceps_extension_rope',
    sourceId: 'Cable_Rope_Overhead_Triceps_Extension',
    name: 'Overhead Rope Triceps Extension',
    group: 'arms',
    equipment: 'cable',
    aliases: ['rope overhead triceps extension', 'cable overhead extension'],
  },
  {
    key: 'skullcrusher_ez',
    sourceId: 'EZ-Bar_Skullcrusher',
    name: 'EZ-Bar Skullcrusher',
    group: 'arms',
    equipment: 'ez bar',
    aliases: ['skullcrusher', 'ez skullcrusher', 'lying triceps extension'],
  },
  {
    key: 'dip_triceps',
    sourceId: 'Dips_-_Triceps_Version',
    name: 'Triceps Dip',
    group: 'arms',
    equipment: 'bodyweight',
    aliases: ['bench dip', 'triceps dip', 'assisted dip'],
  },
  {
    key: 'plank',
    sourceId: 'Plank',
    name: 'Plank',
    group: 'core',
    equipment: 'bodyweight',
    aliases: ['front plank'],
  },
  {
    key: 'hanging_leg_raise',
    sourceId: 'Hanging_Leg_Raise',
    name: 'Hanging Leg Raise',
    group: 'core',
    equipment: 'bodyweight',
    aliases: ['leg raise', 'hanging knee raise'],
  },
  {
    key: 'cable_crunch',
    sourceId: 'Cable_Crunch',
    name: 'Cable Crunch',
    group: 'core',
    equipment: 'cable',
    aliases: ['kneeling cable crunch', 'rope crunch'],
  },
  {
    key: 'ab_roller',
    sourceId: 'Ab_Roller',
    name: 'Ab Roller',
    group: 'core',
    equipment: 'wheel',
    aliases: ['ab wheel', 'ab rollout'],
  },
  {
    key: 'crunch_machine',
    sourceId: 'Ab_Crunch_Machine',
    name: 'Ab Crunch Machine',
    group: 'core',
    equipment: 'machine',
    aliases: ['machine crunch', 'ab machine crunch'],
  },
  {
    key: 'reverse_crunch',
    sourceId: 'Reverse_Crunch',
    name: 'Reverse Crunch',
    group: 'core',
    equipment: 'bodyweight',
    aliases: ['lying reverse crunch'],
  },
];

function buildImageUrl(sourceId: string, frame: number): string {
  return `${RAW_EXERCISE_IMAGE_BASE}/${encodeURIComponent(sourceId)}/${frame}.jpg`;
}

function normalizeExerciseText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bdb\b/g, ' dumbbell ')
    .replace(/\bbb\b/g, ' barbell ')
    .replace(/[_/()-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeExerciseText(value: string): string[] {
  return normalizeExerciseText(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !['the', 'a', 'an', 'and', 'with', 'on', 'to', 'of'].includes(token));
}

function buildEntry(seed: ExerciseLibrarySeed): ExerciseLibraryEntry {
  const imageUrls = [buildImageUrl(seed.sourceId, 0), buildImageUrl(seed.sourceId, 1)];
  return {
    ...seed,
    thumbnailUrl: imageUrls[0],
    demoUrl: imageUrls[1] || imageUrls[0],
    imageUrls,
  };
}

export const EXERCISE_LIBRARY: ExerciseLibraryEntry[] = EXERCISE_LIBRARY_SEEDS.map(buildEntry);

const EXERCISE_LIBRARY_BY_KEY = new Map(EXERCISE_LIBRARY.map((entry) => [entry.key, entry]));

const EXERCISE_LIBRARY_INDEX = EXERCISE_LIBRARY.map((entry) => ({
  entry,
  normalizedTerms: [
    entry.key,
    entry.name,
    ...entry.aliases,
  ].map((term) => normalizeExerciseText(term)),
}));

function scoreExerciseEntry(query: string, entryTerms: string[]): number {
  const normalizedQuery = normalizeExerciseText(query);
  if (!normalizedQuery) return 0;

  const queryTokens = tokenizeExerciseText(query);
  let best = 0;

  for (const term of entryTerms) {
    if (!term) continue;
    if (term === normalizedQuery) {
      return 1;
    }
    if (term.startsWith(normalizedQuery) || normalizedQuery.startsWith(term)) {
      best = Math.max(best, 0.96);
      continue;
    }
    if (term.includes(normalizedQuery) || normalizedQuery.includes(term)) {
      best = Math.max(best, 0.88);
    }

    if (queryTokens.length === 0) continue;
    const termTokens = new Set(tokenizeExerciseText(term));
    let overlap = 0;
    for (const token of queryTokens) {
      if (termTokens.has(token)) {
        overlap += 1;
      }
    }
    if (overlap === 0) continue;
    const coverage = overlap / queryTokens.length;
    const precision = overlap / Math.max(1, termTokens.size);
    best = Math.max(best, 0.42 + (coverage * 0.4) + (precision * 0.18));
  }

  return best;
}

export function getExerciseLibraryEntry(key: string): ExerciseLibraryEntry | null {
  return EXERCISE_LIBRARY_BY_KEY.get(String(key || '').trim()) || null;
}

export function searchExerciseLibrary(query: string, limit = 6): ExerciseLibraryMatch[] {
  const safeLimit = Math.min(12, Math.max(1, Math.floor(Number(limit) || 6)));
  const matches = EXERCISE_LIBRARY_INDEX
    .map((candidate) => ({
      entry: candidate.entry,
      score: scoreExerciseEntry(query, candidate.normalizedTerms),
    }))
    .filter((item) => item.score >= 0.5)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.entry.name.localeCompare(right.entry.name);
    });

  return matches.slice(0, safeLimit);
}

export function resolveExerciseLibraryEntry(query: string, minimumScore = 0.74): ExerciseLibraryEntry | null {
  const [first] = searchExerciseLibrary(query, 1);
  if (!first) return null;
  return first.score >= minimumScore ? first.entry : null;
}
