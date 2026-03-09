import { CoachService } from './dist/services/coach-service.js';

async function test() {
  try {
    console.log('Testing CoachService.chat...');
    const response = await CoachService.chat('2', 'hi');
    console.log('Response:', response);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
