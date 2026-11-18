const assert=require('node:assert/strict'),fs=require('node:fs');const missions=require('../data/missions.json');
for(const [id,mission] of Object.entries(missions)){
  const hidden=fs.readFileSync(`dist/assets/rewards/${mission.decoyKey}.svg`,'utf8');
  const shown=fs.readFileSync(`dist/assets/reveals/${id}.svg`,'utf8');
  const outline=hidden.match(/<g fill="#[0-9a-f]+">(.*)<\/g>/i)?.[1];
  const mask=shown.match(/<clipPath id="shape">(.*)<\/clipPath>/)?.[1];
  assert.ok(outline && mask,`${id}: missing silhouette or reveal mask`);
  assert.equal(mask,outline,`${id}: reveal does not match the silhouette`);
  assert.notEqual(mission.decoyKey,mission.rewardKey,`${id}: shape should mislead`);
  assert.ok(mission.revealLine,`${id}: missing reveal line`);
}
assert.equal(Object.keys(missions).length,15);console.log('Passed: all 15 reveals share their exact silhouette outlines.');
