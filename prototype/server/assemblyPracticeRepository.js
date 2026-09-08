import { createHash } from 'node:crypto';

export function createAssemblyPracticeRepository(db){
  function get(studentId,caseId){
    const row=db.prepare('SELECT * FROM assembly_practice_documents WHERE student_id=? AND case_id=?').get(studentId,caseId);
    return row?{revision:row.revision,updatedAt:row.updated_at,document:JSON.parse(row.document_json)}
      :{revision:0,updatedAt:null,document:{version:1,active:null,history:[]}};
  }
  const save=db.transaction((studentId,caseId,batch)=>{
    const hash=createHash('sha256').update(JSON.stringify({baseRevision:batch.baseRevision,document:batch.document})).digest('hex');
    const receipt=db.prepare('SELECT * FROM assembly_practice_operations WHERE student_id=? AND case_id=? AND operation_id=?').get(studentId,caseId,batch.operationId);
    const current=get(studentId,caseId);
    if(receipt){
      if(receipt.request_hash!==hash)throw Object.assign(new Error('相同同步请求标识不能提交不同内容'),{status:409,current});
      return {revision:receipt.revision,duplicate:true};
    }
    if(current.revision!==batch.baseRevision)throw Object.assign(new Error('另一台设备已更新练习，请选择要保留的进度'),{status:409,current});
    const revision=current.revision+1,updatedAt=new Date().toISOString();
    db.prepare(`INSERT INTO assembly_practice_documents (student_id,case_id,revision,document_json,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(student_id,case_id) DO UPDATE SET revision=excluded.revision,document_json=excluded.document_json,updated_at=excluded.updated_at`)
      .run(studentId,caseId,revision,JSON.stringify(batch.document),updatedAt);
    db.prepare('INSERT INTO assembly_practice_operations (student_id,case_id,operation_id,request_hash,revision) VALUES (?,?,?,?,?)')
      .run(studentId,caseId,batch.operationId,hash,revision);
    // Older retries remain safe via revision checking, even after receipt compaction.
    db.prepare('DELETE FROM assembly_practice_operations WHERE student_id=? AND case_id=? AND revision<=?').run(studentId,caseId,revision-200);
    return {revision,updatedAt,duplicate:false};
  });
  return {get,save};
}
