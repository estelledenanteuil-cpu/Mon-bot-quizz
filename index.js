// ============================================
// BOT QUIZ QUOTIDIEN — Discord.js v14
// ============================================
// Ce bot :
// 1. Poste PLUSIEURS questions/énigmes chaque jour, à des heures fixes définies dans DAILY_TIMES
// 2. Détecte la première bonne réponse dans le salon, pour chaque question
// 3. Attribue des points au gagnant (classement persistant en JSON)
// 4. Attribue automatiquement un rôle "Champion du quiz" si un seuil de points est atteint
//
// Installation : voir README.md / guide-mobile.md

const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config();

const QUESTIONS_FILE = './questions.json';
const SCORES_FILE = './scores.json';
const QUIZ_CHANNEL_ID = process.env.QUIZ_CHANNEL_ID; // ID du salon où poster
const REWARD_ROLE_ID = process.env.REWARD_ROLE_ID;   // ID du rôle récompense
const POINTS_THRESHOLD = 20; // points nécessaires pour obtenir le rôle

// Heures de publication dans la journée, séparées par des virgules (heure 0-23)
// Exemple : "9,11,13,15,17" = 5 questions par jour, à 9h, 11h, 13h, 15h et 17h
const DAILY_TIMES = (process.env.DAILY_TIMES || '9,11,13,15,17')
  .split(',')
  .map((h) => h.trim());

// --- Client Discord ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- Stockage local (JSON) ---
function loadJSON(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}
function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

let scores = loadJSON(SCORES_FILE, {}); // { userId: points }
let currentQuestion = null; // { question, answers: [...], askedAt }

// --- Normalisation des réponses (insensible à la casse et aux accents) ---
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// --- Choisit une question au hasard dans questions.json ---
function pickQuestion() {
  const questions = loadJSON(QUESTIONS_FILE, []);
  if (questions.length === 0) return null;
  return questions[Math.floor(Math.random() * questions.length)];
}

// --- Poste une question ---
async function postDailyQuestion() {
  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID);
  const q = pickQuestion();
  if (!q) {
    console.log('Aucune question disponible dans questions.json');
    return;
  }
  currentQuestion = { ...q, askedAt: Date.now() };
  await channel.send(
    `🧩 **Énigme !**\n\n${q.question}\n\n*Répondez directement dans ce salon — premier(e) à trouver gagne 5 points !*`
  );
}

// --- Attribue les points + vérifie le rôle récompense ---
async function awardPoints(message) {
  const userId = message.author.id;
  scores[userId] = (scores[userId] || 0) + 5;
  saveJSON(SCORES_FILE, scores);

  await message.reply(
    `🎉 Bonne réponse, ${message.author}! Tu gagnes 5 points (total : ${scores[userId]}).`
  );

  if (scores[userId] >= POINTS_THRESHOLD && REWARD_ROLE_ID) {
    const member = await message.guild.members.fetch(userId);
    if (!member.roles.cache.has(REWARD_ROLE_ID)) {
      await member.roles.add(REWARD_ROLE_ID);
      await message.channel.send(
        `🏆 ${message.author} a atteint ${POINTS_THRESHOLD} points et débloque le rôle de récompense !`
      );
    }
  }

  currentQuestion = null; // referme la question, une seule bonne réponse récompensée
}

// --- Écoute des messages dans le salon quiz ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== QUIZ_CHANNEL_ID) return;
  if (!currentQuestion) return;

  const userAnswer = normalize(message.content);
  const isCorrect = currentQuestion.answers
    .map(normalize)
    .some((a) => a === userAnswer);

  if (isCorrect) {
    await awardPoints(message);
  }
});

// --- Commande simple !classement (optionnelle) ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.content === '!classement') {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return message.reply('Pas encore de scores enregistrés.');
    }
    const lines = await Promise.all(
      sorted.slice(0, 10).map(async ([id, pts], i) => {
        const user = await client.users.fetch(id).catch(() => null);
        return `${i + 1}. ${user ? user.username : id} — ${pts} pts`;
      })
    );
    message.reply(`🏅 **Classement**\n${lines.join('\n')}`);
  }
});

// --- Planification : une tâche cron par heure définie dans DAILY_TIMES ---
client.once(Events.ClientReady, (c) => {
  console.log(`Connecté en tant que ${c.user.tag}`);
  console.log(`Questions programmées à : ${DAILY_TIMES.join('h, ')}h`);

  DAILY_TIMES.forEach((hour) => {
    cron.schedule(`0 ${hour} * * *`, postDailyQuestion, {
      timezone: 'Europe/Paris',
    });
  });
});

client.login(process.env.DISCORD_TOKEN);
