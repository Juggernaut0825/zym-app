export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface BodyFatRangeOption extends SelectOption {
  midpoint: number;
}

export const genderOptions: SelectOption[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export const activityLevelOptions: SelectOption[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Mostly seated, minimal training' },
  { value: 'light', label: 'Light', description: 'Light activity a few days each week' },
  { value: 'moderate', label: 'Moderate', description: 'Regular training and average daily movement' },
  { value: 'active', label: 'Active', description: 'Frequent training and high daily movement' },
  { value: 'very_active', label: 'Very active', description: 'High training volume or physical work' },
];

export const goalOptions: SelectOption[] = [
  { value: 'cut', label: 'Cut', description: 'Lean out and reduce body fat' },
  { value: 'maintain', label: 'Keep', description: 'Keep bodyweight steady and improve consistency' },
  { value: 'bulk', label: 'Bulk', description: 'Build size and increase bodyweight' },
];

export const experienceLevelOptions: SelectOption[] = [
  { value: 'beginner', label: 'Beginner', description: 'New to structured training' },
  { value: 'intermediate', label: 'Intermediate', description: 'Has trained consistently before' },
  { value: 'advanced', label: 'Advanced', description: 'Comfortable with programming and progression' },
];

export const trainingDayOptions: SelectOption[] = [
  { value: '1', label: '1 day / week' },
  { value: '2', label: '2 days / week' },
  { value: '3', label: '3 days / week' },
  { value: '4', label: '4 days / week' },
  { value: '5', label: '5 days / week' },
  { value: '6', label: '6 days / week' },
  { value: '7', label: '7 days / week' },
];

export const bodyFatRangeOptions: BodyFatRangeOption[] = [
  { value: '6-9', label: '6-9%', midpoint: 8 },
  { value: '10-14', label: '10-14%', midpoint: 12 },
  { value: '15-19', label: '15-19%', midpoint: 17 },
  { value: '20-24', label: '20-24%', midpoint: 22 },
  { value: '25-29', label: '25-29%', midpoint: 27 },
  { value: '30-35', label: '30-35%', midpoint: 32 },
  { value: '36-45', label: '36-45%', midpoint: 40 },
];

export function bodyFatRangeToValue(range: string): number | undefined {
  const match = bodyFatRangeOptions.find((option) => option.value === range);
  return match ? match.midpoint : undefined;
}

export function bodyFatValueToRange(value: number | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const closest = bodyFatRangeOptions.reduce<BodyFatRangeOption | null>((best, option) => {
    if (!best) return option;
    return Math.abs(option.midpoint - numeric) < Math.abs(best.midpoint - numeric) ? option : best;
  }, null);
  return closest?.value || '';
}

function normalizeOptionText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function normalizeGenderValue(value: unknown): string {
  const text = normalizeOptionText(value);
  if (!text) return '';
  if (text === 'male' || text === 'man' || text === 'men' || text === 'm') return 'male';
  if (text === 'female' || text === 'woman' || text === 'women' || text === 'f') return 'female';
  return text;
}

export function normalizeActivityLevelValue(value: unknown): string {
  const text = normalizeOptionText(value);
  if (!text) return '';
  if (text === 'very_active' || text === 'veryactive') return 'very_active';
  if (text.includes('very') && text.includes('active')) return 'very_active';
  if (text.includes('sedentary')) return 'sedentary';
  if (text.includes('light')) return 'light';
  if (text.includes('moderate')) return 'moderate';
  if (text === 'active' || text.includes('active')) return 'active';
  return text;
}

export function normalizeGoalValue(value: unknown): string {
  const text = normalizeOptionText(value);
  if (!text) return '';
  if (text === 'maintain' || text === 'maintenance' || text === 'keep' || text === 'recomp' || text === 'recomposition') {
    return 'maintain';
  }
  if (text === 'cut' || text === 'fat_loss' || text === 'lose_fat' || text === 'lean_out' || text === 'lean') {
    return 'cut';
  }
  if (text === 'bulk' || text === 'gain' || text === 'muscle_gain' || text === 'size') {
    return 'bulk';
  }
  return text;
}

export function normalizeExperienceLevelValue(value: unknown): string {
  const text = normalizeOptionText(value);
  if (!text) return '';
  if (text.includes('beginner')) return 'beginner';
  if (text.includes('intermediate')) return 'intermediate';
  if (text.includes('advanced')) return 'advanced';
  return text;
}

export function normalizeTrainingDaysValue(value: unknown): string {
  const direct = String(value ?? '').trim();
  if (!direct) return '';
  if (/^[1-7]$/.test(direct)) return direct;
  const match = direct.match(/[1-7]/);
  return match ? match[0] : '';
}

export function optionLabelForValue(options: SelectOption[], value: unknown, fallback = ''): string {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return options.find((option) => option.value === normalized)?.label || normalized;
}

export function formatNumericProfileValue(value: unknown, maxDecimals = 1): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return String(value || '').trim();
  }
  const safeDecimals = Math.max(0, Math.min(2, Math.floor(maxDecimals)));
  if (safeDecimals === 0 || Number.isInteger(numeric)) {
    return String(Math.round(numeric));
  }
  return String(Number(numeric.toFixed(safeDecimals)));
}
