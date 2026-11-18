// Each silhouette and its reveal use the same shape, so the outline cannot drift.
const fs=require('node:fs');
const missions=require('../data/missions.json');
const outlines={
  'pickled-radish':'<ellipse cx="45" cy="40" rx="28" ry="10"/><path d="M17 40v13c0 6 12 11 28 11s28-5 28-11V40c0 6-13 11-28 11S17 46 17 40Z"/><path d="M25 67v7c0 6 12 11 28 11s28-5 28-11v-8c-5 5-16 8-28 8-13 0-23-3-28-7Z"/>',
  lettuce:'<path d="M49 84C32 86 17 75 17 60c-8-8-4-21 5-25-1-11 9-18 19-15 6-8 18-7 23 2 11-2 20 7 18 17 9 6 11 18 4 25 0 12-12 22-27 20l-4-14-5 14Z"/>',
  perilla:'<path d="M50 84C31 78 17 62 17 44l6-2-1-6 7-2 1-7 7 1 3-7 6 3 4-9 4 9 6-3 3 7 7-1 1 7 7 2-1 6 6 2c0 18-14 34-33 40Z"/>',
  onion:'<path d="M43 15c5 6 8 11 7 16 3-6 5-10 5-16 5 7 8 13 7 19 14 8 22 17 22 29 0 16-15 26-34 26S16 79 16 63c0-12 8-21 22-29-1-7 0-13 5-19Z"/>',
  garlic:'<path d="M44 29c2-7 2-13 2-18h8c0 6 1 12 3 18 6 3 9 7 10 11 11 0 18 10 16 21-1 17-15 27-33 27S18 78 17 61c-2-11 5-21 16-21 1-4 5-8 11-11Z"/>',
  scallion:'<path d="M18 72 72 18l6 6-54 54zM27 79 83 34l5 7-57 44zM10 59 60 12l6 6-51 48z"/><circle cx="19" cy="77" r="6"/><circle cx="28" cy="84" r="6"/><circle cx="12" cy="65" r="6"/>',
  sauce:'<path d="M40 11h20v8l6 8v8l9 8v40c0 4-3 7-7 7H32c-4 0-7-3-7-7V43l9-8v-8l6-8z"/>',
  mushroom:'<path d="M13 49c2-20 18-33 37-33s35 13 37 33c-2 7-10 11-19 11H32c-9 0-17-4-19-11Z"/><path d="M38 57h24l3 23c0 6-7 10-15 10s-15-4-15-10z"/>',
  sausage:'<path d="M16 70C30 82 48 82 65 72S88 45 81 31c-3-5-11-7-16-3-5 5-5 11-7 16-4 11-14 15-25 13-7-1-12-4-17 1-3 3-4 8 0 12Z"/>',
  'sesame-sauce':'<ellipse cx="50" cy="45" rx="34" ry="11"/><path d="M16 45c1 25 13 38 34 38s33-13 34-38c-5 8-19 12-34 12S21 53 16 45Z"/>',
  meat:'<path d="M18 38C26 22 43 19 60 22c15-2 28 8 28 22 0 18-16 27-29 33-16 8-35 6-44-5-7-9-5-22 3-34Z"/>'
};
const art={
  'pickled-radish':{base:'#f7dd76',detail:'<circle cx="48" cy="58" r="31" fill="#fff9dd"/><circle cx="48" cy="58" r="25" fill="#fffdf0" stroke="#e4c954" stroke-width="3"/><circle cx="48" cy="58" r="17" fill="none" stroke="#f4e4a4" stroke-width="3"/><path d="M46 27c-4-8-2-16 1-20 2 7 5 10 5 17 3-7 7-10 10-12-2 8-3 12-7 18" fill="#7ca53f"/>'},
  lettuce:{base:'#57a645',detail:'<path d="M6 37c15-18 24 6 40-8s24 3 31 6c8 4 16-1 21-9v28c-12-4-15 9-26 2-10-7-16 5-26 4-11-2-15-11-26-1-7 6-12 2-16-1Z" fill="#a1d44e"/><path d="M10 63c15-10 19 5 29-2s18 9 29 1 21-6 29-1v23H4Z" fill="#78c653"/><path d="M16 47c12-7 17 5 28-2s18 6 29 0M19 69c10-6 14 5 25-1s17 4 27-1M50 81V25M50 49 29 35M50 58 72 37M50 69 28 54M50 69 72 54" fill="none" stroke="#d2ed83" stroke-width="3" stroke-linecap="round"/>'},
  perilla:{base:'#39884e',detail:'<path d="M50 93C38 75 21 59 17 38c12 6 20-4 25-13 5 6 12 6 17 0 4 9 12 18 25 13-4 22-19 39-34 55Z" fill="#5bad64"/><path d="M50 91V28M50 56 30 42M50 68 25 54M50 56l20-14M50 68l25-14" fill="none" stroke="#a5d990" stroke-width="3.5" stroke-linecap="round"/><path d="M42 29c3-9 4-15 4-21h8c0 6 1 12 4 21Z" fill="#ecd7ac"/>'},
  onion:{base:'#b97ac5',detail:'<ellipse cx="49" cy="53" rx="31" ry="36" fill="#e4bee7"/><ellipse cx="49" cy="53" rx="25" ry="29" fill="#b87ac6"/><ellipse cx="49" cy="53" rx="19" ry="22" fill="#f3d8ed"/><ellipse cx="49" cy="53" rx="13" ry="15" fill="#bd83c8"/><ellipse cx="49" cy="53" rx="7" ry="8" fill="#f8e7f3"/><path d="M7 40h84M8 67h84" stroke="#fff1e8" stroke-width="3" opacity=".8"/>'},
  garlic:{base:'#eee1c5',detail:'<path d="M50 24c-3 11-3 18-2 25-6-9-14-10-20-3-9 11-6 30 4 36 6 4 14 2 18-7 4 9 12 11 18 7 10-6 13-25 4-36-6-7-14-6-20 3 1-7 1-14-2-25Z" fill="#fff8e8" stroke="#d2bfa2" stroke-width="2"/><path d="M38 53c-5 7-5 18 0 24M62 53c5 7 5 18 0 24M50 47v33" fill="none" stroke="#e1d0b5" stroke-width="2"/><path d="M45 31 49 14l6 17" fill="#dfca9e"/>'},
  scallion:{base:'#e8f0c5',detail:'<path d="M3 76C22 60 29 80 48 61S74 38 96 27M3 64C20 45 30 61 47 43S71 25 93 21M8 87C26 67 36 89 55 71s26-20 43-15" fill="none" stroke="#3c914c" stroke-width="8" stroke-linecap="round"/><path d="M1 70C18 54 27 75 47 55S76 31 97 28M1 60C21 43 30 58 46 40S69 23 97 18M2 85C26 67 35 84 55 68S76 50 98 52" fill="none" stroke="#9ccc56" stroke-width="3" stroke-linecap="round"/><circle cx="34" cy="60" r="3" fill="#dd6b40"/><circle cx="58" cy="46" r="3" fill="#dd6b40"/><circle cx="72" cy="58" r="2" fill="#dd6b40"/>'},
  sauce:{base:'#e8a947',detail:'<path d="M5 48c16-9 26-11 44-11s31 3 46 11v48H5Z" fill="#c94f38"/><ellipse cx="50" cy="46" rx="35" ry="11" fill="#ed8250"/><path d="M22 46c8-5 15 4 23-1s13 4 21 0" fill="none" stroke="#f9bb75" stroke-width="3" stroke-linecap="round"/><path d="M5 63c27 8 63 8 90 0v31H5Z" fill="#e5b46e"/>'},
  mushroom:{base:'#dec6a1',detail:'<path d="M4 55c2-16 11-24 22-24s20 8 22 24c-4 5-11 6-22 6S8 60 4 55Z" fill="#a36c4d"/><path d="M15 58h21l3 25c0 5-6 8-13 8s-13-3-13-8Z" fill="#f4e8cd"/><path d="M37 43c2-16 11-25 23-25 11 0 20 9 22 25-4 5-12 6-22 6s-19-1-23-6Z" fill="#b57c54"/><path d="M49 47h21l3 26c0 5-6 8-13 8s-14-3-13-8Z" fill="#f4e8cd"/><path d="M14 49c2-5 6-8 11-9M47 36c2-5 6-8 11-9" fill="none" stroke="#e5bd8d" stroke-width="3" stroke-linecap="round"/>'},
  sausage:{base:'#bf5948',detail:'<path d="M4 76 72 6l10 10L15 86ZM13 89l76-62 10 13-76 60ZM-1 62 56 5l10 10L8 76Z" fill="#d77a58"/><path d="m25 62 10 5m2-17 10 5m3-17 10 5m1-17 10 5M35 75l9 7m5-19 9 7m5-19 9 7" stroke="#9c483e" stroke-width="4" stroke-linecap="round"/>'},
  'sesame-sauce':{base:'#d3ad72',detail:'<path d="M18 8h64v23H18z" fill="#64442e"/><path d="M17 37h66v50H17z" fill="#e7ca90"/><path d="M24 49h52v26H24z" fill="#faedcb"/><path d="M23 39h54v8H23zM23 77h54v7H23z" fill="#9c6d43"/><g fill="#ae8656"><ellipse cx="37" cy="57" rx="2.3" ry="3"/><ellipse cx="48" cy="65" rx="2.3" ry="3"/><ellipse cx="59" cy="56" rx="2.3" ry="3"/><ellipse cx="66" cy="65" rx="2.3" ry="3"/><ellipse cx="33" cy="68" rx="2.3" ry="3"/></g>'},
  meat:{base:'#ab3f48',detail:'<path d="M5 24C25 11 39 23 55 21s29-12 43-3v75H2Z" fill="#d05d60"/><path d="M2 47c16-11 24-6 36-10 12-3 17-12 31-10 11 2 20 9 33 3M-3 70c14 4 25-3 36-12 9-8 22-6 31-11 12-6 26 0 39-8M4 88c15-7 21-8 32-6 15 3 20-11 30-13 13-2 23 1 36-5" fill="none" stroke="#ffe5c7" stroke-width="5" stroke-linecap="round"/><path d="M12 54c8-3 11-8 17-7M54 57c5-3 10-6 15-5M43 76c4 0 7-3 10-5" fill="none" stroke="#f8c6ad" stroke-width="2.5" stroke-linecap="round"/>'}
};
const decoyByReward={'pickled-radish':'onion','onion':'pickled-radish','lettuce':'mushroom','mushroom':'lettuce','perilla':'garlic','garlic':'perilla','scallion':'sausage','sausage':'scallion','sauce':'sesame-sauce','sesame-sauce':'sauce'};
const hardDecoys=['mushroom','lettuce','onion','garlic','sauce'];
const decoyNames={'pickled-radish':'쌈무',lettuce:'상추',perilla:'깻잎',onion:'양파',garlic:'마늘',scallion:'파절임',sauce:'소스',mushroom:'버섯',sausage:'소시지','sesame-sauce':'참소스',meat:'고기'};
fs.mkdirSync('dist/assets/rewards',{recursive:true});fs.mkdirSync('dist/assets/reveals',{recursive:true});
for(const [key,outline] of Object.entries(outlines))fs.writeFileSync(`dist/assets/rewards/${key}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#19213b">${outline}</g></svg>\n`);
for(const [id,mission] of Object.entries(missions)){
  mission.decoyKey=mission.rewardKey==='meat'?hardDecoys[Number(id.slice(-1))-1]:decoyByReward[mission.rewardKey];
  mission.revealLine=`${decoyNames[mission.decoyKey]}인 척한 ${mission.reward.replace(' 1개','')}!`;
  const outline=outlines[mission.decoyKey],picture=art[mission.rewardKey];
  if(!outline||!picture)throw new Error(`Missing artwork for ${id}`);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="shape">${outline}</clipPath></defs><g clip-path="url(#shape)"><path fill="${picture.base}" d="M0 0h100v100H0z"/>${picture.detail}</g></svg>\n`;
  fs.writeFileSync(`dist/assets/reveals/${id}.svg`,svg);
}
fs.writeFileSync('data/missions.json',JSON.stringify(missions,null,2)+'\n');
console.log(`Created ${Object.keys(outlines).length} silhouettes and ${Object.keys(missions).length} matching reveals.`);
