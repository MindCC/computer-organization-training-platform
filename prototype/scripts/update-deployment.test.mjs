import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const prototypeRoot=fileURLToPath(new URL('..',import.meta.url));
const qaRoot=path.join(prototypeRoot,'qa-artifacts');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const shellPath=value=>process.platform==='win32'?'/'+value[0].toLowerCase()+value.slice(2).replaceAll('\\','/'):value;

test('deployment stages first and recovers old service after migration or release health failures', {skip:!existsSync(bash)},()=>{
 mkdirSync(qaRoot,{recursive:true});
 const script=readFileSync(path.join(prototypeRoot,'../deploy/update.sh'),'utf8').replaceAll('\r\n','\n');
 assert.ok(script.includes('[[ $EUID == 0 ]]'));
 for(const mode of ['build-failure','migration-failure','health-failure','success']){
  const fixture=mkdtempSync(path.join(qaRoot,'update-fault-'));
  const app=path.join(fixture,'app'),bin=path.join(fixture,'bin'),config=path.join(fixture,'config');
  const write=(relative,content)=>{const file=path.join(fixture,relative);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,content,{mode:0o755});};
  // Only the fixture copy omits the root check. Every external control command is mocked.
  write('update.sh',script.replace('[[ $EUID == 0 ]]','[[ 1 == 1 ]]').replace('set -euo pipefail','export PATH="$QA_ROOT/bin:/usr/bin:/bin"\nset -euo pipefail'));
  mkdirSync(path.join(app,'.git'),{recursive:true});mkdirSync(bin,{recursive:true});
  write('app/prototype/package-lock.json','{}');write('app/prototype/code.txt','old');
  write('app/prototype/node_modules/version','old');write('app/prototype/dist/index.html','old');
  write('release/prototype/package-lock.json','{}');write('release/prototype/code.txt','new');
  write('database.sqlite','original-data');write('revision','old');write('active','yes');
  write('config/platform.env',`DATABASE_PATH=${shellPath(path.join(fixture,'database.sqlite'))}\nPORT=8787\n`);
  write('config/update-version.env','HERMES_BUILD_ID=old\n');
  write('systemd/zcyl-platform.service.d/zz-update-version.conf','old-version-config');
  const mock=(name,body)=>write('bin/'+name,'#!/usr/bin/env bash\nset -eu\n'+body+'\n');
  mock('git',`if [[ "+$1" == '+-C' ]]; then shift 2; fi
case "$1" in
 branch) echo main;;
 diff|merge-base|fetch|remote) exit 0;;
 rev-parse) if [[ "$2" == FETCH_HEAD ]]; then echo new; else cat "$QA_ROOT/revision"; fi;;
 archive) tar -C "$QA_ROOT/release" -cf - .;;
 merge) printf new > "$QA_ROOT/revision"; printf new > "$QA_ROOT/app/prototype/code.txt";;
 reset) printf old > "$QA_ROOT/revision"; printf old > "$QA_ROOT/app/prototype/code.txt";;
 *) echo "Unexpected git call: $*" >&2; exit 90;;
esac`);
  mock('sudo',`while [[ "$1" == -* ]]; do if [[ "$1" == -u ]]; then shift 2; else shift; fi; done
exec "$@"`);
  mock('stat','echo qa-user');mock('chown','exit 0');mock('chmod','exit 0');mock('flock','exit 0');mock('id','exit 0');mock('sleep','exit 0');
  mock('install','while [[ "$1" == -* ]]; do if [[ "$1" == -m ]]; then shift 2; else shift; fi; done\nmkdir -p "$@"');
  mock('node',`if [[ "$1" == -p ]]; then echo 24; exit 0; fi
if [[ "$3" == *'db.backup'* ]]; then cp "$DATABASE_PATH" "$BACKUP_PATH"; exit 0; fi
if [[ "$3" == *'health.ok'* ]]; then
 grep -q '"ok":true' "$4" || exit 1
 [[ -z "$5" ]] || grep -q "\\\"version\\\":\\\"$5\\\"" "$4"
 exit $?
fi
echo 'Unexpected node call' >&2; exit 91`);
  mock('npm',`case "$1 $2" in
 'ci --include=dev') mkdir -p node_modules; printf new > node_modules/version;;
 'run build') if [[ "$QA_MODE" == build-failure ]]; then exit 75; fi; mkdir -p dist; printf new > dist/index.html;;
 'run migrate') printf '\\nmigration-written' >> "$DATABASE_PATH"; if [[ "$QA_MODE" == migration-failure ]]; then exit 76; fi;;
 *) echo "Unexpected npm call: $*" >&2; exit 92;;
esac`);
  mock('systemctl',`printf '%s\\n' "$*" >> "$QA_ROOT/service-events"
case "$1" in
 stop) printf no > "$QA_ROOT/active";;
 restart) printf yes > "$QA_ROOT/active";;
 is-active) [[ "$(cat "$QA_ROOT/active")" == yes ]];;
 cat|daemon-reload) exit 0;;
 *) exit 93;;
esac`);
  mock('curl',`revision=$(cat "$QA_ROOT/revision")
if [[ "$QA_MODE" == health-failure && "$revision" == new ]]; then exit 1; fi
printf '{"ok":true,"db":"ok","version":"%s"}' "$revision"`);
  try{
   const osEnv=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
   const result=spawnSync(bash,['--noprofile','--norc',shellPath(path.join(fixture,'update.sh'))],{cwd:fixture,encoding:'utf8',timeout:120000,env:{...osEnv,PATH:shellPath(bin)+':/usr/bin:/bin',QA_ROOT:shellPath(fixture),QA_MODE:mode,APP_DIR:shellPath(app),ENV_FILE:shellPath(path.join(config,'platform.env')),DATABASE_PATH:shellPath(path.join(fixture,'database.sqlite')),BACKUP_ROOT:shellPath(path.join(fixture,'backups')),SYSTEMD_DIR:shellPath(path.join(fixture,'systemd')),LOCK_FILE:shellPath(path.join(fixture,'update.lock')),REMOTE:'origin',APP_USER:'qa-user'}});
   const log=result.stdout+'\n'+result.stderr;
   assert.ifError(result.error);assert.equal(result.status,{'build-failure':75,'migration-failure':76,'health-failure':1,success:0}[mode],mode+'\n'+log);
   const expected=mode==='success'?'new':'old';
   for(const file of ['revision','app/prototype/code.txt','app/prototype/node_modules/version','app/prototype/dist/index.html'])assert.equal(readFileSync(path.join(fixture,file),'utf8').trim(),expected,mode+' '+file+'\n'+log);
   assert.equal(readFileSync(path.join(fixture,'active'),'utf8'),'yes',mode+' restores service');
   assert.equal(readFileSync(path.join(config,'update-version.env'),'utf8').trim(),'HERMES_BUILD_ID='+expected,mode);
   const database=readFileSync(path.join(fixture,'database.sqlite'),'utf8');
   assert.equal(database.includes('migration-written'),mode!=='build-failure','database must not be rolled back');
   if(mode==='build-failure')assert.ok(!readFileSync(path.join(fixture,'service-events'),'utf8').includes('stop'),'build failure must not stop running service');
   if(['migration-failure','health-failure'].includes(mode))assert.match(log,/原服务已恢复/);
  }finally{
   const resolved=realpathSync(fixture);
   assert.ok(resolved.startsWith(realpathSync(qaRoot)+path.sep)&&path.basename(resolved).startsWith('update-fault-'));
   rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
 }
});
