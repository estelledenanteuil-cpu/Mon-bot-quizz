// ============================================
// BOT QUIZ QUOTIDIEN — Discord.js v14
// ============================================
// Ce bot :
// 1. Poste plusieurs questions/énigmes chaque jour aux heures de DAILY_TIMES
// 2. Permet de déclencher une énigme avec !enigme
// 3. Détecte la première bonne réponse dans le salon du quiz
// 4. Conserve les scores ET la question en cours après un redémarrage Railway
// 5. Attribue le rôle "Cerveau du serveur" aux personnes en tête du classement

const { Client, GatewayIntentBits, Events } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const QUESTIONS_FILE = path.join(__dirname, 'questions.json');
const ENIGMES_FILE = path.join(__dirname, 'enigmes.json');

// Si un volume Railway est attaché, Railway fournit automatiquement ce chemin.
// Sinon, le bot continue de fonctionner avec le dossier courant.
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || __dirname;

fs.mkdirSync(DATA_DIR, { recursive: true });

const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const CURRENT_QUESTION_FILE = path.join(DATA_DIR, 'current-question.json');
const LEGACY_SCORES_FILE = path.join(__dirname, 'scores.json');

const QUIZ_CHANNEL_ID = process.env.QUIZ_CHANNEL_ID;
const REWARD_ROLE_ID = process.env.REWARD_ROLE_ID;
const XP_PER_QUESTION = 5;
const XP_PER_ENIGME = 10;

const DAILY_TIMES = (process.env.DAILY_TIMES || '10,14,18,20,23')
  .split(',')
  .map((hour) => Number.parseInt(hour.trim(), 10))
  .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);

if (!process.env.DISCORD_TOKEN) {
  throw new Error('La variable DISCORD_TOKEN est manquante.');
}

if (!QUIZ_CHANNEL_ID) {
  throw new Error('La variable QUIZ_CHANNEL_ID est manquante.');
}

if (DAILY_TIMES.length === 0) {
  throw new Error('DAILY_TIMES ne contient aucune heure valide.');
}

// --- Client Discord ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- Lecture et écriture JSON sécurisées ---
function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Impossible de lire ${filePath} :`, error);
    return fallback;
  }
}

function saveJSON(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}

// Récupère les anciens scores du dépôt lors de la première utilisation du volume.
let scores = loadJSON(SCORES_FILE, null);
if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
  scores = loadJSON(LEGACY_SCORES_FILE, {});
  saveJSON(SCORES_FILE, scores);
}

function isValidQuestionState(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.question === 'string' &&
      Array.isArray(value.answers) &&
      value.answers.length > 0 &&
      Number.isFinite(value.xpValue)
  );
}

let currentQuestion = loadJSON(CURRENT_QUESTION_FILE, null);
if (!isValidQuestionState(currentQuestion)) {
  currentQuestion = null;
}

function setCurrentQuestion(question) {
  currentQuestion = question;
  saveJSON(CURRENT_QUESTION_FILE, currentQuestion);
}

function clearCurrentQuestion() {
  currentQuestion = null;
  saveJSON(CURRENT_QUESTION_FILE, null);
}

// Empêche un message reçu pendant le démarrage d'être ignoré avant la restauration.
let markQuestionStateReady;
const questionStateReady = new Promise((resolve) => {
  markQuestionStateReady = resolve;
});

// --- Normalisation des réponses (casse, accents et espaces) ---
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickFrom(filePath) {
  const list = loadJSON(filePath, []);
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildQuestionState(question, xpValue, type, sentMessage) {
  return {
    question: question.question,
    answers: question.answers,
    xpValue,
    type,
    messageId: sentMessage.id,
    channelId: sentMessage.channel.id,
    askedAt: sentMessage.createdAt.toISOString(),
  };
}

// --- Publication des questions ---
async function postDailyQuestion() {
  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    throw new Error(`Le salon ${QUIZ_CHANNEL_ID} est introuvable ou n'est pas textuel.`);
  }

  const question = pickFrom(QUESTIONS_FILE);
  if (!question) {
    console.log('Aucune question dans questions.json');
    return;
  }

  const sentMessage = await channel.send(
    `🧩 **Question du jour !**\n\n${question.question}\n\n*Premier(e) à trouver gagne ${XP_PER_QUESTION} XP !*`
  );

  setCurrentQuestion(
    buildQuestionState(question, XP_PER_QUESTION, 'question', sentMessage)
  );
  console.log(`Question publiée et sauvegardée (${sentMessage.id}).`);
}

async function postEnigme(channel) {
  const question = pickFrom(ENIGMES_FILE);
  if (!question) {
    await channel.send("Aucune énigme n'est disponible pour le moment.");
    return;
  }

  const sentMessage = await channel.send(
    `🧠 **Énigme !**\n\n${question.question}\n\n*Premier(e) à trouver gagne ${XP_PER_ENIGME} XP !*`
  );

  setCurrentQuestion(
    buildQuestionState(question, XP_PER_ENIGME, 'enigme', sentMessage)
  );
  console.log(`Énigme publiée et sauvegardée (${sentMessage.id}).`);
}

// --- Restauration depuis l'historique Discord ---
// Cette sécurité permet aussi de retrouver la question après un déploiement
// effectué avant l'ajout d'un volume Railway.
function isQuizQuestionMessage(message) {
  return Boolean(
    message.author.id === client.user.id &&
      (message.content.startsWith('🧩 **Question du jour !**') ||
        message.content.startsWith('🧠 **Énigme !**'))
  );
}

function questionFromDiscordMessage(message) {
  let filePath;
  let xpValue;
  let type;

  if (message.content.startsWith('🧩 **Question du jour !**')) {
    filePath = QUESTIONS_FILE;
    xpValue = XP_PER_QUESTION;
    type = 'question';
  } else if (message.content.startsWith('🧠 **Énigme !**')) {
    filePath = ENIGMES_FILE;
    xpValue = XP_PER_ENIGME;
    type = 'enigme';
  } else {
    return null;
  }

  const list = loadJSON(filePath, []);
  if (!Array.isArray(list)) return null;

  const headerEnd = message.content.indexOf('\n\n');
  const footerStart = message.content.lastIndexOf(
    '\n\n*Premier(e) à trouver gagne '
  );
  if (headerEnd === -1 || footerStart === -1 || footerStart <= headerEnd) {
    return null;
  }

  const postedQuestion = message.content
    .slice(headerEnd + 2, footerStart)
    .trim();

  const question = list.find(
    (item) =>
      item &&
      typeof item.question === 'string' &&
      Array.isArray(item.answers) &&
      item.question.trim() === postedQuestion
  );

  if (!question) return null;
  return buildQuestionState(question, xpValue, type, message);
}

async function restoreQuestionFromDiscord() {
  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID);
  if (!channel?.isTextBased() || !channel.messages) return;

  // Cherche dans un maximum de 500 messages pour les salons très actifs.
  const messages = [];
  let before;
  for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
    const page = await channel.messages.fetch({
      limit: 100,
      ...(before && { before }),
    });
    messages.push(...page.values());

    if (messages.some(isQuizQuestionMessage) || page.size < 100) break;

    const oldestMessage = [...page.values()].reduce(
      (oldest, message) =>
        !oldest || message.createdTimestamp < oldest.createdTimestamp
          ? message
          : oldest,
      null
    );
    if (!oldestMessage) break;
    before = oldestMessage.id;
  }

  messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const latestQuestionMessage = messages.find(isQuizQuestionMessage);

  if (!latestQuestionMessage) {
    console.log(
      currentQuestion
        ? 'Question restaurée depuis le stockage persistant.'
        : "Aucune question en cours à restaurer."
    );
    return;
  }

  const alreadyAnswered = messages.some(
    (message) =>
      message.author.id === client.user.id &&
      message.createdTimestamp > latestQuestionMessage.createdTimestamp &&
      message.content.startsWith('🎉 Bonne réponse')
  );

  if (alreadyAnswered) {
    clearCurrentQuestion();
    console.log('La dernière question était déjà terminée.');
    return;
  }

  const restored = questionFromDiscordMessage(latestQuestionMessage);
  if (restored) {
    setCurrentQuestion(restored);
    console.log(`Question restaurée depuis Discord (${restored.messageId}).`);
    return;
  }

  // Si le message n'est plus présent dans les fichiers actuels, on conserve
  // quand même un éventuel état valide retrouvé dans le volume.
  if (currentQuestion) {
    console.log('Question restaurée depuis le stockage persistant.');
  } else {
    console.warn(
      "La dernière question Discord n'a pas été retrouvée dans les fichiers JSON."
    );
  }
}

// Si Railway remplace le conteneur entre la question et une réponse, l'état
// en mémoire peut être absent. Une seule récupération est lancée à la fois,
// puis tous les messages en attente réutilisent le même résultat.
let questionRecoveryPromise = null;

async function ensureCurrentQuestion() {
  if (currentQuestion) return true;

  if (!questionRecoveryPromise) {
    questionRecoveryPromise = restoreQuestionFromDiscord()
      .catch((error) => {
        console.error('Récupération immédiate de la question impossible :', error);
      })
      .finally(() => {
        questionRecoveryPromise = null;
      });
  }

  await questionRecoveryPromise;
  return Boolean(currentQuestion);
}

// --- Rôle "Cerveau du serveur" ---
async function updateBrainRole(guild) {
  if (!REWARD_ROLE_ID) return;

  const role = await guild.roles.fetch(REWARD_ROLE_ID).catch(() => null);
  if (!role) {
    console.warn(`Le rôle ${REWARD_ROLE_ID} est introuvable.`);
    return;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return;

  const topScore = sorted[0][1];
  const topUserIds = new Set(
    sorted.filter(([, xp]) => xp === topScore).map(([id]) => id)
  );

  await guild.members.fetch();

  for (const member of role.members.values()) {
    if (!topUserIds.has(member.id)) {
      await member.roles.remove(role).catch((error) => {
        console.error(`Impossible de retirer le rôle à ${member.user.tag} :`, error);
      });
    }
  }

  for (const id of topUserIds) {
    const member = guild.members.cache.get(id);
    if (member && !member.roles.cache.has(role.id)) {
      const roleAdded = await member.roles
        .add(role)
        .then(() => true)
        .catch((error) => {
          console.error(`Impossible d'ajouter le rôle à ${member.user.tag} :`, error);
          return false;
        });

      if (roleAdded) {
        await guild.channels.cache
          .get(QUIZ_CHANNEL_ID)
          ?.send(
            `🧠 ${member} prend la tête du classement et devient **Cerveau du serveur** !`
          );
      }
    }
  }
}

async function awardXP(message, wonQuestion) {
  const userId = message.author.id;
  scores[userId] = (scores[userId] || 0) + wonQuestion.xpValue;
  saveJSON(SCORES_FILE, scores);

  await message.reply(
    `🎉 Bonne réponse, ${message.author}! Tu gagnes ${wonQuestion.xpValue} XP (total : ${scores[userId]} XP).`
  );

  await updateBrainRole(message.guild);
}

// --- Écoute des messages du salon quiz ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== QUIZ_CHANNEL_ID) return;

  await questionStateReady;
  console.log(`Message reçu dans le salon quiz de ${message.author.tag}.`);

  const command = message.content.trim().toLowerCase();

  if (command === '!enigme') {
    // Vérifie d'abord qu'une question ouverte n'a pas été perdue lors d'un
    // changement de conteneur Railway.
    await ensureCurrentQuestion();
    if (currentQuestion) {
      await message.reply("Une question est déjà en cours, réponds à celle-ci d'abord !");
      return;
    }
    await postEnigme(message.channel);
    return;
  }

  if (command === '!classement') {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      await message.reply('Pas encore de scores enregistrés.');
      return;
    }

    const lines = await Promise.all(
      sorted.slice(0, 10).map(async ([id, xp], index) => {
        const user = await client.users.fetch(id).catch(() => null);
        return `${index + 1}. ${user ? user.username : id} — ${xp} XP`;
      })
    );

    await message.reply(`🏅 **Classement**\n${lines.join('\n')}`);
    return;
  }

  // Dernier filet de sécurité : récupère la question depuis Discord juste
  // avant de décider que le message doit être ignoré.
  if (!currentQuestion) {
    const recovered = await ensureCurrentQuestion();
    if (recovered) {
      console.log('Question récupérée juste avant la vérification de la réponse.');
    }
  }

  if (!currentQuestion) {
    console.log('Message ignoré : aucune question en cours.');
    return;
  }

  const userAnswer = normalize(message.content);
  const isCorrect = currentQuestion.answers
    .map(normalize)
    .some((answer) => answer === userAnswer);

  if (!isCorrect) {
    console.log('Réponse lue, mais incorrecte.');
    return;
  }

  // La question est fermée avant le premier await : deux bonnes réponses
  // envoyées presque simultanément ne peuvent donc pas gagner toutes les deux.
  const wonQuestion = currentQuestion;
  clearCurrentQuestion();

  try {
    await awardXP(message, wonQuestion);
    console.log(`Bonne réponse détectée pour ${message.author.tag}.`);
  } catch (error) {
    console.error("Erreur pendant l'attribution des XP :", error);
  }
});

// --- Démarrage et planification ---
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Connecté en tant que ${readyClient.user.tag}`);

  try {
    await restoreQuestionFromDiscord();
  } catch (error) {
    console.error('Impossible de restaurer la question en cours :', error);
  } finally {
    markQuestionStateReady();
  }

  console.log(`Questions automatiques programmées à : ${DAILY_TIMES.join('h, ')}h`);
  console.log('Commande à la demande activée : !enigme');
  console.log(`Données sauvegardées dans : ${DATA_DIR}`);

  DAILY_TIMES.forEach((hour) => {
    cron.schedule(
      `0 ${hour} * * *`,
      () => {
        postDailyQuestion().catch((error) => {
          console.error('Impossible de publier la question automatique :', error);
        });
      },
      { timezone: 'Europe/Paris' }
    );
  });
});

client.on(Events.Error, (error) => {
  console.error('Erreur Discord :', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée :', error);
});

function shutdown(signal) {
  console.log(`${signal} reçu : arrêt propre du bot.`);
  client.destroy();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN);
