// Optional helper for environments whose supplied HTTPS proxy hostname is absent
// from BuildKit DNS. Reuses the same proxy and CA; TLS verification stays enabled.
import {lookup} from 'node:dns/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
const args=['build'];const hosts=new Set();
for(const key of ['HTTPS_PROXY','HTTP_PROXY'])if(process.env[key])hosts.add(new URL(process.env[key]).hostname);
if(hosts.size){args.push('--network=host');for(const host of hosts){const {address}=await lookup(host,{family:4});args.push('--add-host',`${host}:${address}`);}}
for(const key of ['HTTPS_PROXY','HTTP_PROXY','NO_PROXY'])if(process.env[key])args.push('--build-arg',key);
if(process.env.NODE_EXTRA_CA_CERTS&&existsSync(process.env.NODE_EXTRA_CA_CERTS))args.push('--secret','id=build_ca,src='+process.env.NODE_EXTRA_CA_CERTS);
args.push('-t','anargya-fab:local','.');
const child=spawn('docker',args,{cwd:new URL('..',import.meta.url),stdio:'inherit',env:{...process.env,DOCKER_CONFIG:process.env.DOCKER_CONFIG||'/tmp/fab-docker-config'}});
child.on('error',()=>{console.error('Docker tidak tersedia.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
