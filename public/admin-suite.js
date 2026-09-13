async function api(url,opts={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});if(!r.ok){let j={};try{j=await r.json()}catch{};throw new Error(j.message||('HTTP '+r.status))}return r.json()}
function money(c){return 'TZS '+(Number(c||0)/100).toLocaleString('en-TZ',{minimumFractionDigits:2,maximumFractionDigits:2})}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function protect(){try{await api('/api/admin/session')}catch{location.href='/admin-login.html'}}
function nav(){document.querySelectorAll('.nav a').forEach(a=>{if(a.getAttribute('href')===location.pathname)a.classList.add('active')})}
async function logout(){await fetch('/api/admin/logout',{method:'POST'});location.href='/admin-login.html'}
window.addEventListener('DOMContentLoaded',()=>{protect();nav()});
