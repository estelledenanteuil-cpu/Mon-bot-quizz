// ============================================
// BOT QUIZ QUOTIDIEN — Discord.js v14
// ============================================
// Ce bot :
// 1. Poste PLUSIEURS questions/énigmes chaque jour, à des heures fixes définies dans DAILY_TIMES (questions.json)
// 2. Permet de déclencher une énigme plus difficile à la demande avec !enigme (enigmes.json, fichier séparé)
// 3. Détecte la première bonne réponse dans le salon, pour chaque question
// 4. Attribue de l'XP au gagnant (classement persistant en JSON)
// 5. Seul le membre en tête du classement porte le rôle "Cerveau du serveur" — le rôle change de main
//    automatiquement si quelqu'un d'autre prend la première place
//
// Installation : voir README.md / guide-mobile.md

const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config();

const QUESTIONS_FILE = './questions.json'; // questions "classiques" du quiz automatique
const ENIGMES_FILE = './enigmes.json';     // énigmes plus difficiles pour !enigme
const SCORES_FILE = './scores.json';
const QUIZ_CHANNEL_ID = process.env.QUIZ_CHANNEL_ID; // ID du salon où poster
const REWARD_ROLE_ID = process.env.REWARD_ROLE_ID;   // ID du rôle "Cerveau du serveur"
const XP_PER_QUESTION = 5;
const XP_PER_ENIGME = 10; // les énigmes difficiles rapportent plus

// Heures de publication automatique dans la journée, séparées par des virgules (heure 0-23)
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

let scores = loadJSON(SCORES_FILE, {}); // { userId: xp }
let currentQuestion = null; // { question, answers: [...], xpValue }

// --- Normalisation des réponses (insensible à la casse et aux accents) ---
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// --- Choisit une question au hasard dans un fichier donné ---
function pickFrom(file) {
  const list = loadJSON(file, []);
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

// --- Poste une question "classique" (questions.json) ---
async function postDailyQuestion() {
  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID);
  const q = pickFrom(QUESTIONS_FILE);
  if (!q) return console.log('Aucune question dans questions.json');
  currentQuestion = { ...q, xpValue: XP_PER_QUESTION };
  await channel.send(
    `🧩 **Question du jour !**\n\n${q.question}\n\n*Premier(e) à trouver gagne ${XP_PER_QUESTION} XP !*`
  );
}

// --- Poste une énigme difficile (enigmes.json), sur demande via !enigme ---
async function postEnigme(channel) {
  const q = pickFrom(ENIGMES_FILE);
  if (!q) {
    await channel.send("Aucune énigme n'est disponible pour le moment.");
    return;
  }
  currentQuestion = { ...q, xpValue: XP_PER_ENIGME };
  await channel.send(
    `🧠 **Énigme !**\n\n${q.question}\n\n*Premier(e) à trouver gagne ${XP_PER_ENIGME} XP !*`
  );
}

// --- Met à jour le rôle "Cerveau du serveur" : uniquement le/la 1er(ère) du classement ---
async function updateBrainRole(guild) {
  if (!REWARD_ROLE_ID) return;
  const role = guild.roles.cache.get(REWARD_ROLE_ID);
  if (!role) return;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return;

  const topScore = sorted[0][1];
  const topUserIds = new Set(
    sorted.filter(([, xp]) => xp === topScore).map(([id]) => id)
  );

  await guild.members.fetch(); // s'assure d'avoir tous les membres en cache

  // Retire le rôle à qui ne fait plus partie du top
  for (const member of role.members.values()) {
    if (!topUserIds.has(member.id)) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  // Ajoute le rôle aux nouveaux leaders (et annonce si c'est une nouveauté)
  for (const id of topUserIds) {
    const member = guild.members.cache.get(id);
    if (member && !member.roles.cache.has(role.id)) {
      await member.roles.add(role).catch(() => {});
      await guild.channels.cache
        .get(QUIZ_CHANNEL_ID)
        ?.send(`🧠 ${member} prend la tête du classement et devient **Cerveau du serveur** !`);
    }
  }
}

// --- Attribue l'XP + met à jour le rôle de tête de classement ---
async function awardXP(message) {
  const userId = message.author.id;
  scores[userId] = (scores[userId] || 0) + currentQuestion.xpValue;
  saveJSON(SCORES_FILE, scores);

  await message.reply(
    `🎉 Bonne réponse, ${message.author}! Tu gagnes ${currentQuestion.xpValue} XP (total : ${scores[userId]} XP).`
  );

  await updateBrainRole(message.guild);

  currentQuestion = null; // referme la question, une seule bonne réponse récompensée
}

// --- Écoute de tous les messages du salon quiz ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== QUIZ_CHANNEL_ID) return;

  // Commande !enigme : déclenche une énigme difficile à la demande
  if (message.content === '!enigme') {
    if (currentQuestion) {
      await message.reply("Une question est déjà en cours, réponds à celle-ci d'abord !");
      return;
    }
    await postEnigme(message.channel);
    return;
  }

  // Commande !classement
  if (message.content === '!classement') {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      return message.reply('Pas encore de scores enregistrés.');
    }
    const lines = await Promise.all(
      sorted.slice(0, 10).map(async ([id, xp], i) => {
        const user = await client.users.fetch(id).catch(() => null);
        return `${i + 1}. ${user ? user.username : id} — ${xp} XP`;
      })
    );
    message.reply(`🏅 **Classement**\n${lines.join('\n')}`);
    return;
  }

  // Sinon, vérifie si c'est une bonne réponse à la question en cours
  if (!currentQuestion) return;
  const userAnswer = normalize(message.content);
  const isCorrect = currentQuestion.answers.map(normalize).some((a) => a === userAnswer);

  if (isCorrect) {
    await awardXP(message);
  }
});

// --- Planification des questions automatiques ---
client.once(Events.ClientReady, (c) => {
  console.log(`Connecté en tant que ${c.user.tag}`);
  console.log(`Questions automatiques programmées à : ${DAILY_TIMES.join('h, ')}h`);
  console.log(`Commande à la demande activée : !enigme (fichier enigmes.json)`);

  DAILY_TIMES.forEach((hour) => {
    cron.schedule(`0 ${hour} * * *`, postDailyQuestion, { timezone: 'Europe/Paris' });
  });
});

client.login(process.env.DISCORD_TOKEN);
