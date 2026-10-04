export function ensureMindMapTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS mind_maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL, graph_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE INDEX IF NOT EXISTS mind_maps_owner ON mind_maps(user_id,id);`);
}
export function createMindMapRepository(db) {
  const dto=row=>row?{id:row.id,title:row.title,graph:JSON.parse(row.graph_json),version:row.version,updatedAt:row.updated_at}:null;
  return {
    list(userId){return db.prepare('SELECT id,title,version,updated_at AS updatedAt FROM mind_maps WHERE user_id=? ORDER BY id DESC').all(userId);},
    get(userId,id){return dto(db.prepare('SELECT * FROM mind_maps WHERE user_id=? AND id=?').get(userId,id));},
    create(userId,graph){const r=db.prepare('INSERT INTO mind_maps(user_id,title,graph_json) VALUES(?,?,?)').run(userId,graph.title,JSON.stringify(graph));return this.get(userId,Number(r.lastInsertRowid));},
    update(userId,id,version,graph){const r=db.prepare('UPDATE mind_maps SET title=?,graph_json=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=? AND version=?').run(graph.title,JSON.stringify(graph),userId,id,version);return r.changes?this.get(userId,id):null;},
    delete(userId,id){return db.prepare('DELETE FROM mind_maps WHERE user_id=? AND id=?').run(userId,id).changes>0;},
  };
}
