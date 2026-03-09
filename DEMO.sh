#!/bin/bash
# Quick demo script

echo "🏋️ ZYM Fitness Coaching App Demo"
echo ""
echo "Starting servers..."
echo ""

# Start server
cd server
npm run dev > ../demo-server.log 2>&1 &
SERVER_PID=$!
echo "✅ Server started (PID: $SERVER_PID)"

# Wait for server
sleep 3

# Start web
cd ../web
npm run dev > ../demo-web.log 2>&1 &
WEB_PID=$!
echo "✅ Web app started (PID: $WEB_PID)"

sleep 3

echo ""
echo "🎉 ZYM is running!"
echo ""
echo "📱 Open in browser: http://localhost:3000"
echo "🔌 WebSocket: ws://localhost:8080"
echo "🌐 API: http://localhost:3001"
echo ""
echo "💬 Try the chat:"
echo "   - Click 'Coach' tab"
echo "   - Type: 'I want to start working out'"
echo "   - See the AI coach respond!"
echo ""
echo "👤 Try the profile:"
echo "   - Click 'Profile' tab"
echo "   - Switch between ZJ (gentle) and LC (strict)"
echo ""
echo "📋 Logs:"
echo "   tail -f demo-server.log"
echo "   tail -f demo-web.log"
echo ""
echo "🛑 To stop: kill $SERVER_PID $WEB_PID"
echo ""
