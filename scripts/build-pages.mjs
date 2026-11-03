import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','style.css','app.js','articles.js'])await copyFile(file,'dist/'+file);
await cp('assets','dist/assets',{recursive:true});
await writeFile('dist/.nojekyll','');
console.log('Pages artifact ready: static files only');
