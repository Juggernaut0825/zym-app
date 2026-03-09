#!/bin/bash
# End-to-end test script

echo "=== ZYM App End-to-End Test ==="
echo ""

echo "1. Testing profile service..."
./scripts/get-profile.sh user1
echo ""

echo "2. Testing workout logging..."
./scripts/log-workout.sh user1 '{"exercise": "squat", "sets": 5, "reps": 5, "weight": 100}'
echo ""

echo "3. Testing meal logging..."
./scripts/log-meal.sh user1 '{"meal": "grilled chicken", "calories": 400, "protein": 60}'
echo ""

echo "4. Checking data files..."
ls -la data/user1/
echo ""

echo "5. Testing TypeScript build..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Build successful"
else
  echo "❌ Build failed"
fi
echo ""

echo "=== All Tests Complete ==="
