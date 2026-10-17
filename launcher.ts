// @ts-nocheck
import { spawn } from 'node:child_process';

console.log('Démarrage forcé du bot avec Node...');

const bot = spawn('/usr/local/bin/node', ['/home/container/index.js'], {
  cwd: '/home/container',
  stdio: 'inherit',
  env: process.env
});

bot.on('error', (error) => {
  console.error('Erreur au lancement du bot :', error);
  process.exit(1);
});

bot.on('exit', (code, signal) => {
  console.log(`Le bot s’est arrêté — code : ${code}, signal : ${signal}`);
  process.exit(code ?? 1);
});
