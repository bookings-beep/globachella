#!/usr/bin/env node
// Sends the Globachella outreach message to each configured webhook target.
//
// Set OUTREACH_TARGETS in repo secrets as a JSON array:
// [
//   {"name":"My Blog Discord","url":"https://discord.com/api/webhooks/...","type":"discord"},
//   {"name":"Music Slack",    "url":"https://hooks.slack.com/...",          "type":"slack"},
//   {"name":"Generic Hook",   "url":"https://example.com/hook",             "type":"generic"}
// ]

const fs = require('fs');

const template = JSON.parse(fs.readFileSync('outreach.json', 'utf8'));
const message = process.env.CUSTOM_MESSAGE?.trim() || template.body;

let targets;
try {
  targets = JSON.parse(process.env.OUTREACH_TARGETS || '[]');
} catch {
  console.error('OUTREACH_TARGETS secret is not valid JSON. Set it in repo Settings → Secrets.');
  process.exit(1);
}

if (!targets.length) {
  console.log('No outreach targets configured. Add OUTREACH_TARGETS to repo secrets.');
  process.exit(0);
}

function buildPayload(type, name, msg) {
  if (type === 'discord') return JSON.stringify({ content: msg });
  if (type === 'slack')   return JSON.stringify({ text: msg });
  return JSON.stringify({ text: msg, message: msg }); // generic
}

async function send(target) {
  const body = buildPayload(target.type || 'generic', target.name, message);
  const res = await fetch(target.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return res.ok;
}

(async () => {
  let passed = 0, failed = 0;
  for (const t of targets) {
    try {
      const ok = await send(t);
      if (ok) { console.log(`✓ ${t.name}`); passed++; }
      else    { console.error(`✗ ${t.name} — non-2xx response`); failed++; }
    } catch (err) {
      console.error(`✗ ${t.name} — ${err.message}`); failed++;
    }
  }

  // Write GitHub Actions summary
  const summary = `## Outreach results\n\n` +
    `| Target | Status |\n|--------|--------|\n` +
    targets.map((t, i) => `| ${t.name} | ${i < passed ? '✅ Sent' : '❌ Failed'} |`).join('\n') +
    `\n\n**Message sent:**\n> ${message}`;

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  if (failed > 0) process.exit(1);
})();
