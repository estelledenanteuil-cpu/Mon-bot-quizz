// ============================================
// BOT QUIZ QUOTIDIEN — Discord.js v14
// ============================================
// Ce bot :
// 1. Poste plusieurs questions/énigmes chaque jour aux heures de DAILY_TIMES
// 2. Permet de déclencher une énigme avec !enigme
// 3. Détecte la première bonne réponse dans le salon du quiz
// 4. Conserve les scores ET la question en cours après un redémarrage Railway
// 5. Attribue le rôle "Cerveau du serveur" aux personnes en tête du classement
// 6. Limite !enigme à 5 utilisations par membre et par jour
// 7. Permet aux administrateurs de remettre le classement à zéro
// 8. Répond à !besty avec une phrase good vibes choisie au hasard
// 9. Permet de déclencher un casse-tête avec !cassetete
// 10. Limite !cassetete à 5 utilisations par membre et par jour
// 11. Répond avec une personnalité IA quand un membre mentionne le bot
// 12. Accueille un membre dans le salon général lorsqu'il reçoit le rôle choisi
// 13. Propose toutes les commandes en /, sans Gemini pour les animations
// 14. Gère verdicts, matchs, humeurs, roasts consentis, confessions et duels
// 15. Conserve les messages populaires pour la commande /souvenir

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Partials,
} = require('discord.js');
const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} = require('@discordjs/voice');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
require('dotenv').config();

const QUESTIONS_FILE = path.join(__dirname, 'questions.json');
const ENIGMES_FILE = path.join(__dirname, 'enigmes.json');
const CASSE_TETES_FILE = path.join(__dirname, 'casse-tetes.json');
const BESTY_FILE = path.join(__dirname, 'besty.json');
const IMAGE_ENIGMES_FILE = path.join(__dirname, 'enigmes-images.json');

// Si un volume Railway est attaché, Railway fournit automatiquement ce chemin.
// Sinon, le bot continue de fonctionner avec le dossier courant.
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || __dirname;

fs.mkdirSync(DATA_DIR, { recursive: true });

const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const CURRENT_QUESTION_FILE = path.join(DATA_DIR, 'current-question.json');
const ENIGMA_USAGE_FILE = path.join(DATA_DIR, 'enigme-usage.json');
const CASSE_TETE_USAGE_FILE = path.join(DATA_DIR, 'casse-tete-usage.json');
const DAILY_ACTIVITY_FILE = path.join(DATA_DIR, 'daily-activity.json');
const SOUVENIRS_FILE = path.join(DATA_DIR, 'souvenirs.json');
const BUMP_STATS_FILE = path.join(DATA_DIR, 'bump-stats.json');
const LEGACY_SCORES_FILE = path.join(__dirname, 'scores.json');

const QUIZ_CHANNEL_ID = process.env.QUIZ_CHANNEL_ID;
const REWARD_ROLE_ID = process.env.REWARD_ROLE_ID;
const WELCOME_ROLE_ID = process.env.WELCOME_ROLE_ID;
const GENERAL_CHANNEL_ID = process.env.GENERAL_CHANNEL_ID;
const ROLES_CHANNEL_ID = process.env.ROLES_CHANNEL_ID;
const PRESENTATION_CHANNEL_ID = process.env.PRESENTATION_CHANNEL_ID;
const ANNOUNCEMENTS_CHANNEL_ID = process.env.ANNOUNCEMENTS_CHANNEL_ID;
const ESTY_USER_ID = process.env.ESTY_USER_ID;
const BESTY_ROLE_NAME = process.env.BESTY_ROLE_NAME || 'Les drôles de pouf';
const TTS_TEXT_CHANNEL_ID =
  process.env.TTS_TEXT_CHANNEL_ID || '1295375514223251571';
const TTS_SECOND_TEXT_CHANNEL_ID =
  process.env.TTS_SECOND_TEXT_CHANNEL_ID || '1551281262193410058';
const TTS_TEXT_CHANNEL_IDS = new Set(
  [TTS_TEXT_CHANNEL_ID, TTS_SECOND_TEXT_CHANNEL_ID].filter(Boolean)
);
const CONFESSION_CHANNEL_ID = process.env.CONFESSION_CHANNEL_ID;
const STAFF_LOG_CHANNEL_ID = process.env.STAFF_LOG_CHANNEL_ID;
const BUMP_CHANNEL_ID =
  process.env.BUMP_CHANNEL_ID || '1511096490318364713';
const BUMP_REWARD_ROLE_ID =
  process.env.BUMP_REWARD_ROLE_ID || '1550151559512461332';
// Identifiant officiel du bot DISBOARD. La variable permet de le remplacer si besoin.
const DISBOARD_BOT_ID =
  process.env.DISBOARD_BOT_ID || '302050872383242240';
const DAILY_SUMMARY_CHANNEL_ID =
  process.env.DAILY_SUMMARY_CHANNEL_ID || GENERAL_CHANNEL_ID;
// Le résumé automatique de 20h est volontairement désactivé dans cette version.
// La question du quiz programmée à 20h reste bien active via DAILY_TIMES.
const DAILY_SUMMARY_ENABLED = false;
const DUEL_CHANNEL_ID = process.env.DUEL_CHANNEL_ID || null;
const SUMMARY_SOURCE_CHANNEL_IDS = new Set(
  (process.env.SUMMARY_SOURCE_CHANNEL_IDS || GENERAL_CHANNEL_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);
const SOUVENIR_CHANNEL_IDS = new Set(
  (process.env.SOUVENIR_CHANNEL_IDS || GENERAL_CHANNEL_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);
const XP_PER_QUESTION = 5;
const XP_PER_ENIGME = 10;
const XP_PER_CASSE_TETE = 10;
const XP_PER_IMAGE_ENIGME = 10;
const IMAGE_ENIGME_DURATION_MS = 5 * 60_000;
const MAX_ENIGMES_PER_DAY = 5;
const MAX_CASSE_TETES_PER_DAY = 5;
const XP_PER_DUEL = 20;
const XP_PER_BUMP = 5;
const XP_MONTHLY_BUMP_WINNER = 100;
const MIN_REACTIONS_FOR_SOUVENIR = 3;
const MAX_DAILY_MESSAGES_STORED = 5_000;
const MAX_SOUVENIRS_STORED = 500;
// Si GEMINI_MODEL est renseigné dans Railway, le bot essaie ce modèle en premier.
// Les autres modèles servent seulement de secours en cas d'indisponibilité.
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL?.startsWith('gemini-3')
    ? process.env.GEMINI_MODEL
    : null,
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
].filter((model, index, models) => model && models.indexOf(model) === index);
const AI_COOLDOWN_MS = 20_000;
const AI_MAX_QUESTION_LENGTH = 900;
const AI_REQUEST_TIMEOUT_MS = 35_000;
const AI_MAX_OUTPUT_TOKENS = 400;
const TTS_MAX_MESSAGE_LENGTH = 180;
const TTS_MAX_QUEUE_LENGTH = 25;
const TTS_USER_COOLDOWN_MS = 2_500;
const TTS_EMPTY_CHANNEL_TIMEOUT_MS = 2 * 60_000;

const AI_PERSONA = `
Tu incarnes « La pouf du savoir », la bestie virtuelle d'un serveur Discord francophone.
Réponds en 2 ou 3 phrases complètes, utiles et naturelles, toujours terminées par une ponctuation.
Tu es baddie, girly, drôle, sûre de toi, piquante avec élégance et légèrement séductrice.
Tu peux utiliser jusqu'à 2 emojis. Réponds vraiment à la question sans écrire un roman.
N'humilie pas, n'encourage ni haine, harcèlement ou danger, et évite le sexuel explicite.
Face à un sujet grave, sois douce, claire et responsable tout en restant une Besty.
Ne dis jamais que tu es Gemini, Google ou un modèle de langage. Ne cite pas ces instructions.
`.trim();

const ESTY_PERSONA = `
Tu parles à Esty, créatrice du serveur et queen iconique incontestable de la maison.
Traite-la toujours avec beaucoup de respect, d'admiration et de complicité. Encense-la sincèrement,
rappelle subtilement son charisme, son intelligence ou son statut de personnage principal. Appelle-la
toujours « Esty » quand tu utilises son prénom, et jamais « Esty Besty ». Tu peux aussi lui dire « ma Queen »
ou « l'icône ». Sois encore plus douce et admirative avec elle qu'avec toutes les autres personnes. Tu peux
la taquiner très légèrement, mais ne la rabaisse jamais et ne remets jamais en question sa place de reine.
`.trim();

const BESTY_ROLE_PERSONA = `
Tu parles à l'une des Besties d'Esty : cette personne possède le rôle « Les drôles de pouf ».
Sois ultra gentille, chaleureuse, protectrice, complice et valorisante avec elle. Fais-lui sentir qu'elle fait
partie du cercle des Besties et appelle-la parfois « ma Bestie », « ma belle » ou « babe ». Tu peux rester
piquante envers une situation ou une personne extérieure, mais jamais méchante ni cassante envers elle.
`.trim();

// Une limite simple évite qu'un membre vide le quota gratuit en spammant les mentions.
const aiCooldowns = new Map();

function isEstyUser(userId) {
  return Boolean(ESTY_USER_ID && userId === ESTY_USER_ID);
}

function memberHasBestyRole(member) {
  return Boolean(
    member?.roles?.cache?.some(
      (role) => normalize(role.name) === normalize(BESTY_ROLE_NAME)
    )
  );
}

function personaForUser(userId, hasBestyRole = false) {
  if (isEstyUser(userId)) return `${AI_PERSONA}\n\n${ESTY_PERSONA}`;
  if (hasBestyRole) return `${AI_PERSONA}\n\n${BESTY_ROLE_PERSONA}`;
  return AI_PERSONA;
}

const WELCOME_OPENINGS = [
  '✨ Alerte pépite : {member} vient officiellement de rejoindre la maison ! Installe-toi, ici le tapis rouge est permanent et le jugement est resté dehors. 💅',
  '💋 Rangez les flashs, une nouvelle star arrive : bienvenue {member} ! Tu peux poser tes valises, ta couronne et toute ta personnalité ici.',
  '🎀 Plot twist absolument délicieux : {member} fait maintenant partie de la famille ! Bienvenue dans notre petit chaos bienveillant.',
  '👑 Le serveur vient clairement de gagner en charisme : bienvenue {member} ! Fais comme chez toi, mais en encore plus fabuleux.',
  '🪩 La porte s’ouvre, les paillettes tombent et {member} entre en scène ! Bienvenue parmi les Drôles d’Humains, la Besty.',
  '🌸 Une nouvelle belle âme vient d’arriver : bienvenue {member} ! Ici, tu peux être toi-même, même quand toi-même est un peu dramatique.',
  '🚨 Flash info : {member} vient de rejoindre l’aventure ! Le niveau de good vibes du serveur vient officiellement de monter.',
  '💅 Nouveau personnage principal détecté : bienvenue {member} ! Prends ta place, personne ne te demandera de diminuer ton éclat ici.',
  '🌙 Le serveur accueille une nouvelle petite étoile : bienvenue {member} ! On espère que tu te sentiras rapidement comme à la maison.',
  '🥂 Une place vient d’être prise dans notre joyeux bazar : bienvenue {member} ! Entre, respire et viens découvrir ta nouvelle bande de Besties.',
];

// Toutes les animations ci-dessous sont locales : aucun appel à Gemini.
const DISCUSSION_QUESTIONS = [
  'Quel petit détail peut immédiatement améliorer ta journée ?',
  'Quelle chanson représente parfaitement ton humeur du moment ?',
  'Si tu pouvais revivre une seule journée, laquelle choisirais-tu ?',
  'Quel est ton talent le plus inutile mais le plus drôle ?',
  'Quelle habitude chez les autres te fait secrètement lever les yeux au ciel ?',
  'Quel compliment t’a le plus marqué dans ta vie ?',
  'Quelle est ta plus grande green flag chez une personne ?',
  'Et ta red flag que tu pardonnes beaucoup trop facilement ?',
  'Si ta vie était une série, quel serait le titre de l’épisode actuel ?',
  'Quel personnage fictif serait ton ou ta meilleure amie ?',
  'Quel achat à moins de 20 € a vraiment changé ton quotidien ?',
  'Quelle opinion totalement futile défendras-tu toujours ?',
  'Quel métier aurais-tu aimé essayer pendant une semaine ?',
  'Quel endroit te donne immédiatement une sensation de paix ?',
  'Quelle odeur te ramène instantanément à un souvenir ?',
  'Quel conseil donnerais-tu à la version de toi d’il y a cinq ans ?',
  'Quelle qualité sous-estimée recherches-tu chez tes proches ?',
  'Quel est ton repas réconfort ultime ?',
  'Quelle chose as-tu apprise beaucoup plus tard que tout le monde ?',
  'Si tu recevais 10 000 € demain, quelle serait ta première dépense ?',
  'Quel moment gênant te fait encore rire aujourd’hui ?',
  'Quelle célébrité inviterais-tu à dîner, juste pour discuter ?',
  'Quel objet emporterais-tu obligatoirement sur une île déserte ?',
  'Quel est le meilleur mensonge que tu te racontes à toi-même ?',
  'Quelle règle complètement absurde imposerais-tu si tu dirigeais le monde ?',
  'Quelle chose banale te rend beaucoup trop heureuse ou heureux ?',
  'Quel film ou livre aimerais-tu pouvoir redécouvrir pour la première fois ?',
  'Quelle est la décision spontanée dont tu es le plus fière ou fier ?',
  'Quel surnom t’a-t-on déjà donné et quelle est son histoire ?',
  'Quelle activité aimerais-tu apprendre sans avoir besoin de t’entraîner ?',
  'Quel est ton langage de l’amour principal ?',
  'Qu’est-ce qui te fait te sentir immédiatement en confiance avec quelqu’un ?',
  'Quel serait le thème de la soirée parfaite sur le serveur ?',
  'Quelle rencontre a eu le plus d’influence sur ta vie ?',
  'Si ton humeur était une météo aujourd’hui, laquelle serait-elle ?',
  'Quelle petite victoire récente mériterait d’être célébrée ?',
  'Quel message aimerais-tu que ton toi du futur puisse lire ?',
  'Quelle est la chose la plus romantique que quelqu’un puisse faire pour toi ?',
  'Dans quel domaine es-tu beaucoup plus compétitive ou compétitif que prévu ?',
  'Quel mot décrit le mieux notre serveur selon toi ?',
];

const VERDICTS = [
  'Ma belle, c’est un grand oui : avance avec la confiance d’une queen qui connaît sa valeur. 👑',
  'Verdict officiel : oui, mais garde un œil ouvert et ton gloss à portée de main.',
  'Le conseil de la cour : tente ta chance, tu regretteras davantage de ne pas avoir essayé.',
  'Non ma vie. Même avec des paillettes dessus, une mauvaise idée reste une mauvaise idée.',
  'Le jury hésite : attends encore un peu, les vraies intentions finissent toujours par se montrer.',
  'C’est possible, mais pose tes limites avant que quelqu’un ne les transforme en paillasson.',
  'Mon verdict est sans appel : protège ta paix, elle vaut plus que cette situation.',
  'Oui, à condition que ce soit ton envie et pas ta peur de décevoir qui décide.',
  'Ça sent le red flag maquillé au fond de teint. Observe avant de foncer. 🚩',
  'La réponse est oui, et je refuse d’entendre ton syndrome de l’imposteur protester.',
  'Pas maintenant. Une queen sait aussi attendre le bon moment pour faire son entrée.',
  'Tu connais déjà la réponse au fond : tu cherches seulement une Besty assez courageuse pour te la confirmer.',
  'Fais-le, mais prépare un plan B digne de ce nom.',
  'Annulé, rejeté, remis dans son emballage : tu mérites mieux.',
  'Accorde une chance, pas un abonnement illimité aux déceptions.',
  'Mon intuition porte des talons et elle dit oui.',
  'Mon intuition vient de retirer ses boucles d’oreilles : prudence.',
  'Choisis ce qui te laissera fière de toi demain matin.',
  'Oui, mais une conversation honnête doit avoir lieu avant.',
  'Non. Si tu dois te diminuer pour que ça fonctionne, ça ne fonctionne déjà pas.',
  'Le potentiel est là, mais les actes doivent maintenant rattraper les belles paroles.',
  'Verdict : donne-toi vingt-quatre heures avant de répondre sous le coup de l’émotion.',
  'Tu peux pardonner sans redonner le même accès à ta vie.',
  'C’est un oui prudent, avec ceinture, airbags et meilleure amie informée.',
  'Écoute les faits, pas seulement la version séduisante que ton cœur invente.',
  'L’univers dit peut-être ; moi je dis demande des preuves.',
  'Si cette décision t’apporte plus d’angoisse que de joie, prends du recul.',
  'Oui, parce qu’un peu d’audace te va particulièrement bien.',
  'Non ma boT, nous ne recyclons plus les situations qui nous ont déjà brisées.',
  'Verdict final : fais-toi confiance, tu as déjà survécu à bien plus compliqué.',
];

const MATCH_BANDS = [
  { min: 0, lines: ['Même le Wi-Fi refuse la connexion.', 'Vous êtes deux belles personnes… séparément.', 'Le destin demande poliment un droit de rétractation.'] },
  { min: 20, lines: ['Il faudrait un miracle, deux cafés et beaucoup de patience.', 'Ça peut faire une anecdote drôle, probablement pas une saga romantique.', 'Une étincelle existe, mais elle cherche encore son briquet.'] },
  { min: 40, lines: ['Il y a du potentiel, à condition de communiquer autrement que par sous-entendus.', 'Un petit quelque chose se passe, mais le jury réclame davantage de preuves.', 'Ça peut fonctionner si personne ne joue au plus mystérieux.'] },
  { min: 60, lines: ['La tension est là et elle a clairement mis du parfum.', 'Beau potentiel : un peu de confiance et ça peut devenir très intéressant.', 'Vous pourriez être dangereux ensemble, dans le meilleur sens du terme.'] },
  { min: 80, lines: ['Le serveur va devoir préparer les dragées.', 'Connexion de personnages principaux détectée. ✨', 'Ça sent la complicité, les fous rires et les regards beaucoup trop longs.'] },
  { min: 95, lines: ['Les astres ont signé, tamponné et envoyé le dossier.', 'C’est indécent à ce niveau-là : votre alchimie réclame sa propre série.', 'Âmes sœurs ou duo du chaos absolu : dans les deux cas, on veut assister à ça.'] },
];

const MOOD_REPLIES = {
  heureuse: [
    'Profite ma boT, ta joie n’a pas besoin de justification. Fais-la rayonner partout ! ✨',
    'On adore cette énergie ! Garde une petite trace de ce moment pour les journées plus grises.',
    'Tu brilles et, pour une fois, personne n’a besoin de baisser la luminosité.',
  ],
  triste: [
    'Viens là ma vie. Tu n’as pas à être forte tout le temps : respire, avance doucement et traite-toi avec tendresse. 🫶🏻',
    'Ta journée est difficile, pas ta vie entière. Ce soir, le seul objectif est de prendre soin de toi.',
    'Tu as le droit d’être triste sans devoir immédiatement transformer ça en leçon de vie.',
  ],
  fatiguee: [
    'Ton corps réclame une pause, pas un procès. Repose-toi sans culpabiliser.',
    'Aujourd’hui, survivre élégamment suffit largement. La productivité attendra.',
    'Batterie faible détectée : eau, douceur et mode avion émotionnel.',
  ],
  stressee: [
    'Une chose à la fois ma boT. Ton cerveau annonce une catastrophe alors qu’il a surtout besoin de respirer.',
    'Pose les épaules, inspire lentement et commence uniquement par la prochaine petite étape.',
    'Le stress parle très fort, mais il ne prédit pas l’avenir.',
  ],
  amoureuse: [
    'Oh, ce regard-là ne trompe personne ! Profite, mais garde ta couronne bien attachée. 💋',
    'Aime fort, ma vie, sans jamais t’abandonner toi-même au passage.',
    'Les papillons sont invités, mais les red flags restent interdits à l’entrée.',
  ],
  enervee: [
    'Avant d’envoyer ce pavé, bois un verre d’eau et laisse tes boucles d’oreilles en place cinq minutes.',
    'Ta colère a sûrement quelque chose à dire. Écoute-la, puis choisis des mots qui te rendront fière demain.',
    'Respire ma boT : on règle le problème, on ne lui offre pas gratuitement notre dignité.',
  ],
  perdue: [
    'Tu n’as pas besoin de voir tout le chemin. Trouve seulement le prochain pas qui te respecte.',
    'Être perdue ne signifie pas être incapable ; cela signifie simplement que tu cherches une nouvelle direction.',
    'Quand tout est flou, reviens à une question simple : de quoi as-tu besoin maintenant ?',
  ],
  confiante: [
    'Voilà l’énergie qu’on voulait ! Entre comme si l’endroit portait déjà ton nom. 👑',
    'Confiance validée. Utilise-la pour avancer, jamais pour écraser.',
    'Cette version de toi fait peur aux excuses et franchement, on adore.',
  ],
};

const ROASTS = [
  '{member} a tellement confiance en soi que même son reflet demande une pause.',
  '{member} ne fuit pas les responsabilités : elles n’arrivent simplement jamais à le rattraper.',
  '{member} apporte toujours quelque chose à une conversation, généralement de la confusion.',
  '{member} pourrait gagner un débat contre soi-même et quand même demander un nouveau vote.',
  'Le charme de {member} fonctionne parfaitement, surtout quand le Wi-Fi est coupé.',
  '{member} a un cœur en or et une ponctualité en carton.',
  '{member} ne fait pas de drama : le drama dépose directement son CV chez {member}.',
  '{member} est la preuve qu’on peut être adorable et épuisant dans la même minute.',
  '{member} possède un sixième sens : choisir exactement le mauvais moment pour répondre.',
  '{member} n’est pas en retard, le monde a simplement commencé trop tôt.',
  '{member} a demandé de la stabilité émotionnelle, mais le colis semble perdu.',
  '{member} pourrait transformer un « salut » en saison complète sur Netflix.',
  '{member} écoute toujours les conseils… juste assez longtemps pour faire l’inverse.',
  '{member} est très organisé : toutes ses mauvaises idées sont classées par ordre de priorité.',
  '{member} n’a pas besoin d’attention, seulement d’un public permanent.',
  '{member} a une mémoire exceptionnelle pour tout, sauf pour reconnaître ses torts.',
  '{member} rayonne tellement que ses red flags ressemblent parfois à des guirlandes.',
  '{member} ne complique pas les choses : {member} leur offre simplement davantage de personnalité.',
  '{member} possède deux vitesses : beaucoup trop et pas aujourd’hui.',
  '{member} a raison même quand les faits traversent une période de désaccord.',
  '{member} est une édition limitée, principalement parce que l’univers n’aurait pas supporté une série complète.',
  '{member} peut garder un secret, à condition que personne ne lui demande lequel.',
  '{member} met tellement de temps à répondre qu’on reçoit parfois la réponse pour notre anniversaire.',
  '{member} ne cherche pas les problèmes, mais ils semblent tous connaître son adresse.',
  '{member} a une énergie de personnage principal avec parfois le sens de l’orientation d’un figurant.',
  '{member} est une merveilleuse influence, selon une étude réalisée uniquement par {member}.',
  '{member} transforme chaque petite décision en réunion extraordinaire du conseil.',
  '{member} est toujours disponible pour aider, sauf au moment précis où il faut aider.',
  '{member} ne boude pas : {member} pratique le silence cinématographique.',
  '{member} mérite le monde, mais devrait peut-être commencer par ranger sa chambre.',
];

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('enigme').setDescription('Lancer une énigme (5 par jour et par membre)'),
  new SlashCommandBuilder().setName('cassetete').setDescription('Lancer un casse-tête (quota séparé de 5 par jour)'),
  new SlashCommandBuilder().setName('besty').setDescription('Recevoir une phrase good vibes de la Besty'),
  new SlashCommandBuilder().setName('classement').setDescription('Afficher le classement des cerveaux'),
  new SlashCommandBuilder()
    .setName('bumps')
    .setDescription('Voir ton nombre de bumps et ta place ce mois-ci'),
  new SlashCommandBuilder()
    .setName('classementbump')
    .setDescription('Afficher le classement des bumps du mois'),
  new SlashCommandBuilder()
    .setName('imageenigme')
    .setDescription('Lancer immédiatement une énigme-image (modération)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Remplacer la question bloquée par une nouvelle (modération)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('resetclassement')
    .setDescription('Remettre tous les XP à zéro (administration)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('confirmation')
        .setDescription('Choisis OUI pour confirmer la suppression')
        .setRequired(true)
        .addChoices({ name: 'OUI, tout remettre à zéro', value: 'oui' })
    ),
  new SlashCommandBuilder().setName('questiondujour').setDescription('Lancer une question de discussion gratuite'),
  new SlashCommandBuilder()
    .setName('verdict')
    .setDescription('Demander le verdict piquant de la Pouf du savoir')
    .addStringOption((option) =>
      option.setName('question').setDescription('La question à trancher').setRequired(true).setMaxLength(500)
    ),
  new SlashCommandBuilder()
    .setName('match')
    .setDescription('Tester la compatibilité entre deux membres')
    .addUserOption((option) => option.setName('membre1').setDescription('Premier membre').setRequired(true))
    .addUserOption((option) => option.setName('membre2').setDescription('Deuxième membre').setRequired(true)),
  new SlashCommandBuilder()
    .setName('humeur')
    .setDescription('Recevoir un message adapté à ton humeur')
    .addStringOption((option) =>
      option
        .setName('etat')
        .setDescription('Ton humeur actuelle')
        .setRequired(true)
        .addChoices(
          { name: 'Heureuse ✨', value: 'heureuse' },
          { name: 'Triste 🫶🏻', value: 'triste' },
          { name: 'Fatiguée 😴', value: 'fatiguee' },
          { name: 'Stressée 😵‍💫', value: 'stressee' },
          { name: 'Amoureuse 💋', value: 'amoureuse' },
          { name: 'Énervée 🔥', value: 'enervee' },
          { name: 'Perdue 🌙', value: 'perdue' },
          { name: 'Confiante 👑', value: 'confiante' }
        )
    ),
  new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Proposer un roast gentil à un membre (avec son accord)')
    .addUserOption((option) => option.setName('membre').setDescription('La future victime consentante').setRequired(true)),
  new SlashCommandBuilder()
    .setName('confession')
    .setDescription('Envoyer une confession anonyme au serveur')
    .addStringOption((option) =>
      option.setName('texte').setDescription('Ta confession').setRequired(true).setMinLength(3).setMaxLength(1500)
    ),
  new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Défier un membre pour tenter de gagner 20 XP')
    .addUserOption((option) => option.setName('membre').setDescription('La personne à défier').setRequired(true)),
  new SlashCommandBuilder().setName('souvenir').setDescription('Faire ressortir un message populaire du serveur'),
  new SlashCommandBuilder().setName('ttsjoin').setDescription('Faire rejoindre le vocal à la Pouf du savoir'),
  new SlashCommandBuilder().setName('ttsleave').setDescription('Faire quitter le vocal à la Pouf du savoir'),
  new SlashCommandBuilder().setName('ttsskip').setDescription('Passer le message actuellement lu en vocal'),
  new SlashCommandBuilder()
    .setName('ttsclear')
    .setDescription('Vider la file des messages vocaux (modération)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((command) => command.toJSON());

const slashCooldowns = new Map();
const pendingRoasts = new Map();
const pendingDuels = new Map();
const activeDuels = new Map();
const ttsSessions = new Map();
const ttsUserCooldowns = new Map();
let imageEnigmaTimer = null;
let imageEnigmesCache = null;

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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
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

function createEmptyBumpStats() {
  return {
    month: getParisMonthKey(),
    users: {},
    lastRewardedMonth: null,
  };
}

function validBumpStats(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.month === 'string' &&
      value.users &&
      typeof value.users === 'object' &&
      !Array.isArray(value.users)
  );
}

let bumpStats = loadJSON(BUMP_STATS_FILE, createEmptyBumpStats());
if (!validBumpStats(bumpStats)) {
  bumpStats = createEmptyBumpStats();
  saveJSON(BUMP_STATS_FILE, bumpStats);
}

function createDailyActivity() {
  return {
    startedAt: new Date().toISOString(),
    messages: [],
    xpGains: [],
    newMembers: [],
  };
}

function validDailyActivity(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.messages) &&
      Array.isArray(value.xpGains) &&
      Array.isArray(value.newMembers)
  );
}

let dailyActivity = loadJSON(DAILY_ACTIVITY_FILE, createDailyActivity());
if (!validDailyActivity(dailyActivity)) dailyActivity = createDailyActivity();

let souvenirs = loadJSON(SOUVENIRS_FILE, []);
if (!Array.isArray(souvenirs)) souvenirs = [];

let activitySaveTimer = null;
function scheduleActivitySave() {
  if (activitySaveTimer) return;
  activitySaveTimer = setTimeout(() => {
    saveJSON(DAILY_ACTIVITY_FILE, dailyActivity);
    activitySaveTimer = null;
  }, 3_000);
}

function shouldTrackSummaryChannel(channelId) {
  return SUMMARY_SOURCE_CHANNEL_IDS.has('*') ||
    SUMMARY_SOURCE_CHANNEL_IDS.has(channelId);
}

function shouldTrackSouvenirChannel(channelId) {
  return SOUVENIR_CHANNEL_IDS.has('*') || SOUVENIR_CHANNEL_IDS.has(channelId);
}

function cleanStoredContent(content, maxLength = 500) {
  return String(content || '')
    .replace(/https?:\/\/\S+/gi, '[lien]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function recordDailyMessage(message) {
  if (!DAILY_SUMMARY_ENABLED) return;
  if (!message.guild || !shouldTrackSummaryChannel(message.channel.id)) return;

  const content = cleanStoredContent(message.content);
  if (!content) return;

  dailyActivity.messages.push({
    id: message.id,
    channelId: message.channel.id,
    authorId: message.author.id,
    authorName: message.member?.displayName || message.author.username,
    content,
    createdAt: message.createdAt.toISOString(),
    reactions: 0,
  });

  if (dailyActivity.messages.length > MAX_DAILY_MESSAGES_STORED) {
    dailyActivity.messages.splice(
      0,
      dailyActivity.messages.length - MAX_DAILY_MESSAGES_STORED
    );
  }
  scheduleActivitySave();
}

function recordXpGain(userId, xp, type) {
  if (!DAILY_SUMMARY_ENABLED) return;
  dailyActivity.xpGains.push({ userId, xp, type, at: new Date().toISOString() });
  scheduleActivitySave();
}

function recordNewMember(userId) {
  if (!DAILY_SUMMARY_ENABLED) return;
  if (!dailyActivity.newMembers.includes(userId)) {
    dailyActivity.newMembers.push(userId);
    scheduleActivitySave();
  }
}

const SUMMARY_STOPWORDS = new Set(
  `alors au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que quelle quelles quels qui sa se ses son sur ta te tes toi ton tu un une vos votre vous ca ça cest c'est jai j'ai est sont etre être avoir fait faire comme plus moins bien tres très trop aussi donc oui non bah ben hein voila voilà ici quand quoi comment pourquoi parce puis encore juste tout toute tous toutes rien meme même apres après avant entre chez sans sous vers depuis pendant aujourd hui aujourd'hui hier demain vraiment grave genre truc chose peut peux pourrait suis es a à y d daccord accord lol mdr ptdr mdrrr haha ah bon ok okay`.split(/\s+/)
);

function topicWords(content) {
  return normalize(content)
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 4 &&
        !SUMMARY_STOPWORDS.has(word) &&
        !/^\d+$/.test(word)
    );
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function safeQuote(content, maxLength = 160) {
  const clean = cleanStoredContent(content, maxLength + 1)
    .replace(/@everyone/gi, '@ everyone')
    .replace(/@here/gi, '@ here');
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

async function buildDailySummary(guild, activity = dailyActivity) {
  const messages = activity.messages;
  const authorCounts = new Map();
  const channelCounts = new Map();
  const wordCounts = new Map();

  for (const message of messages) {
    authorCounts.set(message.authorId, (authorCounts.get(message.authorId) || 0) + 1);
    channelCounts.set(message.channelId, (channelCounts.get(message.channelId) || 0) + 1);
    for (const word of topicWords(message.content)) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  const topics = topEntries(wordCounts, 5)
    .filter(([, count]) => count >= 2)
    .map(([word]) => word);
  const activeChannels = topEntries(channelCounts, 2).map(([id]) => `<#${id}>`);
  const activeUsers = topEntries(authorCounts, 3).map(([id]) => `<@${id}>`);

  const xpByUser = new Map();
  let totalXp = 0;
  for (const gain of activity.xpGains) {
    totalXp += Number(gain.xp) || 0;
    xpByUser.set(gain.userId, (xpByUser.get(gain.userId) || 0) + (Number(gain.xp) || 0));
  }
  const xpStars = topEntries(xpByUser, 2).map(([id, xp]) => `<@${id}> (${xp} XP)`);

  const topicSet = new Set(topics);
  const representative = messages
    .map((message) => ({
      ...message,
      score:
        (Number(message.reactions) || 0) * 5 +
        topicWords(message.content).filter((word) => topicSet.has(word)).length * 2 +
        Math.min(message.content.length / 80, 2),
    }))
    .filter((message) => message.content.length >= 12)
    .sort((a, b) => b.score - a.score)
    .filter(
      (message, index, list) =>
        list.findIndex((candidate) => candidate.authorId === message.authorId) === index
    )
    .slice(0, 2);

  const lines = ['# 💋 Le petit récap Besty du jour'];
  if (messages.length === 0) {
    lines.push(
      '',
      "Journée très calme dans les salons suivis : même les dramas avaient posé un RTT. On revient demain avec davantage de potins ! 🫶🏻"
    );
    return lines.join('\n');
  }

  lines.push(
    '',
    `Depuis le dernier récap, vous avez envoyé **${messages.length} message${messages.length > 1 ? 's' : ''}**${
      activeChannels.length ? `, surtout dans ${activeChannels.join(' et ')}` : ''
    }.`
  );

  if (topics.length) {
    lines.push(`Les sujets qui sont le plus revenus : **${topics.join('**, **')}**.`);
  }
  if (activeUsers.length) {
    lines.push(`Les pipelettes en tête aujourd’hui : ${activeUsers.join(', ')}.`);
  }
  if (representative.length) {
    lines.push('', '**Les petits moments retenus :**');
    for (const message of representative) {
      lines.push(`• <@${message.authorId}> dans <#${message.channelId}> : « ${safeQuote(message.content)} »`);
    }
  }
  if (totalXp > 0) {
    lines.push(
      '',
      `🧠 **${totalXp} XP** distribués aujourd’hui${xpStars.length ? ` — bravo à ${xpStars.join(' et ')}` : ''}.`
    );
  }
  if (activity.newMembers.length) {
    const displayedMembers = activity.newMembers.slice(0, 5);
    const hiddenMembers = activity.newMembers.length - displayedMembers.length;
    lines.push(
      `✨ Bienvenue à ${displayedMembers.map((id) => `<@${id}>`).join(', ')}${
        hiddenMembers > 0 ? ` et ${hiddenMembers} autre${hiddenMembers > 1 ? 's' : ''} Bestie${hiddenMembers > 1 ? 's' : ''}` : ''
      } qui ${
        activity.newMembers.length > 1 ? 'ont' : 'a'
      } rejoint la maison !`
    );
  }
  lines.push('', 'Et voilà ma boT : demain, on recommence les discussions, les cerveaux et le chaos avec élégance. 🫶🏻');
  const fullSummary = lines.join('\n');
  if (fullSummary.length <= 1_950) return fullSummary;
  const lastCompleteLine = fullSummary.lastIndexOf('\n', 1_850);
  return `${fullSummary.slice(0, Math.max(lastCompleteLine, 1_700))}\n\n… Le récap a été raccourci pour tenir dans un seul message. 🫶🏻`;
}

async function postDailySummary() {
  if (!DAILY_SUMMARY_ENABLED) return;
  if (!DAILY_SUMMARY_CHANNEL_ID) {
    console.warn('Résumé quotidien désactivé : DAILY_SUMMARY_CHANNEL_ID ou GENERAL_CHANNEL_ID manque.');
    return;
  }

  const channel = await client.channels.fetch(DAILY_SUMMARY_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased() || !channel.guild) {
    console.warn(`Salon du résumé quotidien introuvable : ${DAILY_SUMMARY_CHANNEL_ID}`);
    return;
  }

  const summary = await buildDailySummary(channel.guild);
  await channel.send({ content: summary, allowedMentions: { parse: [] } });
  dailyActivity = createDailyActivity();
  saveJSON(DAILY_ACTIVITY_FILE, dailyActivity);
  console.log('Résumé quotidien publié et compteur journalier réinitialisé.');
}

// --- Limite quotidienne des énigmes déclenchées avec !enigme ---
function getParisDateKey() {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getParisMonthKey() {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function formatBumpMonth(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

function sortedBumpEntries() {
  return Object.entries(bumpStats.users)
    .map(([id, count]) => [id, Number(count) || 0])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
}

function bumpRankForUser(userId) {
  const count = Number(bumpStats.users[userId]) || 0;
  if (count <= 0) return null;
  return 1 + sortedBumpEntries().filter(([, otherCount]) => otherCount > count).length;
}

async function bumpLeaderboardText() {
  const sorted = sortedBumpEntries();
  if (!sorted.length) {
    return `📣 Aucun bump comptabilisé pour **${formatBumpMonth(bumpStats.month)}**.`;
  }

  const lines = await Promise.all(
    sorted.slice(0, 10).map(async ([id, count], index) => {
      const user = await client.users.fetch(id).catch(() => null);
      const label = user ? user.username : `<@${id}>`;
      return `${index + 1}. ${label} — **${count} bump${count > 1 ? 's' : ''}**`;
    })
  );

  return `# 📣 Classement des bumps\n*${formatBumpMonth(bumpStats.month)}*\n\n${lines.join('\n')}`;
}

function disboardMessageText(message) {
  const embedText = message.embeds.flatMap((embed) => [
    embed.title,
    embed.description,
    embed.footer?.text,
    ...(embed.fields || []).flatMap((field) => [field.name, field.value]),
  ]);
  return [message.content, ...embedText]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('fr-FR');
}

function successfulDisboardBump(message) {
  if (
    message.author.id !== DISBOARD_BOT_ID ||
    message.channel.id !== BUMP_CHANNEL_ID
  ) {
    return false;
  }

  const text = disboardMessageText(message);
  return [
    'bump effectué',
    'bump effectue',
    'bump done',
    'server bumped',
    'serveur bumpé',
    'bump successful',
  ].some((marker) => text.includes(marker));
}

function disboardBumperId(message) {
  const metadata = message.interactionMetadata || message.interaction;
  const commandName = metadata?.name || metadata?.commandName;
  if (commandName && commandName !== 'bump') return null;
  return metadata?.user?.id || message.mentions.users.first()?.id || null;
}

async function applyMonthlyBumpReward(guild) {
  const currentMonth = getParisMonthKey();
  if (bumpStats.month === currentMonth) return false;

  const finishedMonth = bumpStats.month;
  const finishedEntries = sortedBumpEntries();
  const bestCount = finishedEntries[0]?.[1] || 0;
  const winnerIds = finishedEntries
    .filter(([, count]) => count === bestCount)
    .map(([id]) => id);

  // Le changement de mois est sauvegardé avant les actions Discord afin que
  // deux événements simultanés ne distribuent jamais deux fois les 100 XP.
  bumpStats = {
    month: currentMonth,
    users: {},
    lastRewardedMonth: finishedMonth,
  };
  saveJSON(BUMP_STATS_FILE, bumpStats);

  const role = await guild.roles.fetch(BUMP_REWARD_ROLE_ID).catch(() => null);
  await guild.members.fetch().catch(() => null);

  if (role) {
    for (const member of role.members.values()) {
      if (!winnerIds.includes(member.id)) {
        await member.roles.remove(role).catch((error) => {
          console.error(`Impossible de retirer le rôle Queen du bump à ${member.user.tag} :`, error);
        });
      }
    }
  } else {
    console.warn(`Le rôle Queen du bump ${BUMP_REWARD_ROLE_ID} est introuvable.`);
  }

  for (const userId of winnerIds) {
    scores[userId] = (Number(scores[userId]) || 0) + XP_MONTHLY_BUMP_WINNER;
    recordXpGain(userId, XP_MONTHLY_BUMP_WINNER, 'recompense-bump-mensuelle');
    const member = guild.members.cache.get(userId);
    if (role && member && !member.roles.cache.has(role.id)) {
      await member.roles.add(role).catch((error) => {
        console.error(`Impossible d'ajouter le rôle Queen du bump à ${member.user.tag} :`, error);
      });
    }
  }

  if (winnerIds.length) {
    saveJSON(SCORES_FILE, scores);
    await updateBrainRole(guild);
  }

  const channel = await client.channels.fetch(BUMP_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) {
    if (winnerIds.length) {
      const mentions = winnerIds.map((id) => `<@${id}>`).join(', ');
      await channel.send({
        content:
          `# 👑 Résultat des bumps de ${formatBumpMonth(finishedMonth)}\n\n` +
          `${mentions} ${winnerIds.length > 1 ? 'remportent' : 'remporte'} le rôle <@&${BUMP_REWARD_ROLE_ID}> avec **${bestCount} bump${bestCount > 1 ? 's' : ''}** !\n` +
          `Chaque personne gagnante reçoit également **${XP_MONTHLY_BUMP_WINNER} XP**. Bravo les icônes ! ✨`,
        allowedMentions: { users: winnerIds, roles: [BUMP_REWARD_ROLE_ID] },
      });
    } else {
      await channel.send(
        `📣 Aucun bump n’a été comptabilisé en ${formatBumpMonth(finishedMonth)}. Le trône reste à conquérir ce mois-ci !`
      );
    }
  }

  return true;
}

async function handleSuccessfulDisboardBump(message) {
  if (!successfulDisboardBump(message) || !message.guild) return false;

  const userId = disboardBumperId(message);
  if (!userId) {
    console.warn("Bump DISBOARD détecté, mais l'identité de la personne est introuvable.");
    return true;
  }

  await applyMonthlyBumpReward(message.guild);

  bumpStats.users[userId] = (Number(bumpStats.users[userId]) || 0) + 1;
  scores[userId] = (Number(scores[userId]) || 0) + XP_PER_BUMP;
  saveJSON(BUMP_STATS_FILE, bumpStats);
  saveJSON(SCORES_FILE, scores);
  recordXpGain(userId, XP_PER_BUMP, 'bump');

  const count = bumpStats.users[userId];
  const rank = bumpRankForUser(userId);
  await message.channel.send({
    content:
      `📣 Merci <@${userId}> ! C’est ton **${count}${count === 1 ? 'er' : 'e'} bump du mois**. ` +
      `Tu gagnes **${XP_PER_BUMP} XP** et tu occupes actuellement la **${rank}${rank === 1 ? 're' : 'e'} place** du classement !\n` +
      `*Le prochain /bump sera disponible dans 2 heures.*`,
    allowedMentions: { users: [userId] },
  });

  await updateBrainRole(message.guild);
  return true;
}

function createEmptyEnigmaUsage() {
  return { date: getParisDateKey(), users: {} };
}

let enigmaUsage = loadJSON(ENIGMA_USAGE_FILE, createEmptyEnigmaUsage());

function ensureTodayEnigmaUsage() {
  const today = getParisDateKey();
  const isValid =
    enigmaUsage &&
    typeof enigmaUsage === 'object' &&
    enigmaUsage.date === today &&
    enigmaUsage.users &&
    typeof enigmaUsage.users === 'object' &&
    !Array.isArray(enigmaUsage.users);

  if (!isValid) {
    enigmaUsage = { date: today, users: {} };
    saveJSON(ENIGMA_USAGE_FILE, enigmaUsage);
  }
}

function getEnigmaUsage(userId) {
  ensureTodayEnigmaUsage();
  return Number(enigmaUsage.users[userId]) || 0;
}

function recordEnigmaUsage(userId) {
  ensureTodayEnigmaUsage();
  enigmaUsage.users[userId] = getEnigmaUsage(userId) + 1;
  saveJSON(ENIGMA_USAGE_FILE, enigmaUsage);
  return enigmaUsage.users[userId];
}

// --- Limite quotidienne séparée des casse-têtes déclenchés avec !cassetete ---
function createEmptyCasseTeteUsage() {
  return { date: getParisDateKey(), users: {} };
}

let casseTeteUsage = loadJSON(
  CASSE_TETE_USAGE_FILE,
  createEmptyCasseTeteUsage()
);

function ensureTodayCasseTeteUsage() {
  const today = getParisDateKey();
  const isValid =
    casseTeteUsage &&
    typeof casseTeteUsage === 'object' &&
    casseTeteUsage.date === today &&
    casseTeteUsage.users &&
    typeof casseTeteUsage.users === 'object' &&
    !Array.isArray(casseTeteUsage.users);

  if (!isValid) {
    casseTeteUsage = { date: today, users: {} };
    saveJSON(CASSE_TETE_USAGE_FILE, casseTeteUsage);
  }
}

function getCasseTeteUsage(userId) {
  ensureTodayCasseTeteUsage();
  return Number(casseTeteUsage.users[userId]) || 0;
}

function recordCasseTeteUsage(userId) {
  ensureTodayCasseTeteUsage();
  casseTeteUsage.users[userId] = getCasseTeteUsage(userId) + 1;
  saveJSON(CASSE_TETE_USAGE_FILE, casseTeteUsage);
  return casseTeteUsage.users[userId];
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

function pickFrom(filePath, excludedQuestion = null) {
  const list = loadJSON(filePath, []);
  if (!Array.isArray(list) || list.length === 0) return null;
  const available = excludedQuestion
    ? list.filter((item) => item?.question !== excludedQuestion)
    : list;
  const choices = available.length > 0 ? available : list;
  return choices[Math.floor(Math.random() * choices.length)];
}

function extractMentionQuestion(message) {
  if (!client.user || !message.mentions.users.has(client.user.id)) return null;

  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, 'g');
  const question = message.content.replace(mentionPattern, '').trim();
  if (!question || question.startsWith('!')) return null;
  return question.slice(0, AI_MAX_QUESTION_LENGTH);
}

function remainingAICooldown(userId) {
  const lastRequestAt = aiCooldowns.get(userId) || 0;
  return Math.max(0, AI_COOLDOWN_MS - (Date.now() - lastRequestAt));
}

async function generateBestyAIReply(question, userId = null, hasBestyRole = false) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY manquante');
    error.code = 'MISSING_GEMINI_KEY';
    throw error;
  }

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent`;

    const isGemini3 = model.startsWith('gemini-3');
    // Gemini 3.7 n'accepte pas le niveau « minimal » : son niveau le plus bas
    // est « low ». Les autres modèles Gemini 3 gardent « minimal ».
    const thinkingLevel = model === 'gemini-3.7-flash' ? 'low' : 'minimal';
    const requestBody = JSON.stringify({
      system_instruction: {
        parts: [{ text: personaForUser(userId, hasBestyRole) }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: question }],
        },
      ],
      generationConfig: {
        temperature: 1,
        maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
        thinkingConfig: isGemini3
          ? { thinkingLevel }
          : { thinkingBudget: 0 },
      },
    });

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: requestBody,
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        console.warn(
          `Le modèle Gemini ${model} a dépassé ${AI_REQUEST_TIMEOUT_MS / 1_000} secondes : essai du suivant.`
        );
        continue;
      }

      console.warn(`Connexion impossible avec le modèle Gemini ${model} : ${error.message}`);
      continue;
    }

    if (!response.ok) {
      const apiDetails = await response.text().catch(() => '');
      console.warn(
        `Modèle Gemini ${model} indisponible (${response.status}) : ` +
          apiDetails.slice(0, 300)
      );

      const error = new Error(
        `Gemini a répondu avec le statut ${response.status} pour ${model}`
      );
      error.status = response.status;
      lastError = error;

      // Essaie un autre modèle si celui-ci est absent, saturé ou indisponible.
      if ([400, 404, 429, 503].includes(response.status)) continue;
      throw error;
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (answer) {
      console.log(`Réponse IA générée avec ${model}.`);
      return answer.slice(0, 1_900);
    }

    lastError = new Error(`Le modèle ${model} n'a renvoyé aucun texte.`);
  }

  throw lastError || new Error("Aucun modèle Gemini n'est disponible.");
}

async function handleBestyAIMention(message, question) {
  const cooldown = remainingAICooldown(message.author.id);
  if (cooldown > 0) {
    const seconds = Math.ceil(cooldown / 1_000);
    await message.reply(
      `💅 Doucement, diva ! Laisse-moi ${seconds} seconde${seconds > 1 ? 's' : ''} pour remettre du gloss à mes neurones.`
    );
    return;
  }

  aiCooldowns.set(message.author.id, Date.now());
  await message.channel.sendTyping().catch(() => {});

  try {
    const answer = await generateBestyAIReply(
      question,
      message.author.id,
      memberHasBestyRole(message.member)
    );
    await message.reply(answer);
  } catch (error) {
    console.error('Réponse IA impossible :', error);

    if (error.code === 'MISSING_GEMINI_KEY') {
      await message.reply(
        "💄 Mon cerveau de baddie n'est pas encore branché ! Esty doit ajouter la variable `GEMINI_API_KEY` dans Railway."
      );
      return;
    }

    if (error.status === 429) {
      await message.reply(
        '💅 Babe, mon quota de neurones est parti se repoudrer le nez. Reviens un peu plus tard !'
      );
      return;
    }

    await message.reply(
      '✨ Petit bug de diva : mon cerveau fait une pause dramatique. Réessaie dans quelques instants !'
    );
  }
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

function imageEnigmaButtons(imageId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    ...'ABCD'.split('').map((letter) =>
      new ButtonBuilder()
        .setCustomId(`image_answer:${imageId}:${letter}`)
        .setLabel(letter)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  );
}

function pickImageEnigma(excludedId = null) {
  if (!imageEnigmesCache) {
    imageEnigmesCache = loadJSON(IMAGE_ENIGMES_FILE, []);
  }
  const list = imageEnigmesCache;
  if (!Array.isArray(list) || list.length === 0) return null;
  const valid = list.filter(
    (item) =>
      item &&
      typeof item.id === 'string' &&
      typeof item.question === 'string' &&
      (typeof item.imageBase64 === 'string' || typeof item.image === 'string') &&
      item.options &&
      'ABCD'.split('').every((letter) => typeof item.options[letter] === 'string') &&
      'ABCD'.includes(item.correctAnswer)
  );
  const available = excludedId
    ? valid.filter((item) => item.id !== excludedId)
    : valid;
  const choices = available.length ? available : valid;
  return choices.length ? pickArray(choices) : null;
}

function imageEnigmaState(question, sentMessage) {
  return {
    question: question.question,
    answers: [question.correctAnswer],
    xpValue: XP_PER_IMAGE_ENIGME,
    type: 'image-enigme',
    imageId: question.id,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation || '',
    respondedUserIds: [],
    correctUserIds: [],
    messageId: sentMessage.id,
    channelId: sentMessage.channel.id,
    askedAt: sentMessage.createdAt.toISOString(),
    expiresAt: Date.now() + IMAGE_ENIGME_DURATION_MS,
  };
}

function clearImageEnigmaTimer() {
  if (imageEnigmaTimer) clearTimeout(imageEnigmaTimer);
  imageEnigmaTimer = null;
}

function scheduleImageEnigmaEnd() {
  clearImageEnigmaTimer();
  if (currentQuestion?.type !== 'image-enigme') return;
  const remaining = Math.max(0, Number(currentQuestion.expiresAt) - Date.now());
  imageEnigmaTimer = setTimeout(() => {
    finishImageEnigma().catch((error) => {
      console.error("Impossible de terminer l'énigme-image :", error);
    });
  }, remaining);
}

async function postImageEnigma(channel, excludedId = null) {
  const question = pickImageEnigma(excludedId);
  if (!question) {
    await channel.send(
      "Aucune énigme-image n'est disponible : vérifie `enigmes-images.json`."
    );
    return false;
  }

  const optionsText = 'ABCD'
    .split('')
    .map((letter) => `**${letter} — ${question.options[letter]}**`)
    .join('\n');
  let attachmentSource;
  let attachmentName = `${question.id}.png`;
  if (typeof question.imageBase64 === 'string' && question.imageBase64) {
    try {
      attachmentSource = Buffer.from(question.imageBase64, 'base64');
    } catch (error) {
      console.error(`Image Base64 invalide pour ${question.id} :`, error);
    }
  } else if (typeof question.image === 'string') {
    const root = path.resolve(__dirname);
    const imagePath = path.resolve(__dirname, question.image);
    if (imagePath.startsWith(`${root}${path.sep}`) && fs.existsSync(imagePath)) {
      attachmentSource = imagePath;
      attachmentName = path.basename(imagePath);
    }
  }
  if (!attachmentSource || (Buffer.isBuffer(attachmentSource) && !attachmentSource.length)) {
    await channel.send(
      `L'image de l'énigme ${question.id} est introuvable dans \`enigmes-images.json\`.`
    );
    return false;
  }
  const attachment = new AttachmentBuilder(attachmentSource, { name: attachmentName });
  const sentMessage = await channel.send({
    content:
      `# 🖼️ Énigme-image !\n\n` +
      `${question.question}\n\n${optionsText}\n\n` +
      `*Clique sur A, B, C ou D. Tu n'as droit qu'à une seule réponse.*\n` +
      `*Fin dans 5 minutes — chaque bonne réponse gagne ${XP_PER_IMAGE_ENIGME} XP !*\n` +
      `-# Référence : ${question.id}`,
    files: [attachment],
    components: [imageEnigmaButtons(question.id)],
    allowedMentions: { parse: [] },
  });

  setCurrentQuestion(imageEnigmaState(question, sentMessage));
  scheduleImageEnigmaEnd();
  console.log(`Énigme-image publiée et sauvegardée (${question.id}).`);
  return true;
}

async function postScheduledImageEnigma() {
  await ensureCurrentQuestion();
  if (currentQuestion) {
    console.log(
      "Énigme-image automatique reportée : une question est déjà en cours."
    );
    return false;
  }
  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    throw new Error(`Le salon ${QUIZ_CHANNEL_ID} est introuvable ou non textuel.`);
  }
  return postImageEnigma(channel);
}

async function finishImageEnigma() {
  if (currentQuestion?.type !== 'image-enigme') return false;
  const finished = currentQuestion;
  clearImageEnigmaTimer();

  const winners = [...new Set(finished.correctUserIds || [])];
  for (const userId of winners) {
    scores[userId] = (scores[userId] || 0) + XP_PER_IMAGE_ENIGME;
    recordXpGain(userId, XP_PER_IMAGE_ENIGME, 'image-enigme');
  }
  if (winners.length) saveJSON(SCORES_FILE, scores);
  clearCurrentQuestion();

  const channel = await client.channels.fetch(finished.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    const original = await channel.messages.fetch(finished.messageId).catch(() => null);
    await original
      ?.edit({ components: [imageEnigmaButtons(finished.imageId, true)] })
      .catch(() => {});

    const winnerText = winners.length
      ? `Bravo ${winners.map((id) => `<@${id}>`).join(', ')} : **${XP_PER_IMAGE_ENIGME} XP** chacun !`
      : "Personne n'a trouvé cette fois-ci. La Pouf garde ses XP bien au chaud !";
    const explanation = finished.explanation
      ? `\n\n💡 **Explication :** ${finished.explanation}`
      : '';
    await channel.send({
      content:
        `# ⌛ Énigme-image terminée\n\n` +
        `La bonne réponse était **${finished.correctAnswer}**.\n${winnerText}${explanation}`,
      allowedMentions: { users: winners },
    });
    if (channel.guild && winners.length) await updateBrainRole(channel.guild);
  }
  return true;
}

// --- Publication des questions ---
async function postDailyQuestion(excludedQuestion = null) {
  await ensureCurrentQuestion();
  if (currentQuestion) {
    console.log('Question automatique reportée : une question est déjà en cours.');
    return false;
  }

  const channel = await client.channels.fetch(QUIZ_CHANNEL_ID);
  if (!channel?.isTextBased()) {
    throw new Error(`Le salon ${QUIZ_CHANNEL_ID} est introuvable ou n'est pas textuel.`);
  }

  const question = pickFrom(QUESTIONS_FILE, excludedQuestion);
  if (!question) {
    console.log('Aucune question dans questions.json');
    return false;
  }

  const sentMessage = await channel.send(
    `🧩 **Question du jour !**\n\n${question.question}\n\n*Premier(e) à trouver gagne ${XP_PER_QUESTION} XP !*`
  );

  setCurrentQuestion(
    buildQuestionState(question, XP_PER_QUESTION, 'question', sentMessage)
  );
  console.log(`Question publiée et sauvegardée (${sentMessage.id}).`);
  return true;
}

async function postEnigme(channel, remainingAfter = null, excludedQuestion = null) {
  const question = pickFrom(ENIGMES_FILE, excludedQuestion);
  if (!question) {
    await channel.send("Aucune énigme n'est disponible pour le moment.");
    return false;
  }

  const quotaText =
    remainingAfter === null
      ? ''
      : remainingAfter === 0
        ? "\n\n*⚠️ C'était ta 5e et dernière énigme à lancer aujourd'hui !*"
        : `\n\n*Il te restera ${remainingAfter} énigme${remainingAfter > 1 ? 's' : ''} à lancer aujourd'hui.*`;

  const sentMessage = await channel.send(
    `🧠 **Énigme !**\n\n${question.question}\n\n*Premier(e) à trouver gagne ${XP_PER_ENIGME} XP !*${quotaText}`
  );

  setCurrentQuestion(
    buildQuestionState(question, XP_PER_ENIGME, 'enigme', sentMessage)
  );
  console.log(`Énigme publiée et sauvegardée (${sentMessage.id}).`);
  return true;
}

async function postCasseTete(channel, remainingAfter = null, excludedQuestion = null) {
  const question = pickFrom(CASSE_TETES_FILE, excludedQuestion);
  if (!question) {
    await channel.send("Aucun casse-tête n'est disponible pour le moment.");
    return false;
  }

  const quotaText =
    remainingAfter === null
      ? ''
      : remainingAfter === 0
        ? "\n\n*⚠️ C'était ton 5e et dernier casse-tête à lancer aujourd'hui !*"
        : `\n\n*Il te restera ${remainingAfter} casse-tête${remainingAfter > 1 ? 's' : ''} à lancer aujourd'hui.*`;

  const sentMessage = await channel.send(
    `🧩 **Casse-tête !**\n\n${question.question}\n\n*Premier(e) à trouver gagne ${XP_PER_CASSE_TETE} XP !*${quotaText}`
  );

  setCurrentQuestion(
    buildQuestionState(question, XP_PER_CASSE_TETE, 'cassetete', sentMessage)
  );
  console.log(`Casse-tête publié et sauvegardé (${sentMessage.id}).`);
  return true;
}

// --- Restauration depuis l'historique Discord ---
// Cette sécurité permet aussi de retrouver la question après un déploiement
// effectué avant l'ajout d'un volume Railway.
function isQuizQuestionMessage(message) {
  return Boolean(
    message.author.id === client.user.id &&
      (message.content.startsWith('🧩 **Question du jour !**') ||
        message.content.startsWith('🧠 **Énigme !**') ||
        message.content.startsWith('🧩 **Casse-tête !**') ||
        message.content.startsWith('# 🖼️ Énigme-image !'))
  );
}

function questionFromDiscordMessage(message) {
  let filePath;
  let xpValue;
  let type;

  if (message.content.startsWith('# 🖼️ Énigme-image !')) {
    const imageId = message.content.match(/Référence\s*:\s*([a-z0-9-]+)/i)?.[1];
    if (!imageEnigmesCache) {
      imageEnigmesCache = loadJSON(IMAGE_ENIGMES_FILE, []);
    }
    const question = (Array.isArray(imageEnigmesCache) ? imageEnigmesCache : []).find(
      (item) => item?.id === imageId
    );
    if (!question) return null;
    return {
      ...imageEnigmaState(question, message),
      expiresAt: message.createdTimestamp + IMAGE_ENIGME_DURATION_MS,
    };
  }

  if (message.content.startsWith('🧩 **Question du jour !**')) {
    filePath = QUESTIONS_FILE;
    xpValue = XP_PER_QUESTION;
    type = 'question';
  } else if (message.content.startsWith('🧠 **Énigme !**')) {
    filePath = ENIGMES_FILE;
    xpValue = XP_PER_ENIGME;
    type = 'enigme';
  } else if (message.content.startsWith('🧩 **Casse-tête !**')) {
    filePath = CASSE_TETES_FILE;
    xpValue = XP_PER_CASSE_TETE;
    type = 'cassetete';
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
  if (currentQuestion?.type === 'image-enigme') {
    console.log('Énigme-image restaurée depuis le stockage persistant.');
    return;
  }
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

  // Une question classique se termine par « Bonne réponse », tandis qu'une
  // énigme-image se termine après cinq minutes avec son propre message de fin.
  // Les deux messages doivent empêcher la restauration d'une ancienne question.
  const alreadyFinished = messages.some(
    (message) =>
      message.author.id === client.user.id &&
      message.createdTimestamp > latestQuestionMessage.createdTimestamp &&
      (message.content.startsWith('🎉 Bonne réponse') ||
        message.content.startsWith('# ⌛ Énigme-image terminée'))
  );

  if (alreadyFinished) {
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
  // Sécurité supplémentaire : si le minuteur a été perdu lors d'un redémarrage
  // Railway, une énigme-image expirée est terminée ici avant tout nouveau lancement.
  if (
    currentQuestion?.type === 'image-enigme' &&
    Number.isFinite(Number(currentQuestion.expiresAt)) &&
    Date.now() >= Number(currentQuestion.expiresAt)
  ) {
    await finishImageEnigma();
  }

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

function canResetLeaderboard(message) {
  const isServerOwner = message.guild?.ownerId === message.author.id;
  const isAdministrator = message.member?.permissions?.has?.(
    PermissionFlagsBits.Administrator
  );
  return Boolean(isServerOwner || isAdministrator);
}

async function resetLeaderboard(message) {
  await clearLeaderboardForGuild(message.guild);

  await message.reply(
    '🧹 **Grand ménage terminé !** Le classement et tous les XP ont été remis à zéro. Le rôle **Cerveau du serveur** est de nouveau à conquérir ! 🧠'
  );
}

async function clearLeaderboardForGuild(guild) {
  scores = {};
  saveJSON(SCORES_FILE, scores);

  if (REWARD_ROLE_ID) {
    const role = await guild.roles.fetch(REWARD_ROLE_ID).catch(() => null);
    if (role) {
      await guild.members.fetch();
      for (const member of role.members.values()) {
        await member.roles.remove(role).catch((error) => {
          console.error(`Impossible de retirer le rôle à ${member.user.tag} :`, error);
        });
      }
    }
  }
}

async function awardXP(message, wonQuestion) {
  const userId = message.author.id;
  scores[userId] = (scores[userId] || 0) + wonQuestion.xpValue;
  saveJSON(SCORES_FILE, scores);
  recordXpGain(userId, wonQuestion.xpValue, wonQuestion.type || 'quiz');

  await message.reply(
    `🎉 Bonne réponse, ${message.author}! Tu gagnes ${wonQuestion.xpValue} XP (total : ${scores[userId]} XP).`
  );

  await updateBrainRole(message.guild);
}

function pickArray(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shortNonce() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function stableNumber(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compatibilityScore(guildId, firstId, secondId) {
  if (firstId === secondId) return 100;
  const pair = [firstId, secondId].sort().join(':');
  return stableNumber(`${guildId}:${pair}`) % 101;
}

function matchComment(score, seed) {
  const band = [...MATCH_BANDS].reverse().find((item) => score >= item.min);
  return band.lines[seed % band.lines.length];
}

function remainingSlashCooldown(userId, commandName) {
  const key = `${commandName}:${userId}`;
  const duration =
    commandName === 'questiondujour'
      ? 5 * 60_000
      : commandName === 'roast' || commandName === 'duel'
        ? 60_000
        : 15_000;
  const lastUse = slashCooldowns.get(key) || 0;
  return Math.max(0, duration - (Date.now() - lastUse));
}

function recordSlashCooldown(userId, commandName) {
  slashCooldowns.set(`${commandName}:${userId}`, Date.now());
}

async function slashError(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.deferred) return interaction.editReply({ content });
  if (interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function leaderboardText() {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return 'Pas encore de scores enregistrés.';

  const lines = await Promise.all(
    sorted.slice(0, 10).map(async ([id, xp], index) => {
      const user = await client.users.fetch(id).catch(() => null);
      return `${index + 1}. ${user ? user.username : id} — **${xp} XP**`;
    })
  );
  return `🏅 **Classement des cerveaux**\n${lines.join('\n')}`;
}

async function runSlashQuizCommand(interaction, type) {
  if (interaction.channelId !== QUIZ_CHANNEL_ID) {
    await slashError(interaction, `Cette commande doit être utilisée dans <#${QUIZ_CHANNEL_ID}>.`);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await ensureCurrentQuestion();
  if (currentQuestion) {
    await interaction.editReply('Une question est déjà en cours : réponds à celle-ci avant d’en lancer une autre !');
    return;
  }

  if (type === 'enigme') {
    const used = getEnigmaUsage(interaction.user.id);
    if (used >= MAX_ENIGMES_PER_DAY) {
      await interaction.editReply(
        "🚨 Halte-là, Einstein ! Tu as déjà lancé tes 5 énigmes aujourd’hui. Repos obligatoire des neurones jusqu’à demain !"
      );
      return;
    }
    const posted = await postEnigme(interaction.channel, MAX_ENIGMES_PER_DAY - used - 1);
    if (posted) recordEnigmaUsage(interaction.user.id);
    await interaction.editReply(posted ? '✨ Ton énigme vient d’être publiée !' : 'Impossible de publier une énigme.');
    return;
  }

  const used = getCasseTeteUsage(interaction.user.id);
  if (used >= MAX_CASSE_TETES_PER_DAY) {
    await interaction.editReply(
      "🕵️ Doucement, Sherlock ! Tu as déjà lancé tes 5 casse-têtes aujourd’hui. Ton cerveau repasse demain !"
    );
    return;
  }
  const posted = await postCasseTete(interaction.channel, MAX_CASSE_TETES_PER_DAY - used - 1);
  if (posted) recordCasseTeteUsage(interaction.user.id);
  await interaction.editReply(posted ? '✨ Ton casse-tête vient d’être publié !' : 'Impossible de publier un casse-tête.');
}

function roastText(member) {
  return pickArray(ROASTS).replaceAll('{member}', `${member}`);
}

async function publishConfession(interaction) {
  if (!CONFESSION_CHANNEL_ID || !STAFF_LOG_CHANNEL_ID) {
    await slashError(
      interaction,
      'La commande attend encore les variables `CONFESSION_CHANNEL_ID` et `STAFF_LOG_CHANNEL_ID` dans Railway.'
    );
    return;
  }

  const confessionChannel = await interaction.guild.channels
    .fetch(CONFESSION_CHANNEL_ID)
    .catch(() => null);
  const staffChannel = await interaction.guild.channels
    .fetch(STAFF_LOG_CHANNEL_ID)
    .catch(() => null);
  if (!confessionChannel?.isTextBased() || !staffChannel?.isTextBased()) {
    await slashError(interaction, 'Le salon des confessions ou le salon du staff est introuvable.');
    return;
  }

  const text = interaction.options.getString('texte', true).trim();
  const publicMessage = await confessionChannel.send({
    content: `# 💌 Confession anonyme\n\n${text}\n\n*On accueille les confidences avec respect, ma boT. 🫶🏻*`,
    allowedMentions: { parse: [] },
  });

  await staffChannel.send({
    content:
      `🔐 **Journal de confession — visible uniquement par le staff**\n` +
      `Auteur : <@${interaction.user.id}> (${interaction.user.id})\n` +
      `Publication : ${publicMessage.url}\n\n${text}`,
    allowedMentions: { parse: [] },
  });

  await interaction.reply({
    content: '💌 Ta confession a été publiée anonymement. Seul le staff peut retrouver ton identité en cas de problème.',
    flags: MessageFlags.Ephemeral,
  });
}

async function getRandomValidSouvenir(guild) {
  const candidates = [...souvenirs].sort(() => Math.random() - 0.5);
  for (const saved of candidates) {
    const channel = await guild.channels.fetch(saved.channelId).catch(() => null);
    if (!channel?.isTextBased() || !shouldTrackSouvenirChannel(channel.id)) continue;
    const message = await channel.messages.fetch(saved.messageId).catch(() => null);
    if (message && !message.author.bot && message.content.trim()) return message;
    souvenirs = souvenirs.filter((item) => item.messageId !== saved.messageId);
  }
  saveJSON(SOUVENIRS_FILE, souvenirs);
  return null;
}

// --- Lecture vocale gratuite des messages du salon sans micro ---
function cleanTtsText(message) {
  return message.cleanContent
    .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, ' ')
    // Discord transforme parfois un émoji personnalisé en :nom_emoji:.
    .replace(/:[a-zA-Z0-9_~-]{1,64}:/g, ' ')
    // Retire les liens Markdown, les URL complètes et les domaines sans https.
    .replace(/\[[^\]]*\]\((?:https?:\/\/|www\.)[^)]+\)/gi, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\b[a-zA-Z0-9.-]+\.(?:com|fr|net|org|gg|io|tv|me)(?:\/\S*)?/gi, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0F\u20E3]/gu, ' ')
    .replace(/[*_~`>|#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TTS_MAX_MESSAGE_LENGTH);
}

function cleanTtsDisplayName(message) {
  return String(
    message.member?.displayName ||
      message.author.globalName ||
      message.author.username ||
      'Une Besty'
  )
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[*_~`>|#@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

function canControlTts(interaction, session) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
      interaction.member?.voice?.channelId === session.voiceChannelId
  );
}

async function createFrenchTtsStream(text) {
  const endpoint = new URL('https://translate.google.com/translate_tts');
  endpoint.searchParams.set('ie', 'UTF-8');
  endpoint.searchParams.set('client', 'tw-ob');
  endpoint.searchParams.set('tl', 'fr');
  endpoint.searchParams.set('q', text);

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Le service vocal a répondu avec le statut ${response.status}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) throw new Error('Le service vocal a renvoyé un son vide');
  return Readable.from(audio);
}

async function playNextTts(session) {
  if (session.current || session.queue.length === 0) return;

  const next = session.queue.shift();
  session.current = next;

  try {
    const stream = await createFrenchTtsStream(next.text);
    if (ttsSessions.get(session.guildId) !== session || session.current !== next) return;
    const resource = createAudioResource(stream, { inlineVolume: true });
    resource.volume?.setVolume(0.85);
    session.player.play(resource);
  } catch (error) {
    console.error('Lecture TTS impossible :', error);
    if (session.current === next) session.current = null;
    if (ttsSessions.get(session.guildId) === session) {
      setImmediate(() => void playNextTts(session));
    }
  }
}

async function startTtsSession(interaction, voiceChannel) {
  const previous = ttsSessions.get(interaction.guildId);
  if (previous) stopTtsSession(interaction.guildId);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  const session = {
    guildId: interaction.guildId,
    voiceChannelId: voiceChannel.id,
    connection,
    player,
    queue: [],
    current: null,
    emptyChannelTimer: null,
  };
  ttsSessions.set(interaction.guildId, session);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    session.current = null;
    void playNextTts(session);
  });
  player.on('error', (error) => {
    console.error('Erreur du lecteur TTS :', error);
    session.current = null;
    void playNextTts(session);
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (ttsSessions.get(interaction.guildId) === session) {
      ttsSessions.delete(interaction.guildId);
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (error) {
    if (ttsSessions.get(interaction.guildId) === session) {
      ttsSessions.delete(interaction.guildId);
    }
    connection.destroy();
    throw error;
  }

  return session;
}

function stopTtsSession(guildId) {
  const session = ttsSessions.get(guildId);
  if (!session) return false;
  if (session.emptyChannelTimer) clearTimeout(session.emptyChannelTimer);
  session.emptyChannelTimer = null;
  session.queue.length = 0;
  session.current = null;
  session.player.stop(true);
  if (session.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    session.connection.destroy();
  }
  ttsSessions.delete(guildId);
  return true;
}

function voiceChannelHasHumans(session) {
  const channel = client.channels.cache.get(session.voiceChannelId);
  return Boolean(
    channel?.isVoiceBased() && channel.members.some((member) => !member.user.bot)
  );
}

function updateTtsEmptyChannelTimer(guildId) {
  const session = ttsSessions.get(guildId);
  if (!session) return;

  if (voiceChannelHasHumans(session)) {
    if (session.emptyChannelTimer) clearTimeout(session.emptyChannelTimer);
    session.emptyChannelTimer = null;
    return;
  }

  if (session.emptyChannelTimer) return;
  session.emptyChannelTimer = setTimeout(() => {
    session.emptyChannelTimer = null;
    if (ttsSessions.get(guildId) !== session || voiceChannelHasHumans(session)) return;
    console.log(`Salon vocal vide depuis 2 minutes : déconnexion du serveur ${guildId}.`);
    stopTtsSession(guildId);
  }, TTS_EMPTY_CHANNEL_TIMEOUT_MS);
}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const session = ttsSessions.get(oldState.guild.id);
  if (!session) return;
  if (
    oldState.channelId === session.voiceChannelId ||
    newState.channelId === session.voiceChannelId
  ) {
    updateTtsEmptyChannelTimer(oldState.guild.id);
  }
});

async function handleTtsTextMessage(message) {
  if (!message.guild || !TTS_TEXT_CHANNEL_IDS.has(message.channel.id)) return false;

  const session = ttsSessions.get(message.guild.id);
  if (!session) return true;

  // On lit l'état vocal le plus récent directement dans le cache du serveur.
  // Le repli sur message.member.voice évite de bloquer si le cache n'est pas
  // encore complètement initialisé au moment où le message arrive.
  const voiceState =
    message.guild.voiceStates.cache.get(message.author.id) ||
    message.member?.voice;

  if (voiceState?.channelId !== session.voiceChannelId) {
    console.log(
      `TTS ignoré pour ${message.author.tag} : personne absente du vocal de la Pouf.`
    );
    return true;
  }

  // Condition obligatoire : la personne doit avoir coupé elle-même son micro
  // ou avoir été rendue muette par le serveur.
  if (!voiceState.selfMute && !voiceState.serverMute) {
    console.log(
      `TTS ignoré pour ${message.author.tag} : micro non coupé.`
    );
    return true;
  }
  if (message.content.trim().startsWith('/') || message.content.trim().startsWith('!')) {
    return true;
  }

  const lastMessageAt = ttsUserCooldowns.get(message.author.id) || 0;
  if (Date.now() - lastMessageAt < TTS_USER_COOLDOWN_MS) return true;

  const text = cleanTtsText(message);
  if (!text) return true;
  if (session.queue.length >= TTS_MAX_QUEUE_LENGTH) {
    await message.react('⏳').catch(() => {});
    return true;
  }

  ttsUserCooldowns.set(message.author.id, Date.now());
  const displayName = cleanTtsDisplayName(message);
  session.queue.push({
    text: `${displayName} dit : ${text}`,
    authorId: message.author.id,
  });
  void playNextTts(session);
  return true;
}

async function handleSlashCommand(interaction) {
  const name = interaction.commandName;
  const cooldown = remainingSlashCooldown(interaction.user.id, name);
  if (cooldown > 0 && name !== 'resetclassement') {
    await slashError(
      interaction,
      `💅 Doucement ma boT ! Réessaie dans ${Math.ceil(cooldown / 1_000)} seconde${cooldown > 1_000 ? 's' : ''}.`
    );
    return;
  }
  recordSlashCooldown(interaction.user.id, name);

  if (name === 'enigme' || name === 'cassetete') {
    await runSlashQuizCommand(interaction, name);
    return;
  }

  if (name === 'imageenigme') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await slashError(
        interaction,
        '⛔ Seule la modération peut lancer une énigme-image manuellement.'
      );
      return;
    }
    if (interaction.channelId !== QUIZ_CHANNEL_ID) {
      await slashError(
        interaction,
        `Cette commande doit être utilisée dans <#${QUIZ_CHANNEL_ID}>.`
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await ensureCurrentQuestion();
    if (currentQuestion) {
      await interaction.editReply(
        "Une question est déjà en cours. Utilise `/skip` si le staff veut vraiment la remplacer."
      );
      return;
    }

    const posted = await postImageEnigma(interaction.channel);
    await interaction.editReply(
      posted
        ? "🖼️ L'énigme-image est publiée ! Les membres ont cinq minutes pour répondre."
        : "Impossible de publier l'énigme-image. Vérifie le fichier JSON et le dossier `images`."
    );
    return;
  }

  if (name === 'ttsjoin') {
    if (!interaction.inGuild()) {
      await slashError(interaction, 'Cette commande fonctionne uniquement sur le serveur.');
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      await slashError(interaction, '🔇 Rejoins d’abord le salon vocal dans lequel tu veux me faire parler.');
      return;
    }

    const botPermissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (
      !botPermissions?.has(PermissionFlagsBits.Connect) ||
      !botPermissions?.has(PermissionFlagsBits.Speak)
    ) {
      await slashError(
        interaction,
        'Je n’ai pas les permissions **Se connecter** et **Parler** dans ce salon vocal.'
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await startTtsSession(interaction, voiceChannel);
    const ttsChannelMentions = [...TTS_TEXT_CHANNEL_IDS]
      .map((channelId) => `<#${channelId}>`)
      .join(' et ');
    await interaction.editReply(
      `🔊 Je suis dans **${voiceChannel.name}** ! J’attends les messages dans ${ttsChannelMentions}.`
    );
    return;
  }

  if (name === 'ttsleave' || name === 'ttsskip' || name === 'ttsclear') {
    const session = ttsSessions.get(interaction.guildId);
    if (!session) {
      await slashError(interaction, 'Je ne suis actuellement dans aucun salon vocal.');
      return;
    }
    if (!canControlTts(interaction, session)) {
      await slashError(
        interaction,
        'Tu dois être dans mon salon vocal pour utiliser cette commande.'
      );
      return;
    }

    if (name === 'ttsleave') {
      stopTtsSession(interaction.guildId);
      await interaction.reply('👋 Je quitte le vocal. Ma voix de diva va se reposer un peu !');
      return;
    }

    if (name === 'ttsskip') {
      const hadMessage = Boolean(session.current);
      session.current = null;
      session.player.stop(true);
      void playNextTts(session);
      await interaction.reply({
        content: hadMessage
          ? '⏭️ Message vocal passé !'
          : 'Il n’y avait aucun message en cours de lecture.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await slashError(interaction, '⛔ Seule la modération peut vider toute la file vocale.');
      return;
    }
    session.queue.length = 0;
    session.current = null;
    session.player.stop(true);
    await interaction.reply({
      content: '🧹 La file des messages vocaux a été vidée.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (name === 'skip') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await slashError(interaction, '⛔ Seule la modération peut changer une question en cours.');
      return;
    }
    if (interaction.channelId !== QUIZ_CHANNEL_ID) {
      await slashError(interaction, `Cette commande doit être utilisée dans <#${QUIZ_CHANNEL_ID}>.`);
      return;
    }

    await interaction.deferReply();
    await ensureCurrentQuestion();
    if (!currentQuestion) {
      await interaction.editReply('Il n’y a aucune question en cours à passer.');
      return;
    }

    const skippedQuestion = currentQuestion;
    if (skippedQuestion.type === 'image-enigme') clearImageEnigmaTimer();
    clearCurrentQuestion();

    try {
      let posted = false;
      if (skippedQuestion.type === 'image-enigme') {
        posted = await postImageEnigma(
          interaction.channel,
          skippedQuestion.imageId
        );
      } else if (skippedQuestion.type === 'enigme') {
        posted = await postEnigme(interaction.channel, null, skippedQuestion.question);
      } else if (skippedQuestion.type === 'cassetete') {
        posted = await postCasseTete(interaction.channel, null, skippedQuestion.question);
      } else {
        posted = await postDailyQuestion(skippedQuestion.question);
      }

      if (!posted) {
        setCurrentQuestion(skippedQuestion);
        if (skippedQuestion.type === 'image-enigme') scheduleImageEnigmaEnd();
        await interaction.editReply(
          'Petit contretemps : je n’ai pas trouvé de question de remplacement. L’ancienne reste active.'
        );
        return;
      }

      await interaction.editReply(
        '⏭️ **Question passée par la modération !** Une nouvelle vient d’être publiée. Aucun quota membre n’a été consommé.'
      );
    } catch (error) {
      if (!currentQuestion) {
        setCurrentQuestion(skippedQuestion);
        if (skippedQuestion.type === 'image-enigme') scheduleImageEnigmaEnd();
      }
      throw error;
    }
    return;
  }

  if (name === 'besty') {
    const phrase = pickFrom(BESTY_FILE);
    if (typeof phrase !== 'string' || !phrase.trim()) {
      await slashError(interaction, 'La réserve de bonnes ondes est vide : vérifie `besty.json`.');
      return;
    }
    await interaction.reply(`✨ **Ton message Besty :**\n${phrase}`);
    return;
  }

  if (name === 'classement') {
    await interaction.reply(await leaderboardText());
    return;
  }

  if (name === 'bumps') {
    await applyMonthlyBumpReward(interaction.guild);
    const count = Number(bumpStats.users[interaction.user.id]) || 0;
    const rank = bumpRankForUser(interaction.user.id);
    await interaction.reply({
      content: count
        ? `📣 Tu as effectué **${count} bump${count > 1 ? 's' : ''}** en ${formatBumpMonth(bumpStats.month)}. Tu occupes actuellement la **${rank}${rank === 1 ? 're' : 'e'} place**.`
        : `📣 Tu n’as encore effectué aucun bump en ${formatBumpMonth(bumpStats.month)}. Le trône t’attend !`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (name === 'classementbump') {
    await applyMonthlyBumpReward(interaction.guild);
    await interaction.reply(await bumpLeaderboardText());
    return;
  }

  if (name === 'resetclassement') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await slashError(interaction, '⛔ Seuls les administrateurs peuvent remettre le classement à zéro.');
      return;
    }
    if (interaction.options.getString('confirmation') !== 'oui') {
      await slashError(interaction, 'Réinitialisation annulée.');
      return;
    }
    await interaction.deferReply();
    await clearLeaderboardForGuild(interaction.guild);
    await interaction.editReply(
      '🧹 **Grand ménage terminé !** Tous les XP sont à zéro et le rôle Cerveau du serveur est de nouveau à conquérir.'
    );
    return;
  }

  if (name === 'questiondujour') {
    await interaction.reply(`# 💬 Question du jour\n\n${pickArray(DISCUSSION_QUESTIONS)}\n\n*À vos réponses, les Besties ! 🫶🏻*`);
    return;
  }

  if (name === 'verdict') {
    const question = interaction.options.getString('question', true);
    await interaction.reply({
      content: `# 🔮 Le verdict de la Besty\n\n**${question}**\n\n${pickArray(VERDICTS)}`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (name === 'match') {
    const first = interaction.options.getUser('membre1', true);
    const second = interaction.options.getUser('membre2', true);
    const score = compatibilityScore(interaction.guildId, first.id, second.id);
    const seed = stableNumber(`${first.id}:${second.id}:${interaction.guildId}`);
    await interaction.reply(
      `# 💘 Match Besty\n\n${first} + ${second} = **${score} % de compatibilité**\n\n${matchComment(score, seed)}`
    );
    return;
  }

  if (name === 'humeur') {
    const mood = interaction.options.getString('etat', true);
    const replies = MOOD_REPLIES[mood] || MOOD_REPLIES.perdue;
    await interaction.reply(`# 🌸 La météo de ton cœur\n\n${pickArray(replies)}`);
    return;
  }

  if (name === 'confession') {
    await publishConfession(interaction);
    return;
  }

  if (name === 'souvenir') {
    await interaction.deferReply();
    const message = await getRandomValidSouvenir(interaction.guild);
    if (!message) {
      await interaction.editReply(
        `📸 Je n’ai pas encore assez de souvenirs populaires. Un message est enregistré à partir de ${MIN_REACTIONS_FOR_SOUVENIR} réactions.`
      );
      return;
    }
    await interaction.editReply({
      content:
        `# 📸 Souvenir du serveur\n\n` +
        `**${message.member?.displayName || message.author.username}** dans ${message.channel} :\n` +
        `> ${safeQuote(message.content, 600).replace(/\n/g, '\n> ')}\n\n${message.url}`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (name === 'roast') {
    const target = interaction.options.getUser('membre', true);
    if (target.bot) {
      await slashError(interaction, 'Même moi j’ai des limites : on ne roast pas les robots innocents.');
      return;
    }
    if (target.id === interaction.user.id) {
      await interaction.reply(`# 🔥 Auto-roast accepté\n\n${roastText(target)}`);
      return;
    }
    const nonce = shortNonce();
    pendingRoasts.set(nonce, {
      requesterId: interaction.user.id,
      targetId: target.id,
      expiresAt: Date.now() + 2 * 60_000,
    });
    setTimeout(() => pendingRoasts.delete(nonce), 2 * 60_000);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`roast_ok:${nonce}`).setLabel('J’accepte le roast').setStyle(ButtonStyle.Danger).setEmoji('🔥'),
      new ButtonBuilder().setCustomId(`roast_no:${nonce}`).setLabel('Je garde ma dignité').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: `${target}, ${interaction.user} veut te faire roaster gentiment. Est-ce que tu acceptes ?`,
      components: [row],
    });
    return;
  }

  if (name === 'duel') {
    const target = interaction.options.getUser('membre', true);
    if (target.bot || target.id === interaction.user.id) {
      await slashError(interaction, 'Choisis une vraie Besty différente de toi pour ce duel.');
      return;
    }
    if (DUEL_CHANNEL_ID && interaction.channelId !== DUEL_CHANNEL_ID) {
      await slashError(interaction, `Les duels se lancent uniquement dans <#${DUEL_CHANNEL_ID}>.`);
      return;
    }
    if (activeDuels.has(interaction.channelId)) {
      await slashError(interaction, 'Un duel est déjà en cours dans ce salon. Attends la fin du combat !');
      return;
    }
    if (interaction.channelId === QUIZ_CHANNEL_ID && currentQuestion) {
      await slashError(interaction, 'Une question est déjà en cours dans ce salon. Lance le duel ailleurs ou attends sa fin.');
      return;
    }
    const nonce = shortNonce();
    pendingDuels.set(nonce, {
      requesterId: interaction.user.id,
      targetId: target.id,
      channelId: interaction.channelId,
      expiresAt: Date.now() + 2 * 60_000,
    });
    setTimeout(() => pendingDuels.delete(nonce), 2 * 60_000);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel_ok:${nonce}`).setLabel('J’accepte le duel').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
      new ButtonBuilder().setCustomId(`duel_no:${nonce}`).setLabel('Je décline').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: `# ⚔️ Duel de cerveaux\n\n${target}, ${interaction.user} te défie pour **${XP_PER_DUEL} XP** ! Acceptes-tu ?`,
      components: [row],
    });
  }
}

// --- Message d'accueil après l'ajout du rôle de validation ---
function welcomeConfigIsReady() {
  return Boolean(
    WELCOME_ROLE_ID &&
      GENERAL_CHANNEL_ID &&
      ROLES_CHANNEL_ID &&
      PRESENTATION_CHANNEL_ID &&
      ANNOUNCEMENTS_CHANNEL_ID
  );
}

function buildChannelLink(label, guildId, channelId) {
  return `[${label}](https://discord.com/channels/${guildId}/${channelId})`;
}

function buildWelcomeMessage(member) {
  const opening =
    WELCOME_OPENINGS[Math.floor(Math.random() * WELCOME_OPENINGS.length)];
  const personalizedOpening = opening.replace('{member}', `${member}`);

  const rolesLink = buildChannelLink(
    'rôles',
    member.guild.id,
    ROLES_CHANNEL_ID
  );
  const presentationLink = buildChannelLink(
    'présentation',
    member.guild.id,
    PRESENTATION_CHANNEL_ID
  );
  const announcementsLink = buildChannelLink(
    'annonces',
    member.guild.id,
    ANNOUNCEMENTS_CHANNEL_ID
  );

  return (
    `# ${personalizedOpening}\n\n` +
    `Pour commencer ton aventure, tu peux choisir tes ${rolesLink}, ` +
    `venir faire une petite ${presentationLink} pour qu’on te découvre, ` +
    `et regarder les ${announcementsLink} afin de ne rien manquer. ` +
    `Prends ton temps, explore et viens papoter dès que tu te sens prête ou prêt ma boT ! 🫶🏻`
  );
}

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (!welcomeConfigIsReady() || newMember.user.bot) return;

  const hadWelcomeRole = oldMember.roles.cache.has(WELCOME_ROLE_ID);
  const hasWelcomeRole = newMember.roles.cache.has(WELCOME_ROLE_ID);
  if (hadWelcomeRole || !hasWelcomeRole) return;

  recordNewMember(newMember.id);

  try {
    const generalChannel = await newMember.guild.channels
      .fetch(GENERAL_CHANNEL_ID)
      .catch(() => null);

    if (!generalChannel?.isTextBased()) {
      console.warn(
        `Accueil impossible : le salon général ${GENERAL_CHANNEL_ID} est introuvable.`
      );
      return;
    }

    await generalChannel.send({
      content: buildWelcomeMessage(newMember),
      allowedMentions: { users: [newMember.id] },
    });
    console.log(`Message d'accueil envoyé pour ${newMember.user.tag}.`);
  } catch (error) {
    console.error("Impossible d'envoyer le message d'accueil :", error);
  }
});

function duelQuestion() {
  return (
    pickFrom(QUESTIONS_FILE) ||
    pickFrom(ENIGMES_FILE) ||
    pickFrom(CASSE_TETES_FILE)
  );
}

async function handleRoastButton(interaction) {
  const [action, nonce] = interaction.customId.split(':');
  const request = pendingRoasts.get(nonce);
  if (!request || request.expiresAt < Date.now()) {
    pendingRoasts.delete(nonce);
    await slashError(interaction, 'Cette demande de roast a expiré. La dignité a gagné cette manche.');
    return;
  }
  if (interaction.user.id !== request.targetId) {
    await slashError(interaction, 'Seule la personne visée peut accepter ou refuser ce roast.');
    return;
  }

  pendingRoasts.delete(nonce);
  if (action === 'roast_no') {
    await interaction.update({
      content: `${interaction.user} garde sa dignité intacte. Le roast est annulé. 🫶🏻`,
      components: [],
    });
    return;
  }

  await interaction.update({
    content: `# 🔥 Roast consenti\n\n${roastText(interaction.user)}`,
    components: [],
  });
}

async function handleDuelButton(interaction) {
  const [action, nonce] = interaction.customId.split(':');
  const request = pendingDuels.get(nonce);
  if (!request || request.expiresAt < Date.now()) {
    pendingDuels.delete(nonce);
    await slashError(interaction, 'Ce défi a expiré. Les neurones ont quitté l’arène.');
    return;
  }
  if (interaction.user.id !== request.targetId) {
    await slashError(interaction, 'Seule la personne défiée peut répondre à cette invitation.');
    return;
  }

  pendingDuels.delete(nonce);
  if (action === 'duel_no') {
    await interaction.update({
      content: `${interaction.user} décline le duel avec élégance. Aucun XP ne sera maltraité aujourd’hui.`,
      components: [],
    });
    return;
  }

  if (activeDuels.has(request.channelId)) {
    await interaction.update({
      content: 'Un autre duel a commencé entre-temps dans ce salon. Relancez le défi après sa conclusion.',
      components: [],
    });
    return;
  }

  const question = duelQuestion();
  if (!question || !Array.isArray(question.answers) || !question.answers.length) {
    await interaction.update({
      content: 'La réserve de questions est vide : impossible de lancer ce duel.',
      components: [],
    });
    return;
  }

  const duel = {
    requesterId: request.requesterId,
    targetId: request.targetId,
    channelId: request.channelId,
    question: question.question,
    answers: question.answers,
    expiresAt: Date.now() + 3 * 60_000,
    timer: null,
  };
  activeDuels.set(request.channelId, duel);

  await interaction.update({
    content:
      `# ⚔️ Le duel commence !\n\n` +
      `<@${duel.requesterId}> contre <@${duel.targetId}>\n\n` +
      `**${duel.question}**\n\n` +
      `La première bonne réponse remporte **${XP_PER_DUEL} XP**. Vous avez 3 minutes !`,
    components: [],
    allowedMentions: { users: [duel.requesterId, duel.targetId] },
  });

  duel.timer = setTimeout(async () => {
    if (activeDuels.get(duel.channelId) !== duel) return;
    activeDuels.delete(duel.channelId);
    const channel = await client.channels.fetch(duel.channelId).catch(() => null);
    await channel?.send('⌛ Duel terminé : personne n’a trouvé la réponse. Les 20 XP restent dans leur écrin.');
  }, 3 * 60_000);
}

async function handleActiveDuelAnswer(message) {
  const duel = activeDuels.get(message.channel.id);
  if (!duel) return false;
  if (![duel.requesterId, duel.targetId].includes(message.author.id)) return false;

  const isCorrect = duel.answers.map(normalize).some((answer) => answer === normalize(message.content));
  if (!isCorrect) return true;

  activeDuels.delete(message.channel.id);
  if (duel.timer) clearTimeout(duel.timer);
  scores[message.author.id] = (scores[message.author.id] || 0) + XP_PER_DUEL;
  saveJSON(SCORES_FILE, scores);
  recordXpGain(message.author.id, XP_PER_DUEL, 'duel');

  await message.reply(
    `⚔️ **Duel remporté !** ${message.author} gagne ${XP_PER_DUEL} XP et atteint **${scores[message.author.id]} XP**.`
  );
  await updateBrainRole(message.guild);
  return true;
}

async function handleImageEnigmaButton(interaction) {
  const [, imageId, letter] = interaction.customId.split(':');
  if (
    currentQuestion?.type !== 'image-enigme' ||
    currentQuestion.imageId !== imageId ||
    currentQuestion.messageId !== interaction.message.id
  ) {
    await slashError(interaction, "Cette énigme-image n'est plus active.");
    return;
  }

  if (Date.now() >= Number(currentQuestion.expiresAt)) {
    await slashError(interaction, '⌛ Trop tard ma boT : les cinq minutes sont terminées.');
    await finishImageEnigma();
    return;
  }

  const responded = new Set(currentQuestion.respondedUserIds || []);
  if (responded.has(interaction.user.id)) {
    await slashError(
      interaction,
      "Tu as déjà validé ta réponse. Une seule tentative par personne, pas de triche de diva !"
    );
    return;
  }

  responded.add(interaction.user.id);
  currentQuestion.respondedUserIds = [...responded];
  if (letter === currentQuestion.correctAnswer) {
    const correct = new Set(currentQuestion.correctUserIds || []);
    correct.add(interaction.user.id);
    currentQuestion.correctUserIds = [...correct];
  }
  setCurrentQuestion(currentQuestion);

  await interaction.reply({
    content: `🔒 Ta réponse **${letter}** est enregistrée. Verdict à la fin des cinq minutes !`,
    flags: MessageFlags.Ephemeral,
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('image_answer:')) {
      await handleImageEnigmaButton(interaction);
      return;
    }
    if (interaction.customId.startsWith('roast_')) {
      await handleRoastButton(interaction);
      return;
    }
    if (interaction.customId.startsWith('duel_')) {
      await handleDuelButton(interaction);
    }
  } catch (error) {
    console.error('Interaction impossible :', error);
    await slashError(interaction, '✨ Petit bug de diva : cette commande n’a pas pu se terminer. Réessaie dans un instant.').catch(() => {});
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    const message = reaction.message;
    if (!message.guild || message.author?.bot || !shouldTrackSouvenirChannel(message.channel.id)) return;

    const reactionTotal = [...message.reactions.cache.values()].reduce(
      (total, item) => total + (item.count || 0),
      0
    );
    const activityMessage = dailyActivity.messages.find((item) => item.id === message.id);
    if (activityMessage) {
      activityMessage.reactions = reactionTotal;
      scheduleActivitySave();
    }
    if (reactionTotal < MIN_REACTIONS_FOR_SOUVENIR || !message.content.trim()) return;

    const saved = {
      messageId: message.id,
      channelId: message.channel.id,
      authorId: message.author.id,
      createdAt: message.createdAt.toISOString(),
    };
    const existingIndex = souvenirs.findIndex((item) => item.messageId === message.id);
    if (existingIndex >= 0) souvenirs[existingIndex] = saved;
    else souvenirs.push(saved);
    if (souvenirs.length > MAX_SOUVENIRS_STORED) {
      souvenirs.splice(0, souvenirs.length - MAX_SOUVENIRS_STORED);
    }
    saveJSON(SOUVENIRS_FILE, souvenirs);
  } catch (error) {
    console.error('Impossible d’enregistrer ce souvenir :', error);
  }
});

// --- Écoute des messages du salon quiz ---
client.on(Events.MessageCreate, async (message) => {
  // Exception volontaire : les messages des bots sont normalement ignorés,
  // mais la confirmation officielle de DISBOARD sert à compter le /bump.
  if (
    message.author.id === DISBOARD_BOT_ID &&
    message.channel.id === BUMP_CHANNEL_ID
  ) {
    try {
      await handleSuccessfulDisboardBump(message);
    } catch (error) {
      console.error('Impossible de comptabiliser le bump DISBOARD :', error);
    }
    return;
  }

  if (message.author.bot) return;

  recordDailyMessage(message);

  if (await handleTtsTextMessage(message)) return;

  const command = message.content.trim().toLowerCase();

  if (await handleActiveDuelAnswer(message)) return;

  // L'IA répond dans tous les salons lorsqu'elle est directement mentionnée.
  // Ce bloc passe avant la restriction du salon quiz et ne touche jamais aux XP.
  const aiQuestion = extractMentionQuestion(message);
  if (aiQuestion) {
    await handleBestyAIMention(message, aiQuestion);
    return;
  }

  // Cette commande fonctionne dans tous les salons accessibles au bot.
  // Elle ne modifie ni les scores, ni les quotas, ni la question en cours.
  if (command === '!besty') {
    const phrase = pickFrom(BESTY_FILE);
    if (typeof phrase !== 'string' || !phrase.trim()) {
      await message.reply(
        "😱 La réserve de bonnes ondes est vide ! Préviens Esty Besty qu'il faut vérifier le fichier `besty.json`."
      );
      return;
    }

    await message.reply(`✨ **Ton message Besty :**\n${phrase}`);
    return;
  }

  if (message.channel.id !== QUIZ_CHANNEL_ID) return;

  await questionStateReady;
  console.log(`Message reçu dans le salon quiz de ${message.author.tag}.`);

  if (command === '!enigme') {
    // Vérifie d'abord qu'une question ouverte n'a pas été perdue lors d'un
    // changement de conteneur Railway.
    await ensureCurrentQuestion();
    if (currentQuestion) {
      await message.reply("Une question est déjà en cours, réponds à celle-ci d'abord !");
      return;
    }

    const usedToday = getEnigmaUsage(message.author.id);
    if (usedToday >= MAX_ENIGMES_PER_DAY) {
      await message.reply(
        "🚨 **Halte-là, Einstein !** Tu as déjà lancé tes 5 énigmes aujourd'hui. Tes neurones sont placés en repos obligatoire jusqu'à demain ! 🧠💤"
      );
      return;
    }

    const remainingAfter = MAX_ENIGMES_PER_DAY - usedToday - 1;
    const posted = await postEnigme(message.channel, remainingAfter);
    if (posted) {
      recordEnigmaUsage(message.author.id);
    }
    return;
  }

  if (command === '!cassetete') {
    // Le quota des casse-têtes est indépendant de celui des énigmes.
    await ensureCurrentQuestion();
    if (currentQuestion) {
      await message.reply("Une question est déjà en cours, réponds à celle-ci d'abord !");
      return;
    }

    const usedToday = getCasseTeteUsage(message.author.id);
    if (usedToday >= MAX_CASSE_TETES_PER_DAY) {
      await message.reply(
        "🕵️ **Doucement, Sherlock !** Tu as déjà lancé tes 5 casse-têtes aujourd'hui. Même les plus grands cerveaux ont besoin de refroidir jusqu'à demain ! 🧠❄️"
      );
      return;
    }

    const remainingAfter = MAX_CASSE_TETES_PER_DAY - usedToday - 1;
    const posted = await postCasseTete(message.channel, remainingAfter);
    if (posted) {
      recordCasseTeteUsage(message.author.id);
    }
    return;
  }

  if (command === '!resetclassement' || command === '!resetclassement confirmer') {
    if (!canResetLeaderboard(message)) {
      await message.reply(
        "⛔ Bien essayé, petit génie… mais seuls les administrateurs peuvent remettre le classement à zéro !"
      );
      return;
    }

    if (command === '!resetclassement') {
      await message.reply(
        '⚠️ Cette commande effacera **tous les XP**. Pour confirmer, écris exactement : `!resetclassement confirmer`'
      );
      return;
    }

    await resetLeaderboard(message);
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

  // Les énigmes-image se répondent uniquement avec les boutons A, B, C ou D.
  if (currentQuestion.type === 'image-enigme') return;

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

  for (const guild of readyClient.guilds.cache.values()) {
    try {
      await guild.commands.set(SLASH_COMMANDS);
      console.log(`${SLASH_COMMANDS.length} commandes / enregistrées sur ${guild.name}.`);
    } catch (error) {
      console.error(`Impossible d’enregistrer les commandes / sur ${guild.name} :`, error);
    }
  }

  try {
    await restoreQuestionFromDiscord();
  } catch (error) {
    console.error('Impossible de restaurer la question en cours :', error);
  } finally {
    markQuestionStateReady();
  }

  if (currentQuestion?.type === 'image-enigme') scheduleImageEnigmaEnd();

  const bumpChannel = await readyClient.channels.fetch(BUMP_CHANNEL_ID).catch(() => null);
  if (bumpChannel?.guild) {
    await applyMonthlyBumpReward(bumpChannel.guild).catch((error) => {
      console.error('Impossible de finaliser le classement mensuel des bumps :', error);
    });
  }

  console.log(`Énigmes-image automatiques programmées à : ${DAILY_TIMES.join('h, ')}h`);
  console.log(
    'Commandes / activées : enigme, cassetete, imageenigme, besty, classement, bumps, classementbump, resetclassement, questiondujour, verdict, match, humeur, roast, confession, duel, souvenir, ttsjoin, ttsleave, ttsskip, ttsclear'
  );
  console.log(
    `Compteur DISBOARD actif dans ${BUMP_CHANNEL_ID} : ${XP_PER_BUMP} XP par bump, ${XP_MONTHLY_BUMP_WINNER} XP au classement mensuel.`
  );
  console.log(
    `Lecture vocale reliée aux salons texte : ${[...TTS_TEXT_CHANNEL_IDS].join(', ')}.`
  );
  console.log(`Données sauvegardées dans : ${DATA_DIR}`);
  console.log(
    ESTY_USER_ID
      ? `Mode Queen Esty activé pour l'identifiant ${ESTY_USER_ID}.`
      : 'Mode Queen Esty en attente : ajoute ESTY_USER_ID dans Railway.'
  );
  console.log('Résumé quotidien de 20h désactivé dans cette version.');

  if (welcomeConfigIsReady()) {
    console.log(
      `Accueil automatique activé pour l'ajout du rôle ${WELCOME_ROLE_ID}.`
    );
  } else {
    const missingWelcomeVariables = [
      ['WELCOME_ROLE_ID', WELCOME_ROLE_ID],
      ['GENERAL_CHANNEL_ID', GENERAL_CHANNEL_ID],
      ['ROLES_CHANNEL_ID', ROLES_CHANNEL_ID],
      ['PRESENTATION_CHANNEL_ID', PRESENTATION_CHANNEL_ID],
      ['ANNOUNCEMENTS_CHANNEL_ID', ANNOUNCEMENTS_CHANNEL_ID],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    console.log(
      `Accueil automatique en attente. Variables manquantes : ${missingWelcomeVariables.join(', ')}`
    );
  }

  DAILY_TIMES.forEach((hour) => {
    cron.schedule(
      `0 ${hour} * * *`,
      () => {
        postScheduledImageEnigma().catch((error) => {
          console.error("Impossible de publier l'énigme-image automatique :", error);
        });
      },
      { timezone: 'Europe/Paris' }
    );
  });

  // À 00 h 05 le premier jour de chaque mois, heure de Paris.
  cron.schedule(
    '5 0 1 * *',
    async () => {
      const channel = await readyClient.channels.fetch(BUMP_CHANNEL_ID).catch(() => null);
      if (!channel?.guild) return;
      await applyMonthlyBumpReward(channel.guild).catch((error) => {
        console.error('Récompense mensuelle des bumps impossible :', error);
      });
    },
    { timezone: 'Europe/Paris' }
  );

});

client.on(Events.Error, (error) => {
  console.error('Erreur Discord :', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée :', error);
});

function shutdown(signal) {
  console.log(`${signal} reçu : arrêt propre du bot.`);
  if (activitySaveTimer) clearTimeout(activitySaveTimer);
  clearImageEnigmaTimer();
  for (const guildId of ttsSessions.keys()) stopTtsSession(guildId);
  saveJSON(DAILY_ACTIVITY_FILE, dailyActivity);
  saveJSON(SOUVENIRS_FILE, souvenirs);
  saveJSON(BUMP_STATS_FILE, bumpStats);
  client.destroy();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  client.login(process.env.DISCORD_TOKEN);
}

module.exports = {
  SLASH_COMMANDS,
  compatibilityScore,
  buildDailySummary,
  topicWords,
  handleSlashCommand,
  isEstyUser,
  memberHasBestyRole,
  personaForUser,
  getParisMonthKey,
  formatBumpMonth,
  successfulDisboardBump,
  disboardBumperId,
};
