// Nilak's bot, @NilakAppBot, runs in the same Cloudflare Worker that serves nilak.org.
// Requests to `/bot/*` reach this code; everything else is the web app from `dist`.
//
// What it does now:
// - Welcomes people with a Telegram rich message and links to Nilak.
// - Remembers the channels where someone made it an admin.
// - Publishes or schedules posts: send or forward a post to the bot, pick a channel and a time.
//
// Setup (once, after the first deploy): open https://nilak.org/bot/setup to register the webhook and commands.
// Secrets: NILAK_BOT_TOKEN (Cloudflare → nilak-web → Settings → Variables and Secrets). Database: D1 `nilak-bots`.

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DB: D1Database;
  NILAK_BOT_TOKEN: string;
};

type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
};

type TgUser = { id: number; first_name: string; language_code?: string };
type TgChat = { id: number; type: string; title?: string; username?: string };
type TgMessage = {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  date: number;
};
type TgChatMemberUpdated = {
  chat: TgChat;
  from: TgUser;
  new_chat_member: { status: string };
};
type TgCallbackQuery = { id: string; from: TgUser; message?: TgMessage; data?: string };
type TgUpdate = {
  message?: TgMessage;
  my_chat_member?: TgChatMemberUpdated;
  callback_query?: TgCallbackQuery;
};

type ChannelRow = { chat_id: number; title: string };
type ScheduledRow = { id: number; owner_id: number; from_chat_id: number; message_id: number; target_chat_id: number };

const WEB_URL = 'https://nilak.org';
const BOT_USERNAME = 'NilakAppBot';
const WEBHOOK_PATH = '/bot/webhook';
const ADMIN_RIGHTS = 'post_messages+edit_messages+delete_messages';
const HOUR = 3600;
const DAY = 24 * HOUR;
// Choices offered after "When?"; `now` publishes at once
const WHEN_OPTIONS: { code: string; label: string; delay: number }[] = [
  { code: 'now', label: 'Now', delay: 0 },
  { code: '1h', label: 'In 1 hour', delay: HOUR },
  { code: '3h', label: 'In 3 hours', delay: 3 * HOUR },
  { code: '1d', label: 'Tomorrow, same time', delay: DAY },
];
const MAX_DUE_PER_RUN = 50;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS channels (
    chat_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, title TEXT NOT NULL, username TEXT, added_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, owner_id))`,
  `CREATE TABLE IF NOT EXISTS pending (
    owner_id INTEGER PRIMARY KEY, from_chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
    target_chat_id INTEGER)`,
  `CREATE TABLE IF NOT EXISTS scheduled (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, from_chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL, target_chat_id INTEGER NOT NULL, send_at INTEGER NOT NULL, status TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS scheduled_due ON scheduled (status, send_at)',
];

let isSchemaReady = false;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/bot/')) return env.ASSETS.fetch(request);

    await ensureSchema(env);
    if (url.pathname === '/bot/setup') return setup(env, url.origin);
    if (url.pathname !== WEBHOOK_PATH || request.method !== 'POST') return new Response('Not found', { status: 404 });

    // Only Telegram knows the secret the webhook was registered with
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await getWebhookSecret(env)) {
      return new Response('Forbidden', { status: 403 });
    }

    const update = await request.json() as TgUpdate;
    try {
      await handleUpdate(env, update);
    } catch (err) {
      // Worker logs are the bot's error report (Cloudflare → nilak-web → Observability)
      // eslint-disable-next-line no-console
      console.error('update failed', err);
    }
    // Telegram retries an update until it gets 200, so errors are logged instead of returned
    return new Response('ok');
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await ensureSchema(env);
    await sendDuePosts(env);
  },
};

async function handleUpdate(env: Env, update: TgUpdate) {
  if (update.my_chat_member) {
    await handleMembership(env, update.my_chat_member);
  } else if (update.callback_query) {
    await handleCallback(env, update.callback_query);
  } else if (update.message?.chat.type === 'private') {
    await handlePrivateMessage(env, update.message);
  }
}

async function handlePrivateMessage(env: Env, message: TgMessage) {
  const userId = message.chat.id;
  const command = message.text?.split(/\s|@/)[0];

  if (command === '/start' || command === '/help') {
    await sendWelcome(env, userId);
    return;
  }
  if (command === '/channels') {
    await sendChannelList(env, userId);
    return;
  }
  if (command === '/scheduled') {
    await sendScheduledList(env, userId);
    return;
  }
  if (command === '/cancel') {
    await env.DB.prepare('DELETE FROM pending WHERE owner_id = ?').bind(userId).run();
    await sendText(env, userId, 'Cancelled.');
    return;
  }

  // Any other message is a post to publish: it is kept until a channel and a time are chosen
  const channels = await selectChannels(env, userId);
  if (!channels.length) {
    await sendText(
      env, userId, 'Add me to your channel first, then send me a post to publish there.', addToChannelKeyboard(),
    );
    return;
  }

  await env.DB.prepare(
    'INSERT OR REPLACE INTO pending (owner_id, from_chat_id, message_id, target_chat_id) VALUES (?, ?, ?, NULL)',
  ).bind(userId, message.chat.id, message.message_id).run();
  await callTelegram(env, 'sendMessage', {
    chat_id: userId,
    text: 'Publish this to which channel?',
    reply_to_message_id: message.message_id,
    reply_markup: {
      inline_keyboard: channels.map((channel) => [{ text: channel.title, callback_data: `ch:${channel.chat_id}` }]),
    },
  });
}

async function handleCallback(env: Env, query: TgCallbackQuery) {
  const userId = query.from.id;
  const [kind, value] = (query.data || '').split(':');
  const pending = await env.DB.prepare('SELECT * FROM pending WHERE owner_id = ?').bind(userId)
    .first<{ from_chat_id: number; message_id: number; target_chat_id: number | null }>();

  if (kind === 'unschedule') {
    await env.DB.prepare(
      'UPDATE scheduled SET status = \'cancelled\' WHERE id = ? AND owner_id = ? AND status = \'waiting\'',
    ).bind(Number(value), userId).run();
    await answerCallback(env, query.id, 'Removed from the schedule');
    return;
  }
  if (!pending) {
    await answerCallback(env, query.id, 'Send me the post again');
    return;
  }

  if (kind === 'ch') {
    const channels = await selectChannels(env, userId);
    if (!channels.some((channel) => String(channel.chat_id) === value)) {
      await answerCallback(env, query.id, 'I am no longer in that channel');
      return;
    }

    await env.DB.prepare('UPDATE pending SET target_chat_id = ? WHERE owner_id = ?').bind(Number(value), userId).run();
    await answerCallback(env, query.id);
    await editMessage(env, query.message, 'When?', {
      inline_keyboard: WHEN_OPTIONS.map((option) => [{ text: option.label, callback_data: `at:${option.code}` }]),
    });
    return;
  }

  if (kind === 'at' && pending.target_chat_id) {
    const option = WHEN_OPTIONS.find(({ code }) => code === value);
    if (!option) return;

    await env.DB.prepare('DELETE FROM pending WHERE owner_id = ?').bind(userId).run();
    if (!option.delay) {
      const isSent = await copyPost(env, pending.target_chat_id, pending.from_chat_id, pending.message_id);
      await answerCallback(env, query.id);
      await editMessage(env, query.message, isSent ? 'Published ✅' : 'I could not post there. Am I still an admin?');
      return;
    }

    const sendAt = Math.floor(Date.now() / 1000) + option.delay;
    await env.DB.prepare(
      'INSERT INTO scheduled (owner_id, from_chat_id, message_id, target_chat_id, send_at, status) '
      + 'VALUES (?, ?, ?, ?, ?, \'waiting\')',
    ).bind(userId, pending.from_chat_id, pending.message_id, pending.target_chat_id, sendAt).run();
    await answerCallback(env, query.id);
    await editMessage(env, query.message, `Scheduled: ${option.label.toLowerCase()} ⏰\nSee all with /scheduled`);
  }
}

// The bot is added to or removed from a channel
async function handleMembership(env: Env, update: TgChatMemberUpdated) {
  const { chat, from, new_chat_member: member } = update;
  if (chat.type !== 'channel') return;

  if (member.status === 'administrator') {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO channels (chat_id, owner_id, title, username, added_at) VALUES (?, ?, ?, ?, ?)',
      // D1 stores SQL NULL only from `null`
      // eslint-disable-next-line no-null/no-null
    ).bind(chat.id, from.id, chat.title || '', chat.username || null, Math.floor(Date.now() / 1000)).run();
    await sendText(env, from.id, `Connected to “${chat.title}”. Send me any post to publish or schedule it there.`);
    return;
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM channels WHERE chat_id = ?').bind(chat.id),
    env.DB.prepare('UPDATE scheduled SET status = \'cancelled\' WHERE target_chat_id = ? AND status = \'waiting\'')
      .bind(chat.id),
  ]);
}

async function sendDuePosts(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(
    'SELECT * FROM scheduled WHERE status = \'waiting\' AND send_at <= ? ORDER BY send_at LIMIT ?',
  ).bind(now, MAX_DUE_PER_RUN).all<ScheduledRow>();

  for (const post of results) {
    const isSent = await copyPost(env, post.target_chat_id, post.from_chat_id, post.message_id);
    await env.DB.prepare('UPDATE scheduled SET status = ? WHERE id = ?')
      .bind(isSent ? 'sent' : 'failed', post.id).run();
    if (!isSent) await sendText(env, post.owner_id, 'A scheduled post could not be published. Am I still an admin?');
  }
}

async function sendWelcome(env: Env, chatId: number) {
  // A rich message: the article format Nilak's Barruu also uses
  const markdown = [
    '# Welcome to Nilak 🌸',
    'I help you run your channel:',
    '- **Publish** — send or forward me any post, choose a channel, and it goes out.',
    '- **Schedule** — pick a time, and I post it for you.',
    '- **Stay on top** — /scheduled shows what is waiting, /channels lists your channels.',
    '',
    `Read and write Barruu, watch reels and chat on [nilak.org](${WEB_URL}).`,
  ].join('\n');

  const isSent = await callTelegram(env, 'sendRichMessage', {
    chat_id: chatId,
    rich_message: { markdown },
    reply_markup: addToChannelKeyboard(),
  });
  if (!isSent) await sendText(env, chatId, 'Welcome to Nilak! Add me to your channel to publish and schedule posts.');
}

async function sendChannelList(env: Env, userId: number) {
  const channels = await selectChannels(env, userId);
  const text = channels.length
    ? `Your channels:\n${channels.map((channel) => `• ${channel.title}`).join('\n')}`
    : 'No channels yet.';
  await sendText(env, userId, text, addToChannelKeyboard());
}

async function sendScheduledList(env: Env, userId: number) {
  const { results } = await env.DB.prepare(
    'SELECT s.id, s.send_at, c.title FROM scheduled s LEFT JOIN channels c ON c.chat_id = s.target_chat_id '
    + 'AND c.owner_id = s.owner_id WHERE s.owner_id = ? AND s.status = \'waiting\' ORDER BY s.send_at LIMIT 20',
  ).bind(userId).all<{ id: number; send_at: number; title: string | null }>();

  if (!results.length) {
    await sendText(env, userId, 'Nothing scheduled.');
    return;
  }

  await callTelegram(env, 'sendMessage', {
    chat_id: userId,
    text: 'Waiting to be published (tap one to remove it):',
    reply_markup: {
      inline_keyboard: results.map((post) => [{
        text: `${post.title || 'Channel'} · ${formatRelative(post.send_at)}`,
        callback_data: `unschedule:${post.id}`,
      }]),
    },
  });
}

function addToChannelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '➕ Add me to a channel', url: `https://t.me/${BOT_USERNAME}?startchannel&admin=${ADMIN_RIGHTS}` }],
      [{ text: 'Open Nilak', url: WEB_URL }],
    ],
  };
}

async function setup(env: Env, origin: string) {
  const results = await Promise.all([
    callTelegram(env, 'setWebhook', {
      url: `${origin}${WEBHOOK_PATH}`,
      secret_token: await getWebhookSecret(env),
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    }),
    callTelegram(env, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'What I can do' },
        { command: 'channels', description: 'Your channels' },
        { command: 'scheduled', description: 'Posts waiting to be published' },
        { command: 'cancel', description: 'Forget the post being prepared' },
      ],
    }),
  ]);

  return Response.json({ webhook: results[0], commands: results[1] });
}

async function selectChannels(env: Env, userId: number) {
  const { results } = await env.DB.prepare('SELECT chat_id, title FROM channels WHERE owner_id = ? ORDER BY title')
    .bind(userId).all<ChannelRow>();
  return results;
}

async function copyPost(env: Env, targetChatId: number, fromChatId: number, messageId: number) {
  return callTelegram(env, 'copyMessage', { chat_id: targetChatId, from_chat_id: fromChatId, message_id: messageId });
}

function sendText(env: Env, chatId: number, text: string, replyMarkup?: unknown) {
  return callTelegram(env, 'sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
}

function answerCallback(env: Env, id: string, text?: string) {
  return callTelegram(env, 'answerCallbackQuery', { callback_query_id: id, text });
}

function editMessage(env: Env, message: TgMessage | undefined, text: string, replyMarkup?: unknown) {
  if (!message) return Promise.resolve(false);
  return callTelegram(env, 'editMessageText', {
    chat_id: message.chat.id, message_id: message.message_id, text, reply_markup: replyMarkup,
  });
}

async function callTelegram(env: Env, method: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.NILAK_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { ok: boolean; description?: string };
    // eslint-disable-next-line no-console
    if (!result.ok) console.error(method, result.description);
    return result.ok;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(method, err);
    return false;
  }
}

// Derived from the token, so the webhook needs no second secret
async function getWebhookSecret(env: Env) {
  const seed = new TextEncoder().encode(`nilak-webhook:${env.NILAK_BOT_TOKEN}`);
  const digest = await crypto.subtle.digest('SHA-256', seed);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 64);
}

async function ensureSchema(env: Env) {
  if (isSchemaReady) return;
  await env.DB.batch(SCHEMA.map((query) => env.DB.prepare(query)));
  isSchemaReady = true;
}

function formatRelative(unix: number) {
  const hours = Math.max(0, Math.round((unix - Date.now() / 1000) / HOUR));
  return hours < 1 ? 'in less than an hour' : hours < 24 ? `in ${hours} h` : `in ${Math.round(hours / 24)} d`;
}
