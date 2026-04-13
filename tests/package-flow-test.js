const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
(async function(){
  const url = process.env.URL || 'http://localhost:52269';
  console.log('Using URL', url);
  function now(){ return new Date().toISOString(); }

  // get existing package ids
  const existing = fs.readdirSync(path.join('data','packages')).filter(f=>f.endsWith('.json'));
  const existingIds = new Set(existing.map(f=>f.replace(/\.json$/,'')));

  try{
    // 1) preview
    console.log('\nREQUEST: POST /api/planner/preview');
    const previewResp = await fetch(url+'/api/planner/preview', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ goalText: 'Test Paketfluss ' + now() }) });
    const previewBody = await previewResp.json();
    console.log('preview status', previewResp.status);
    console.log(previewBody);
    if(previewResp.status !== 200){ console.error('Preview failed'); process.exit(1); }

    // 2) save package by sending plannerDraft
    console.log('\nREQUEST: POST /api/packages (save)');
    const saveResp = await fetch(url+'/api/packages', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ plannerDraft: previewBody }) });
    const saved = await saveResp.json();
    console.log('save status', saveResp.status);
    console.log(saved);
    if(saveResp.status !== 200){ console.error('Save failed'); process.exit(1); }

    const newId = saved.id;
    const pkgFile = path.join('data','packages', newId + '.json');

    // 3) list packages
    console.log('\nREQUEST: GET /api/packages');
    const listResp = await fetch(url+'/api/packages');
    const list = await listResp.json();
    console.log('list status', listResp.status);
    const found = list.find(p=>p.id === newId);
    console.log('new package found in list?', !!found);

    // 4) inspect saved file
    const fileExists = fs.existsSync(pkgFile);
    console.log('package file exists on disk?', fileExists, pkgFile);
    if(fileExists){
      const content = JSON.parse(fs.readFileSync(pkgFile,'utf8'));
      console.log('package.projectId:', content.projectId, 'projectName:', content.projectName);
    }

    // 5) cleanup: remove created package file
    if(fileExists){
      fs.unlinkSync(pkgFile);
      console.log('Removed created package file', pkgFile);
    }

    // verify no duplicate remains in list by re-calling list
    const listAfterResp = await fetch(url+'/api/packages');
    const listAfter = await listAfterResp.json();
    const stillPresent = listAfter.find(p=>p.id === newId);
    console.log('still present after cleanup?', !!stillPresent);

    console.log('\nTEST COMPLETE');
  } catch (err){
    console.error('ERROR', err);
    process.exit(1);
  }

})();
