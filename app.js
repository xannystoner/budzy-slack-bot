// app.js
require('dotenv').config();
const express = require('express');
const { App, ExpressReceiver } = require('@slack/bolt');

const PORT = process.env.PORT || 10000;

// Check Slack env vars
const hasSlackConfig =
  !!process.env.SLACK_SIGNING_SECRET &&
  !!process.env.SLACK_BOT_TOKEN;

if (!hasSlackConfig) {
  // 🔒 SAFE MODE (no Slack credentials set)
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.send('ok (Slack not configured yet)');
  });

  // Slack events still need a 200 response to avoid timeouts
  app.post('/slack/events', (req, res) => {
    console.warn('Received /slack/events but Slack env vars are missing');
    res.status(200).send('Slack app not configured yet');
  });

  app.listen(PORT, () => {
    console.log(`Safe server running on port ${PORT}`);
    console.log('Set SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN to enable Slack features.');
  });

} else {
  // ✅ FULL SLACK MODE
  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoints: '/slack/events'
  });

  // Add health check to the Express receiver
  receiver.app.get('/health', (req, res) => {
    res.send('ok');
  });

  // Create the Slack Bolt app
  const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver
  });

  // Slash command: /onboard
  slackApp.command('/onboard', async ({ ack, command, respond }) => {
    await ack();
    await respond({
      response_type: 'ephemeral',
      text: `👋 Hi <@${command.user_id}>! I'll help onboard folks here.`
    });
  });

  // App home opened
  slackApp.event('app_home_opened', async ({ event, client }) => {
    try {
      await client.views.publish({
        user_id: event.user,
        view: {
          type: 'home',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Welcome to Budzy Onboarding Bot* 🎉'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Use `/onboard` in a channel to welcome new teammates.'
              }
            }
          ]
        }
      });
    } catch (error) {
      console.error('Error publishing App Home:', error);
    }
  });

  // team_join event – DM new user
  slackApp.event('team_join', async ({ event, client }) => {
    try {
      const userId = event.user.id;
      await client.chat.postMessage({
        channel: userId,
        text: `🎉 Welcome to the team, <@${userId}>!`
      });
    } catch (error) {
      console.error('Error handling team_join:', error);
    }
  });

  // Start the Slack app
  (async () => {
    await slackApp.start(PORT);
    console.log(`Slack app running on port ${PORT}`);
  })();
}
