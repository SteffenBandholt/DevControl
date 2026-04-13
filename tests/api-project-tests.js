// Simple API smoke-test helper for project-related endpoints
// - Purpose: run quick local API checks for project creation/validation
// - Behavior: creates a timestamped backup of `config/projects.json`, performs requests,
//   then restores the original file. Meant for local development only.
// - Usage: `PORT=52269 node tests/api-project-tests.js` or set `PORT` to your running server port.
// - WARNING: Only use against local dev instances. The script will modify `config/projects.json` but
//   restores it at the end; still, use with care.

const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
(async function(){
  const port = process.env.PORT || '52269';
  const url = `http://localhost:${port}`;
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const backup = path.join('config', `projects.json.bak.${ts}`);
  fs.copyFileSync(path.join('config','projects.json'), backup);
  console.log('BACKUP', backup);

  async function get(pathname){
    const r = await fetch(url+pathname);
    const t = await r.text();
    console.log('\nGET', pathname, '->', r.status);
    try{ console.log(JSON.parse(t)); } catch(e){ console.log(t); }
  }

  async function post(payload){
    console.log('\nPOST', '/api/projects', payload.name);
    try{
      const r = await fetch(url+'/api/projects', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload)});
      const t = await r.text();
      console.log('Status', r.status);
      try{ console.log(JSON.parse(t)); } catch(e){ console.log(t); }
    } catch (err){
      console.log('REQUEST ERROR', String(err));
    }
  }

  await get('/api/projects');

  const basePath = path.resolve('data');
  const agents = path.resolve('AGENTS.md');
  const name1 = `TEST-PROJ-VALID-${ts}`;
  await post({ name: name1, projectPath: basePath, agentsFile: agents, protectedAreas: 'renderer', defaultConstraints: 'ok' });

  await post({ name: name1, projectPath: path.join(basePath,'nonexistent_subdir'), agentsFile: agents });

  await post({ name: `TEST-PROJ-PATHDUP-${ts}`, projectPath: basePath, agentsFile: agents });

  await post({ name: `TEST-PROJ-AGENTS-FOLDER-${ts}`, projectPath: basePath, agentsFile: basePath });

  await post({ name: `TEST-PROJ-NONEXIST-${ts}`, projectPath: `C:/no_such_dir_12345_${ts}`, agentsFile: agents });

  console.log('\nCONFIG AFTER TESTS:');
  console.log(fs.readFileSync(path.join('config','projects.json'), 'utf8'));

  fs.copyFileSync(backup, path.join('config','projects.json'));
  console.log('\nRESTORED from', backup);
  console.log(fs.readFileSync(path.join('config','projects.json'), 'utf8'));
})();
