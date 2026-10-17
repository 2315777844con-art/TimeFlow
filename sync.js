/* MyTime 2.0: Supabase cloud sync, with optimistic revision checks. */
(()=>{
const K='mytime-v1', C='mytime-cloud-config',S='mytime-sync-state';
let client=null, user=null, busy=false, dirty=false, timer=null, state={revision:0,account:null};
try{state={...state,...JSON.parse(localStorage.getItem(S)||'{}')}}catch{}
const $=id=>document.getElementById(id);
const status=(s)=>{if($('syncStatus'))$('syncStatus').textContent=s};
const local=()=>JSON.parse(localStorage.getItem(K)||'{"tasks":[],"logs":[],"days":{}}');
const saveState=()=>localStorage.setItem(S,JSON.stringify(state));
const configured=()=>{try{return JSON.parse(localStorage.getItem(C)||'null')}catch{return null}};
async function loadClient(){const c=configured();if(!c?.url||!c?.key)return false;
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url))throw Error('请填写 Supabase 项目的 HTTPS URL');
if(!window.supabase)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';s.onload=resolve;s.onerror=()=>reject(Error('无法加载同步组件，请检查网络'));document.head.appendChild(s)});
client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const {data:{user:u}}=await client.auth.getUser();user=u;renderAuth();return true}
function renderAuth(){if($('accountStatus'))$('accountStatus').textContent=user?`已登录：${user.email}`:'尚未登录';$('signOut').hidden=!user;$('signIn').hidden=!!user;$('signUp').hidden=!!user}
function showConflict(remote){status('发现不同设备的修改，请选择保留哪一份');$('conflict').hidden=false;$('conflict').dataset.remote=JSON.stringify(remote)}
async function getRemote(){const {data,error}=await client.from('mytime_data').select('payload,revision').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
async function pull(){if(!user)return;busy=true;try{const remote=await getRemote();if(!remote){status('云端尚无数据，可上传本地记录');return}if(dirty){showConflict(remote);return}localStorage.setItem(K,JSON.stringify(remote.payload));state={revision:remote.revision,account:user.id};saveState();window.location.reload()}finally{busy=false}}
async function push(force=false){if(!user||busy)return;busy=true;status('正在同步…');try{
const remote=await getRemote();if(!force && remote && (state.account!==user.id || state.revision!==remote.revision)){showConflict(remote);return}
const expected=force?(remote?.revision||0):(state.revision||0);
const {data,error}=await client.rpc('mytime_save',{new_payload:local(),expected_revision:expected});if(error)throw error;
if(!data?.ok){showConflict({payload:data.payload,revision:data.revision});return}
state={revision:data.revision,account:user.id};saveState();dirty=false;status(`已同步 · ${new Date().toLocaleTimeString()}`)
}catch(e){status('同步失败：'+e.message)}finally{busy=false}}
async function initialize(){renderAuth();if(!configured()){status('仅本地保存 · 尚未配置云同步');return}try{await loadClient();if(!user){status('云端已配置 · 请登录');return}const remote=await getRemote();if(remote){if(state.account===user.id&&state.revision===remote.revision){status('已连接云端');return}showConflict(remote)}else status('云端暂无数据，点击「立即同步」上传本地记录')}catch(e){status('连接失败：'+e.message)}}
$('saveCloudConfig').onclick=async()=>{const url=$('cloudUrl').value.trim().replace(/\/$/,'');const key=$('cloudKey').value.trim();localStorage.setItem(C,JSON.stringify({url,key}));status('配置已保存');window.location.reload()};
$('signIn').onclick=async()=>{try{if(!client)await loadClient();const {error}=await client.auth.signInWithPassword({email:$('cloudEmail').value.trim(),password:$('cloudPassword').value});if(error)throw error;window.location.reload()}catch(e){status('登录失败：'+e.message)}};
$('signUp').onclick=async()=>{try{if(!client)await loadClient();const {error}=await client.auth.signUp({email:$('cloudEmail').value.trim(),password:$('cloudPassword').value});if(error)throw error;status('注册请求已提交。如开启邮箱验证，请先打开验证邮件再登录。')}catch(e){status('注册失败：'+e.message)}};
$('signOut').onclick=async()=>{if(client)await client.auth.signOut();user=null;state={revision:0,account:null};saveState();window.location.reload()};
$('syncNow').onclick=()=>push();
$('useCloud').onclick=()=>{const r=JSON.parse($('conflict').dataset.remote);localStorage.setItem(K,JSON.stringify(r.payload));state={revision:r.revision,account:user.id};saveState();dirty=false;window.location.reload()};
$('useLocal').onclick=()=>{if(confirm('用当前设备的数据覆盖云端数据？其他设备尚未同步的修改可能丢失。')){ $('conflict').hidden=true;push(true)}};
$('reloadCloud').onclick=()=>pull();
const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){orig.call(this,k,v);if(this===localStorage&&k===K&&user){dirty=true;clearTimeout(timer);timer=setTimeout(()=>push(),1800)}};
window.addEventListener('online',()=>{if(dirty)push()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&!dirty&&!busy)getRemote().then(r=>{if(r&&r.revision!==state.revision)showConflict(r)}).catch(()=>{})});
const conf=configured();if(conf){$('cloudUrl').value=conf.url||'';$('cloudKey').value=conf.key||''}initialize();
})();
