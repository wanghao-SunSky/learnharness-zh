// Patch only the personal shell; keep the previously verified web/service bundle.
import { extractAll, createPackage, extractFile, uncache } from '@electron/asar';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const app=resolve(process.argv[2]);
if(!app.endsWith('/LearnHarness Personal.app'))throw new Error('Only the personal app may be repackaged');
const asar=join(app,'Contents/Resources/app.asar');
const stage=await fs.mkdtemp(join(tmpdir(),'lh-acp-shell-'));
try{
 extractAll(asar,stage);
 for(const file of ['main.cjs','acp-bridge.cjs'])await fs.copyFile(join(root,'electron',file),join(stage,'electron',file));
 await createPackage(stage,asar+'.new');await fs.rename(asar+'.new',asar);uncache(asar);
 for(const file of ['main.cjs','acp-bridge.cjs'])if(!extractFile(asar,'electron/'+file).equals(await fs.readFile(join(root,'electron',file))))throw new Error('Shell mismatch');
}finally{await fs.rm(stage,{recursive:true,force:true});}
