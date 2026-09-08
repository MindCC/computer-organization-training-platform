import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, migrate, createUser } from './db.js';
import { createAssemblyPracticeRepository } from './assemblyPracticeRepository.js';
import { HARDWARE_GAME_CASES } from '../src/hardwareGame.js';

test('practice saves are isolated, revision checked and idempotent even after a later write',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try {
    const a=createUser(db,{username:'a',displayName:'a',role:'student',passwordHash:'x'});
    const b=createUser(db,{username:'b',displayName:'b',role:'student',passwordHash:'x'});
    const repo=createAssemblyPracticeRepository(db),caseId=HARDWARE_GAME_CASES[0].id;
    const document={version:1,active:null,history:[]};
    const batch={operationId:'operation-1',baseRevision:0,document};
    assert.equal(repo.save(a.id,caseId,batch).revision,1);
    assert.equal(repo.save(a.id,caseId,batch).duplicate,true);
    assert.equal(repo.get(b.id,caseId).revision,0);
    assert.equal(repo.get(a.id,HARDWARE_GAME_CASES[1].id).revision,0);
    assert.throws(()=>repo.save(a.id,caseId,{...batch,operationId:'stale-op'}),e=>e.status===409&&e.current.revision===1);
    assert.equal(repo.save(a.id,caseId,{...batch,operationId:'operation-2',baseRevision:1}).revision,2);
    assert.equal(repo.save(a.id,caseId,batch).revision,1);
    assert.equal(repo.get(a.id,caseId).revision,2);
    assert.throws(()=>repo.save(a.id,caseId,{...batch,baseRevision:1}),e=>e.status===409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_attempts').get().n,0);
  } finally {db.close();}
});
