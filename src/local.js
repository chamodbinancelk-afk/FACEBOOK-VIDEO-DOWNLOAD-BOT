import { Bot } from 'grammy';
import { registerHandlers } from './handlers/telegram.js';
import 'dotenv/config';

// Read environment variables from .dev.vars (manually loaded)
const BOT_TOKEN = process.env.BOT_TOKEN || '8382727460:AAEgKVISJN5TTuV4O-82sMGQDG3khwjiKR8';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'd110357f31msh2e0d5216204b77dp10675bjsn98cfa8c30266';

const env = {
  BOT_TOKEN,
  RAPIDAPI_KEY
};

console.log('🤖 Starting Telegram bot in polling mode...');
console.log('📡 Bot Token:', BOT_TOKEN.substring(0, 10) + '...');
console.log('🔑 RapidAPI Key:', RAPIDAPI_KEY ? 'Set ✓' : 'Not set ✗');

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// Register handlers
registerHandlers(bot, env);

// Error handler
bot.catch((err) => {
  console.error('❌ Bot error:', err);
});

// Start the bot
bot.start({
  onStart: (botInfo) => {
    console.log('✅ Bot started successfully!');
    console.log('👤 Bot username:', botInfo.username);
    console.log('📱 Bot name:', botInfo.first_name);
    console.log('\n💡 Send a Facebook video URL to the bot to test it!\n');
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Stopping bot...');
  bot.stop();
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('\n🛑 Stopping bot...');
  bot.stop();
  process.exit(0);
});
