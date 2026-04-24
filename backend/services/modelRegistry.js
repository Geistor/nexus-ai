const remote = require('./supabasePersistence');
const { registerModelVersion, setActiveModelVersion } = require('./persistenceManager');
const fs=require('fs'); const path=require('path');
function registryDir(projectRoot){ return path.join(projectRoot,'model','registry'); }
function activePath(projectRoot){ return path.join(registryDir(projectRoot),'active.json'); }
function versionsPath(projectRoot){ return path.join(registryDir(projectRoot),'versions.json'); }
function ensureRegistry(projectRoot){ const dir=registryDir(projectRoot); if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); if(!fs.existsSync(versionsPath(projectRoot))) fs.writeFileSync(versionsPath(projectRoot), JSON.stringify([],null,2)); if(!fs.existsSync(activePath(projectRoot))) fs.writeFileSync(activePath(projectRoot), JSON.stringify({},null,2)); }
function readVersions(projectRoot){ ensureRegistry(projectRoot); return JSON.parse(fs.readFileSync(versionsPath(projectRoot),'utf8')); }
function writeVersions(projectRoot, versions){ ensureRegistry(projectRoot); fs.writeFileSync(versionsPath(projectRoot), JSON.stringify(versions,null,2)); }
function getActive(projectRoot){ ensureRegistry(projectRoot); return JSON.parse(fs.readFileSync(activePath(projectRoot),'utf8')); }
function addVersion(projectRoot, item){ const versions=readVersions(projectRoot); versions.unshift(item); writeVersions(projectRoot, versions); }
function setActive(projectRoot, item){ ensureRegistry(projectRoot); fs.writeFileSync(activePath(projectRoot), JSON.stringify(item,null,2)); const versions=readVersions(projectRoot).map(v=>({ ...v, status: v.version===item.version ? 'active' : (v.status==='candidate' ? 'archived' : v.status) })); writeVersions(projectRoot, versions); }
module.exports={ ensureRegistry, getActive, addVersion, setActive, readVersions };
