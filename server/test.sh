#!/bin/bash
# Test script for server functionality

echo "Testing profile service..."
mkdir -p ./data/test_user
echo '{"weight": 70, "height": 175, "age": 30, "gender": "male"}' > ./data/test_user/profile.json

echo "Testing workout logging..."
./scripts/log-workout.sh test_user '{"exercise": "bench press", "sets": 3, "reps": 10, "weight": 60}'

echo "Testing meal logging..."
./scripts/log-meal.sh test_user '{"meal": "chicken breast", "calories": 300, "protein": 50}'

echo "Testing profile retrieval..."
./scripts/get-profile.sh test_user

echo "All tests completed!"
