import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');

// Lista fechada: somente estes arquivos podem chegar ao Netlify.
// Backups, SQL, documentacao e arquivos locais ficam fora da publicacao.
const publicFiles = [
  '_headers',
  '_redirects',
  'index.html',
  'style.css',
  'minha-casa.css',
  'aluguel-ui.css',
  'motion.css',
  'config.js',
  'utils.js',
  'supabase.js',
  'offline.js',
  'auth.js',
  'commercial.js',
  'minha-casa.js',
  'features.js',
  'dashboard.js',
  'houses.js',
  'tenants.js',
  'interests.js',
  'contracts.js',
  'finance.js',
  'photos.js',
  'documents.js',
  'energy.js',
  'portal.js',
  'reports.js',
  'calendar.js',
  'backup.js',
  'app.js',
  'vitrine.js',
  'vitrine.css',
  'motion.js',
  'service-worker.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'marketing/landing-page/index.html',
  'marketing/landing-page/styles.css',
  'marketing/landing-page/config.js',
  'marketing/landing-page/script.js',
  'marketing/mockups/screenshots/dashboard-desktop.png',
  'marketing/mockups/screenshots/financeiro-desktop.png',
  'marketing/mockups/screenshots/detalhe-imovel-mobile.png',
  'marketing/mockups/screenshots/portal-inquilino-mobile.png',
  'marketing/mockups/finais/mockup-hero-dashboard.png'
];

// Arquivos que podem não existir ainda. Se faltarem, a publicação
// continua e só o recurso correspondente deixa de funcionar.
// Baixe o Leaflet em https://leafletjs.com/download.html e coloque
// leaflet.js e leaflet.css dentro de vendor/ para ativar o mapa.
const optionalFiles = [
  'vendor/leaflet.js',
  'vendor/leaflet.css'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const contents = await Promise.all(publicFiles.map((file) => readFile(join(root, file))));
const version = createHash('sha256').update(Buffer.concat(contents)).digest('hex').slice(0,12);

await Promise.all(publicFiles.filter((file) => file!=='service-worker.js')
  .map(async (file) => {
    const target = join(output, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
  }));

// Opcionais: copia se existir, avisa se não existir.
let copiadosOpcionais = 0;
for (const file of optionalFiles) {
  try {
    const target = join(output, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
    copiadosOpcionais++;
  } catch {
    console.warn(`Opcional ausente (ignorado): ${file}`);
  }
}
if (copiadosOpcionais < optionalFiles.length) {
  console.warn('Aviso: o mapa da Vitrine só aparece com leaflet.js e leaflet.css em vendor/.');
}

const worker = (await readFile(join(root,'service-worker.js'),'utf8'))
  .replace(/const CACHE = '[^']+';/, `const CACHE = 'aluguel-${version}';`);
await writeFile(join(output,'service-worker.js'), worker, 'utf8');

console.log(`Publicação ${version} preparada com ${publicFiles.length + copiadosOpcionais} arquivos em dist/.`);
