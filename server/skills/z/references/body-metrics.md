# Body Metrics and Metabolism

## BMR Formulas

### Mifflin-St Jeor (default)
```text
Male:   BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5
Female: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161
```

### Katch-McArdle (requires body-fat %)
```text
BMR = 370 + 21.6 × lean_body_mass(kg)
lean_body_mass = weight × (1 - body_fat_pct / 100)
```

## TDEE Activity Multipliers

| Activity level | Multiplier | Description |
|---|---:|---|
| sedentary | 1.2 | Mostly seated, little exercise |
| light | 1.375 | Light activity, 1-3 sessions/week |
| moderate | 1.55 | Moderate activity, 3-5 sessions/week |
| active | 1.725 | High activity, 6-7 sessions/week |
| very_active | 1.9 | Very high activity, labor + training |

## Goal-Based Calorie Targets

| Goal | Target formula | Typical expectation |
|---|---|---|
| cut | TDEE - 500 | Around 0.5 kg/week fat loss |
| bulk | TDEE + 300 | Slow lean gain |
| maintain | TDEE | Weight maintenance |
