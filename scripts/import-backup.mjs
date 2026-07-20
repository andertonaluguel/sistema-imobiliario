import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const required = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','APP_EMAIL','APP_PASSWORD','BACKUP_PATH'];
for(const name of required){
  if(!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(scriptDir);
const context = vm.createContext({
  console,
  crypto:{ randomUUID },
  window:{ supabase:{ createClient:()=>({}) } }
});

for(const file of ['config.js','utils.js','supabase.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'), context, { filename:file });
}

const normalizeBackupForImport = vm.runInContext('normalizeBackupForImport', context);
const backup = JSON.parse(await readFile(resolve(process.env.BACKUP_PATH),'utf8'));
const payload = normalizeBackupForImport(backup);
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/,'');
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const authResponse = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
  method:'POST',
  headers:{ apikey:publicKey, 'Content-Type':'application/json' },
  body:JSON.stringify({ email:process.env.APP_EMAIL, password:process.env.APP_PASSWORD })
});
if(!authResponse.ok) throw new Error(`Falha ao autenticar para migração (${authResponse.status}).`);
const auth = await authResponse.json();

const rpcResponse = await fetch(`${baseUrl}/rest/v1/rpc/importar_backup_atomico`, {
  method:'POST',
  headers:{
    apikey:publicKey,
    Authorization:`Bearer ${auth.access_token}`,
    'Content-Type':'application/json',
    Prefer:'return=minimal'
  },
  body:JSON.stringify({ p_payload:payload, p_substituir:true })
});
if(!rpcResponse.ok){
  const detail = (await rpcResponse.text()).slice(0,500);
  throw new Error(`Falha na importação (${rpcResponse.status}): ${detail}`);
}

async function count(table){
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id`, {
    headers:{ apikey:publicKey, Authorization:`Bearer ${auth.access_token}` }
  });
  if(!response.ok) throw new Error(`Falha ao conferir ${table} (${response.status}).`);
  return (await response.json()).length;
}

const result = {
  imoveis:await count('imoveis'),
  inquilinos:await count('inquilinos'),
  pagamentos:await count('pagamentos'),
  energia:await count('energia')
};

console.log(JSON.stringify(result));
