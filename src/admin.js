export function queueAdminPage(nonce) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>J-API · Fila de envios</title>
  <style nonce="${nonce}">
    :root { color-scheme: light; --ink:#17211b; --muted:#66736b; --line:#dce4de; --paper:#fff; --bg:#f3f6f4; --green:#176b45; --green-soft:#e4f3ea; --amber:#9a5b00; --amber-soft:#fff0cf; --red:#a23232; --red-soft:#fde7e5; --blue:#285d83; --blue-soft:#e5f1f8; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header { background:#123f2d; color:#fff; padding:28px max(24px,calc((100vw - 1280px)/2)); }
    header div { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; }
    h1 { margin:0 0 3px; font-size:25px; letter-spacing:-.02em; }
    header p { margin:0; color:#cce0d5; }
    #connection { font-size:12px; color:#cce0d5; white-space:nowrap; }
    main { max-width:1280px; margin:0 auto; padding:24px; }
    .cards { display:grid; grid-template-columns:repeat(4,minmax(130px,1fr)); gap:12px; margin-bottom:18px; }
    .card { background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:15px 17px; box-shadow:0 2px 8px #13251b0a; }
    .card span { display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
    .card strong { display:block; font-size:28px; margin-top:2px; }
    .sessions { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px; }
    .session-card { display:flex; align-items:center; gap:9px; min-width:180px; padding:10px 13px; background:var(--paper); border:1px solid var(--line); border-radius:10px; }
    .session-card > div { flex:1; }
    .session-card strong { font-size:13px; }
    .session-card small { display:block; color:var(--muted); }
    .session-card button { min-height:30px; margin:0; padding:4px 8px; border-color:#d9a7a3; background:#fff; color:var(--red); font-size:12px; }
    .session-dot { width:9px; height:9px; flex:0 0 auto; border-radius:50%; background:var(--amber); }
    .session-dot.ready { background:var(--green); }
    .session-dot.logged_out,.session-dot.stopped { background:var(--red); }
    .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:end; padding:14px; background:var(--paper); border:1px solid var(--line); border-radius:12px 12px 0 0; }
    label { display:grid; gap:4px; color:var(--muted); font-size:12px; }
    select,input,button { min-height:36px; border:1px solid #c9d4cc; border-radius:8px; background:#fff; color:var(--ink); padding:6px 10px; font:inherit; }
    button { cursor:pointer; margin-left:auto; color:#fff; border-color:var(--green); background:var(--green); font-weight:600; }
    button:disabled { opacity:.65; cursor:wait; }
    #qr-open { margin-left:0; background:#fff; color:var(--green); }
    dialog { width:min(430px,calc(100% - 28px)); border:0; border-radius:16px; padding:0; color:var(--ink); box-shadow:0 20px 60px #0b201680; }
    dialog::backdrop { background:#10251b99; }
    .qr-panel { padding:22px; text-align:center; }
    .qr-panel h2 { margin:0 0 4px; font-size:21px; }
    .qr-panel p { margin:0 0 16px; color:var(--muted); }
    .qr-session { display:grid; gap:5px; margin:0 0 14px; text-align:left; color:var(--muted); font-size:12px; }
    .qr-session input { width:100%; color:var(--ink); font-size:14px; }
    .qr-actions { display:flex; gap:8px; justify-content:center; }
    .qr-actions button { margin:0; }
    #qr-image { display:block; width:min(320px,100%); height:auto; margin:0 auto 14px; border:1px solid var(--line); border-radius:10px; }
    #qr-image[hidden] { display:none; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-top:0; border-radius:0 0 12px 12px; background:var(--paper); }
    table { width:100%; border-collapse:collapse; min-width:920px; }
    th,td { padding:11px 13px; text-align:left; border-bottom:1px solid #edf1ee; white-space:nowrap; }
    th { position:sticky; top:0; background:#f8faf8; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.045em; }
    tbody tr:hover { background:#fafcfb; }
    .badge { display:inline-block; min-width:82px; text-align:center; border-radius:999px; padding:4px 8px; font-size:12px; font-weight:650; }
    .pending { color:var(--amber); background:var(--amber-soft); }.processing { color:var(--blue); background:var(--blue-soft); }.sent { color:var(--green); background:var(--green-soft); }.failed { color:var(--red); background:var(--red-soft); }
    .error { max-width:280px; overflow:hidden; text-overflow:ellipsis; color:var(--red); }
    .empty { padding:42px; text-align:center; color:var(--muted); }
    footer { padding:13px 2px; color:var(--muted); font-size:12px; }
    @media (max-width:700px) { header div { align-items:flex-start; flex-direction:column; }.cards { grid-template-columns:repeat(2,1fr); } main { padding:14px; }.controls label { flex:1; min-width:130px; } button { margin-left:0; width:100%; }.session-card button { width:auto; } }
  </style>
</head>
<body>
  <header><div><section><h1>Fila de envios</h1><p>Acompanhamento local do J-API</p></section><span id="connection">Carregando…</span></div></header>
  <main>
    <section class="cards" aria-label="Resumo">
      <article class="card"><span>Pendentes</span><strong id="count-pending">0</strong></article>
      <article class="card"><span>Processando</span><strong id="count-processing">0</strong></article>
      <article class="card"><span>Enviadas</span><strong id="count-sent">0</strong></article>
      <article class="card"><span>Falhas</span><strong id="count-failed">0</strong></article>
    </section>
    <section class="sessions" id="sessions" aria-label="Sessões do WhatsApp"></section>
    <section class="controls" aria-label="Filtros">
      <label>Sessão<select id="session-filter"><option value="">Todas</option></select></label>
      <label>Status<select id="status-filter"><option value="">Todos</option><option value="pending">Pendente</option><option value="processing">Processando</option><option value="sent">Enviada</option><option value="failed">Falha</option></select></label>
      <button id="qr-open" type="button">Conectar WhatsApp</button>
      <button id="refresh" type="button">Atualizar agora</button>
    </section>
    <div class="table-wrap">
      <table><thead><tr><th>Status</th><th>Sessão</th><th>Destinatário</th><th>Tipo</th><th>Criado</th><th>Enviado</th><th>Tentativas</th><th>Último erro</th></tr></thead><tbody id="jobs"></tbody></table>
      <div class="empty" id="empty" hidden>Nenhum envio encontrado para os filtros selecionados.</div>
    </div>
    <footer>Atualização automática a cada 10 segundos · até 500 jobs recentes por sessão</footer>
  </main>
  <dialog id="qr-dialog" aria-labelledby="qr-title">
    <section class="qr-panel">
      <h2 id="qr-title">Conectar WhatsApp</h2>
      <p id="qr-status">Informe um nome novo para criar outra sessão.</p>
      <form id="qr-form">
        <label class="qr-session">Nome da sessão
          <input id="qr-session" name="session" required maxlength="32" pattern="[a-z0-9][a-z0-9_-]{0,31}" autocomplete="off" spellcheck="false" placeholder="Ex.: financeiro">
        </label>
        <div class="qr-actions"><button id="qr-generate" type="submit">Gerar QR Code</button><button id="qr-close" type="button">Fechar</button></div>
      </form>
      <img id="qr-image" alt="QR Code para vincular o WhatsApp" hidden>
    </section>
  </dialog>
  <script nonce="${nonce}">
    const state = { jobs: [], sessions: [], loading: false, qrTimer: null };
    const byId = (id) => document.getElementById(id);
    const labels = { pending:'Pendente', processing:'Processando', sent:'Enviada', failed:'Falha', text:'Texto', pix:'PIX', pdf:'PDF' };
    const maskPhone = (phone) => phone.length < 8 ? '••••' : phone.slice(0,4) + '•••••' + phone.slice(-4);
    const date = (value) => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(value)) : '—';

    function cell(row, value, className) { const td=document.createElement('td'); td.textContent=value; if(className) td.className=className; row.append(td); return td; }
    function renderSessions() {
      const container=byId('sessions'); container.replaceChildren();
      for(const session of state.sessions) {
        const card=document.createElement('article'); card.className='session-card';
        const dot=document.createElement('span'); dot.className='session-dot '+session.state; dot.setAttribute('aria-hidden','true');
        const text=document.createElement('div'); const name=document.createElement('strong'); name.textContent=session.id;
        const detail=document.createElement('small'); detail.textContent=(session.connected?'Conectada':'Não conectada')+' · '+session.state+' · fila '+session.queue;
        text.append(name,detail); card.append(dot,text);
        if(session.connected) { const disconnect=document.createElement('button'); disconnect.type='button'; disconnect.textContent='Desconectar'; disconnect.addEventListener('click',()=>disconnectSession(session.id)); card.append(disconnect); }
        container.append(card);
      }
    }
    function render() {
      renderSessions();
      for (const status of ['pending','processing','sent','failed']) byId('count-'+status).textContent=state.jobs.filter((job)=>job.status===status).length;
      const session=byId('session-filter').value, status=byId('status-filter').value;
      const jobs=state.jobs.filter((job)=>(!session||job.session===session)&&(!status||job.status===status));
      const body=byId('jobs'); body.replaceChildren();
      for (const job of jobs) {
        const row=document.createElement('tr');
        const statusCell=cell(row,''); const badge=document.createElement('span'); badge.className='badge '+job.status; badge.textContent=labels[job.status]||job.status; statusCell.append(badge);
        cell(row,job.session); cell(row,maskPhone(job.phone)); cell(row,labels[job.type]||job.type); cell(row,date(job.createdAt)); cell(row,date(job.sentAt)); cell(row,String(job.attempts));
        const error=cell(row,job.lastError||'—',job.lastError?'error':''); if(job.lastError) error.title=job.lastError;
        body.append(row);
      }
      byId('empty').hidden=jobs.length!==0; byId('jobs').hidden=jobs.length===0;
    }

    async function load() {
      if(state.loading) return; state.loading=true; const button=byId('refresh'); button.disabled=true;
      try {
        const sessionResponse=await fetch('/sessions',{cache:'no-store'}); if(!sessionResponse.ok) throw new Error('Não foi possível carregar as sessões');
        const {sessions}=await sessionResponse.json(); state.sessions=sessions;
        const current=byId('session-filter').value; const select=byId('session-filter'); select.replaceChildren(new Option('Todas',''));
        for(const session of sessions) select.add(new Option(session.id,session.id)); select.value=current;
        const responses=await Promise.all(sessions.map(async(session)=>{const response=await fetch('/sessions/'+encodeURIComponent(session.id)+'/queue?limit=500',{cache:'no-store'}); if(!response.ok) throw new Error('Falha ao consultar '+session.id); return (await response.json()).queue;}));
        state.jobs=responses.flat().sort((a,b)=>b.createdAt-a.createdAt); render();
        byId('connection').textContent='Atualizado às '+new Intl.DateTimeFormat('pt-BR',{timeStyle:'medium'}).format(new Date());
      } catch(error) { byId('connection').textContent='Erro: '+error.message; }
      finally { state.loading=false; button.disabled=false; }
    }
    async function disconnectSession(session) {
      if(!confirm('Desconectar a sessão '+session+'? Os envios dela ficarão indisponíveis até um novo vínculo por QR Code.')) return;
      try {
        const response=await fetch('/sessions/'+encodeURIComponent(session)+'/logout',{method:'POST'}); const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Falha ao desconectar a sessão');
        const current=state.sessions.find((item)=>item.id===session); if(current) { current.connected=false; current.state='reconnecting'; } render(); setTimeout(load,1500);
      } catch(error) { alert('Erro: '+error.message); }
    }
    function stopQrPolling() { if(state.qrTimer) clearTimeout(state.qrTimer); state.qrTimer=null; byId('qr-image').removeAttribute('src'); byId('qr-image').hidden=true; }
    async function loadQr(session) {
      if(!byId('qr-dialog').open) return;
      try {
        const response=await fetch('/sessions/'+encodeURIComponent(session)+'/qr',{cache:'no-store'});
        const result=await response.json(); if(!response.ok && response.status!==202) throw new Error(result.error||'Falha ao gerar QR Code');
        if(!result.required) { byId('qr-status').textContent='A sessão '+session+' já está conectada.'; stopQrPolling(); await load(); return; }
        if(result.dataUrl) { byId('qr-image').src=result.dataUrl; byId('qr-image').hidden=false; byId('qr-status').textContent='No celular, leia o código para conectar a sessão '+session+'.'; }
        else { byId('qr-status').textContent='Preparando o QR Code da sessão '+session+'…'; }
        state.qrTimer=setTimeout(()=>loadQr(session),3000);
      } catch(error) { byId('qr-status').textContent='Erro: '+error.message; state.qrTimer=setTimeout(()=>loadQr(session),5000); }
    }
    function beginQr() {
      stopQrPolling(); const input=byId('qr-session'); if(!input.reportValidity()) return;
      const session=input.value; byId('qr-title').textContent='Conectar · '+session; byId('qr-status').textContent='Preparando o QR Code da sessão '+session+'…'; loadQr(session);
    }
    function openQr() { stopQrPolling(); byId('qr-title').textContent='Conectar WhatsApp'; byId('qr-status').textContent='Use um nome novo para criar outra sessão ou informe uma sessão existente.'; byId('qr-session').value=byId('session-filter').value; byId('qr-dialog').showModal(); byId('qr-session').focus(); }
    byId('session-filter').addEventListener('change',render); byId('status-filter').addEventListener('change',render); byId('refresh').addEventListener('click',load);
    byId('qr-open').addEventListener('click',openQr); byId('qr-form').addEventListener('submit',(event)=>{event.preventDefault(); beginQr();}); byId('qr-close').addEventListener('click',()=>byId('qr-dialog').close()); byId('qr-dialog').addEventListener('close',stopQrPolling);
    load(); setInterval(load,10000);
  </script>
</body></html>`;
}
