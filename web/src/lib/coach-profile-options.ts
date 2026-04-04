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
  { value: 'maintain', label: 'Maintain', description: 'Keep bodyweight steady and improve consistency' },
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
