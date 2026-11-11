import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createShareGate} from '../scripts/share-gate.mjs';
const origin='https://example.trycloudflare.com', code='1234567890abcdef12345678';
let upstream,gate,port;
const listen=s=>new Promise(ok=>s.listen(0,'127.0.0.1',ok));
before(async()=>{
 upstream=http.createServer((req,res)=>res.end('PRIVATE ORIGIN '+req.url));await listen(upstream);
 gate=createShareGate({code,origin:()=>origin,upstreamPort:upstream.address().port});await listen(gate);port=gate.address().port;
});
after(async()=>{await Promise.all([gate,upstream].map(s=>new Promise(ok=>s.close(ok))));});
function request(path='/',{method='GET',body,headers={}}={}){
 return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,headers:{host:new URL(origin).host,...headers}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});req.on('error',reject);req.end(body);});
}
const form=(value,extra={})=>({method:'POST',body:new URLSearchParams({code:value}).toString(),headers:{origin,'content-type':'application/x-www-form-urlencoded',...extra}});
test('Internet demo hides origin pages and API before unlocking',async()=>{
 for(const path of ['/','/public/app.js','/api/cars']) {const r=await request(path);assert.ok(!r.text.includes('PRIVATE ORIGIN'));assert.equal(r.status,path.startsWith('/api/')?401:200);}
});
test('Internet demo rejects a wrong access code',async()=>{assert.equal((await request('/__demo/unlock',form('wrong'))).status,401);});
test('Internet demo rejects cross-origin unlock requests and invalid hosts',async()=>{
 assert.equal((await request('/__demo/unlock',form(code,{origin:'https://attacker.invalid'}))).status,403);
 assert.equal((await request('/',{headers:{host:'attacker.invalid'}})).status,403);
});
test('Correct demo code issues a secure cookie and unlocks the origin',async()=>{
 const r=await request('/__demo/unlock',form(code));assert.equal(r.status,303);
 const c=r.headers['set-cookie'][0];assert.match(c,/HttpOnly; Secure; SameSite=Lax/);
 const page=await request('/api/cars',{headers:{cookie:c.split(';')[0]}});assert.equal(page.status,200);assert.equal(page.text,'PRIVATE ORIGIN /api/cars');
 assert.equal((await request('/api/cars',{headers:{cookie:'__Host-tim_demo=forged'}})).status,401);
});
test('Internet demo throttles repeated wrong codes',async()=>{
 for(let i=0;i<10;i++) assert.equal((await request('/__demo/unlock',form('wrong',{'cf-connecting-ip':'192.0.2.42'}))).status,401);
 assert.equal((await request('/__demo/unlock',form(code,{'cf-connecting-ip':'192.0.2.42'}))).status,429);
});
