#!/bin/bash
# Create demo users and data

echo "Creating demo user data..."

# User 1
mkdir -p data/user1
cat > data/user1/profile.json << 'EOF'
{
  "height": 175,
  "weight": 70,
  "age": 28,
  "gender": "male",
  "activityLevel": "moderate",
  "goal": "bulk",
  "bmr": 1680,
  "tdee": 2604
}
EOF

# User 2
mkdir -p data/user2
cat > data/user2/profile.json << 'EOF'
{
  "height": 165,
  "weight": 58,
  "age": 25,
  "gender": "female",
  "activityLevel": "active",
  "goal": "cut",
  "bmr": 1320,
  "tdee": 2277
}
EOF

echo "Demo data created successfully!"
echo "User 1: 28yo male, 70kg, bulking"
echo "User 2: 25yo female, 58kg, cutting"
