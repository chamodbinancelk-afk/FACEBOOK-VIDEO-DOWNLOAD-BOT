import { Bot, webhookCallback } from 'grammy';
import { registerHandlers } from './handlers/telegram.js';

export default {
  async fetch(request, env, ctx) {
    const bot = new Bot(env.BOT_TOKEN);
    
    registerHandlers(bot, env);
    
    bot.catch((err) => {
      console.error('Bot error:', err);
    });

    return webhookCallback(bot, 'cloudflare-mod')(request);
  },
};
