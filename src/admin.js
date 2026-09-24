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
    .date-panel { display:flex; align-items:end; gap:12px; margin-bottom:18px; padding:14px 17px; background:var(--paper); border:1px solid var(--line); border-radius:12px; box-shadow:0 2px 8px #13251b0a; }
    .date-panel p { margin:0 auto 2px 0; color:var(--muted); }
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
    .blocked-panel { margin-top:20px; background:var(--paper); border:1px solid var(--line); border-radius:12px; overflow:hidden; box-shadow:0 2px 8px #13251b0a; }
    .blocked-heading { display:flex; align-items:center; gap:12px; padding:15px 17px; border-bottom:1px solid var(--line); }
    .blocked-heading div { flex:1; }
    .blocked-heading h2 { margin:0; font-size:17px; }
    .blocked-heading p { margin:2px 0 0; color:var(--muted); font-size:12px; }
    .blocked-count { color:var(--red); background:var(--red-soft); border-radius:999px; padding:4px 9px; }
    .unblock { min-height:30px; margin:0; padding:4px 9px; border-color:#d9a7a3; background:#fff; color:var(--red); font-size:12px; }
    .monitor-panel { margin-top:20px; background:var(--paper); border:1px solid var(--line); border-radius:12px; overflow:hidden; box-shadow:0 2px 8px #13251b0a; }
    .monitor-heading { padding:15px 17px 8px; }
    .monitor-heading h2 { margin:0; font-size:17px; }
    .monitor-heading p { margin:2px 0 0; color:var(--muted); font-size:12px; }
    .monitor-controls { display:flex; flex-wrap:wrap; align-items:end; gap:10px; padding:8px 17px 15px; border-bottom:1px solid var(--line); }
    .monitor-controls label { min-width:180px; }
    .monitor-controls input { width:210px; }
    .monitor-controls button { margin:0; }
    #monitor-stop { color:var(--red); background:#fff; border-color:#d9a7a3; }
    #monitor-status { margin-left:auto; color:var(--muted); font-size:12px; }
    .monitor-numbers { display:flex; flex-wrap:wrap; gap:8px; padding:0 17px 15px; }
    .monitor-number { display:flex; align-items:center; gap:7px; padding:6px 8px 6px 11px; border-radius:999px; background:var(--green-soft); color:var(--green); font-weight:600; }
    .monitor-number button { min-height:25px; padding:1px 7px; margin:0; border-color:#b9d4c4; background:#fff; color:var(--red); }
    .message-text { max-width:520px; overflow:hidden; text-overflow:ellipsis; }
    .message-image { display:block; width:54px; height:54px; border-radius:7px; object-fit:cover; border:1px solid var(--line); }
    .received { color:var(--blue); background:var(--blue-soft); }.sent-message { color:var(--green); background:var(--green-soft); }
    footer { padding:13px 2px; color:var(--muted); font-size:12px; }
    @media (max-width:700px) { header div { align-items:flex-start; flex-direction:column; }.date-panel { align-items:stretch; flex-direction:column; }.date-panel p { margin-right:0; }.cards { grid-template-columns:repeat(2,1fr); } main { padding:14px; }.controls label { flex:1; min-width:130px; } button { margin-left:0; width:100%; }.session-card button { width:auto; } }
  </style>
</head>
<body>
  <header><div><section><h1>Fila de envios</h1><p>Acompanhamento local do J-API</p></section><span id="connection">Carregando…</span></div></header>
  <main>
    <section class="date-panel" aria-label="Período">
      <p>Escolha o dia dos envios exibidos no resumo e na tabela.</p>
      <label>Dia<input id="date-filter" type="date"></label>
    </section>
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
    <section class="blocked-panel" aria-labelledby="blocked-title">
      <div class="blocked-heading"><div><h2 id="blocked-title">Destinatários bloqueados</h2><p>Números confirmados como não registrados no WhatsApp.</p></div><strong class="blocked-count" id="blocked-count">0</strong></div>
      <div class="table-wrap">
        <table><thead><tr><th>Destinatário</th><th>Motivo</th><th>Bloqueado em</th><th>Ação</th></tr></thead><tbody id="blocked-recipients"></tbody></table>
        <div class="empty" id="blocked-empty">Nenhum destinatário bloqueado.</div>
      </div>
    </section>
    <section class="monitor-panel" aria-labelledby="monitor-title">
      <div class="monitor-heading"><h2 id="monitor-title">Monitor de conversa</h2><p>Armazena mensagens novas enviadas e recebidas de um número específico por sessão.</p></div>
      <form class="monitor-controls" id="monitor-form">
        <label>Sessão<select id="monitor-session" required></select></label>
        <label>Número com DDI<input id="monitor-phone" required inputmode="numeric" pattern="[1-9][0-9]{9,14}" maxlength="15" placeholder="5562999999999"></label>
        <button id="monitor-save" type="submit">Ativar monitoramento</button>
        <button id="monitor-stop" type="button">Desativar todos</button>
        <span id="monitor-status">Selecione uma sessão.</span>
      </form>
      <div class="monitor-numbers" id="monitor-numbers"></div>
      <div class="table-wrap">
        <table><thead><tr><th>Direção</th><th>Data</th><th>Tipo</th><th>Foto</th><th>Mensagem</th><th>ID</th></tr></thead><tbody id="messages"></tbody></table>
        <div class="empty" id="messages-empty">Nenhuma mensagem armazenada para esta sessão.</div>
      </div>
    </section>
    <footer>Atualização automática a cada 10 segundos · histórico do dia selecionado</footer>
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
    const state = { jobs: [], sessions: [], blockedRecipients: [], messages: [], monitors: [], loading: false, monitorLoading: false, qrTimer: null };
    const byId = (id) => document.getElementById(id);
    const labels = { pending:'Pendente', processing:'Processando', sent:'Enviada', failed:'Falha', text:'Texto', pix:'PIX', pdf:'PDF' };
    const maskPhone = (phone) => phone.length < 8 ? '••••' : phone.slice(0,4) + '•••••' + phone.slice(-4);
    const date = (value) => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(value)) : '—';
    const localDateValue = (value=new Date()) => { const offset=value.getTimezoneOffset()*60000; return new Date(value.getTime()-offset).toISOString().slice(0,10); };
    const selectedRange = () => { const [year,month,day]=byId('date-filter').value.split('-').map(Number); const start=new Date(year,month-1,day); const end=new Date(year,month-1,day+1); return {start:start.getTime(),end:end.getTime()}; };

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
    function renderBlockedRecipients() {
      const body=byId('blocked-recipients'); body.replaceChildren();
      for(const recipient of state.blockedRecipients) {
        const row=document.createElement('tr');
        cell(row,maskPhone(recipient.phone));
        cell(row,recipient.reason); cell(row,date(recipient.blockedAt));
        const action=cell(row,''); const button=document.createElement('button'); button.type='button'; button.className='unblock'; button.textContent='Desbloquear'; button.addEventListener('click',()=>unblockRecipient(recipient.phone)); action.append(button);
        body.append(row);
      }
      byId('blocked-count').textContent=String(state.blockedRecipients.length);
      byId('blocked-empty').hidden=state.blockedRecipients.length!==0; body.hidden=state.blockedRecipients.length===0;
    }
    function render() {
      renderSessions();
      renderBlockedRecipients();
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
    function renderMessages() {
      const body=byId('messages'); body.replaceChildren();
      for(const message of state.messages) {
        const row=document.createElement('tr');
        const directionCell=cell(row,''); const badge=document.createElement('span'); badge.className='badge '+(message.direction==='sent'?'sent-message':'received'); badge.textContent=message.direction==='sent'?'Enviada':'Recebida'; directionCell.append(badge);
        cell(row,date(message.messageAt)); cell(row,message.messageType);
        const mediaCell=cell(row,''); if(message.mediaUrl) { const link=document.createElement('a'); link.href=message.mediaUrl; link.target='_blank'; link.rel='noopener'; const image=document.createElement('img'); image.className='message-image'; image.src=message.mediaUrl; image.alt='Foto armazenada'; image.loading='lazy'; link.append(image); mediaCell.append(link); } else mediaCell.textContent='—';
        const text=cell(row,message.text||'—','message-text'); if(message.text) text.title=message.text;
        cell(row,message.messageId); body.append(row);
      }
      byId('messages-empty').hidden=state.messages.length!==0; body.hidden=state.messages.length===0;
      const numbers=byId('monitor-numbers'); numbers.replaceChildren();
      for(const monitor of state.monitors) { const item=document.createElement('span'); item.className='monitor-number'; const value=document.createElement('span'); value.textContent=maskPhone(monitor.phone); const remove=document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.title='Remover este número'; remove.addEventListener('click',()=>removeMonitor(monitor.phone)); item.append(value,remove); numbers.append(item); }
      byId('monitor-stop').disabled=state.monitors.length===0;
      byId('monitor-status').textContent=state.monitors.length?state.monitors.length+' número(s) monitorado(s).':'Monitoramento desativado.';
    }

    async function loadMonitor() {
      if(state.monitorLoading) return; const session=byId('monitor-session').value;
      if(!session) { state.monitors=[]; state.messages=[]; renderMessages(); return; }
      state.monitorLoading=true;
      try {
        const [monitorResponse,messagesResponse]=await Promise.all([
          fetch('/sessions/'+encodeURIComponent(session)+'/message-monitor',{cache:'no-store'}),
          fetch('/sessions/'+encodeURIComponent(session)+'/messages?limit=100',{cache:'no-store'})
        ]);
        const monitorResult=await monitorResponse.json(); const messagesResult=await messagesResponse.json();
        if(!monitorResponse.ok) throw new Error(monitorResult.error||'Falha ao consultar o monitoramento');
        if(!messagesResponse.ok) throw new Error(messagesResult.error||'Falha ao consultar as mensagens');
        state.monitors=monitorResult.monitors; state.messages=messagesResult.messages; renderMessages();
      } catch(error) { byId('monitor-status').textContent='Erro: '+error.message; }
      finally { state.monitorLoading=false; }
    }

    async function load() {
      if(state.loading) return; state.loading=true; const button=byId('refresh'); button.disabled=true;
      try {
        const [sessionResponse,blockedResponse]=await Promise.all([fetch('/sessions',{cache:'no-store'}),fetch('/blocked-recipients',{cache:'no-store'})]);
        if(!sessionResponse.ok) throw new Error('Não foi possível carregar as sessões'); if(!blockedResponse.ok) throw new Error('Não foi possível carregar os destinatários bloqueados');
        const {sessions}=await sessionResponse.json(); const {blockedRecipients}=await blockedResponse.json(); state.sessions=sessions; state.blockedRecipients=blockedRecipients;
        const current=byId('session-filter').value; const select=byId('session-filter'); select.replaceChildren(new Option('Todas',''));
        for(const session of sessions) select.add(new Option(session.id,session.id)); select.value=current;
        const monitorSelect=byId('monitor-session'); const monitoredSession=monitorSelect.value; monitorSelect.replaceChildren();
        for(const session of sessions) monitorSelect.add(new Option(session.id,session.id));
        monitorSelect.value=sessions.some((session)=>session.id===monitoredSession)?monitoredSession:(sessions[0]?.id||'');
        const range=selectedRange(); const query=new URLSearchParams({start:String(range.start),end:String(range.end)});
        const responses=await Promise.all(sessions.map(async(session)=>{const response=await fetch('/sessions/'+encodeURIComponent(session.id)+'/queue?'+query,{cache:'no-store'}); if(!response.ok) throw new Error('Falha ao consultar '+session.id); return (await response.json()).queue;}));
        state.jobs=responses.flat().sort((a,b)=>b.createdAt-a.createdAt); render(); await loadMonitor();
        byId('connection').textContent='Atualizado às '+new Intl.DateTimeFormat('pt-BR',{timeStyle:'medium'}).format(new Date());
      } catch(error) { byId('connection').textContent='Erro: '+error.message; }
      finally { state.loading=false; button.disabled=false; }
    }
    async function unblockRecipient(phone) {
      if(!confirm('Desbloquear '+maskPhone(phone)+'? Novos envios poderão ser feitos para esse número.')) return;
      try {
        const response=await fetch('/blocked-recipients/'+encodeURIComponent(phone),{method:'DELETE'}); const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Falha ao desbloquear o destinatário');
        state.blockedRecipients=state.blockedRecipients.filter((recipient)=>recipient.phone!==phone); render();
      } catch(error) { alert('Erro: '+error.message); }
    }
    async function disconnectSession(session) {
      if(!confirm('Desconectar a sessão '+session+'? Os envios dela ficarão indisponíveis até um novo vínculo por QR Code.')) return;
      try {
        const response=await fetch('/sessions/'+encodeURIComponent(session)+'/logout',{method:'POST'}); const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Falha ao desconectar a sessão');
        const current=state.sessions.find((item)=>item.id===session); if(current) { current.connected=false; current.state='reconnecting'; } render(); setTimeout(load,1500);
      } catch(error) { alert('Erro: '+error.message); }
    }
    async function saveMonitor(event) {
      event.preventDefault(); const session=byId('monitor-session').value; const phone=byId('monitor-phone');
      if(!session||!phone.reportValidity()) return; const button=byId('monitor-save'); button.disabled=true;
      try {
        const response=await fetch('/sessions/'+encodeURIComponent(session)+'/message-monitor',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({phone:phone.value})});
        const result=await response.json(); if(!response.ok) throw new Error(result.error||'Falha ao ativar o monitoramento');
        state.monitors=result.monitors; phone.value=''; await loadMonitor();
      } catch(error) { byId('monitor-status').textContent='Erro: '+error.message; }
      finally { button.disabled=false; }
    }
    async function stopMonitor() {
      const session=byId('monitor-session').value; if(!session||state.monitors.length===0) return;
      if(!confirm('Desativar todos os números monitorados da sessão '+session+'? As mensagens já armazenadas serão mantidas.')) return;
      const button=byId('monitor-stop'); button.disabled=true;
      try {
        const response=await fetch('/sessions/'+encodeURIComponent(session)+'/message-monitor',{method:'DELETE'}); const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Falha ao desativar o monitoramento'); state.monitors=[]; renderMessages();
      } catch(error) { byId('monitor-status').textContent='Erro: '+error.message; }
      finally { button.disabled=false; }
    }
    async function removeMonitor(phone) {
      const session=byId('monitor-session').value;
      if(!confirm('Parar de monitorar '+maskPhone(phone)+'? As mensagens armazenadas serão mantidas.')) return;
      try {
        const response=await fetch('/sessions/'+encodeURIComponent(session)+'/message-monitor/'+encodeURIComponent(phone),{method:'DELETE'}); const result=await response.json();
        if(!response.ok) throw new Error(result.error||'Falha ao remover o número'); await loadMonitor();
      } catch(error) { byId('monitor-status').textContent='Erro: '+error.message; }
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
    byId('date-filter').value=localDateValue(); byId('date-filter').addEventListener('change',load);
    byId('session-filter').addEventListener('change',render); byId('status-filter').addEventListener('change',render); byId('refresh').addEventListener('click',load);
    byId('monitor-session').addEventListener('change',loadMonitor); byId('monitor-form').addEventListener('submit',saveMonitor); byId('monitor-stop').addEventListener('click',stopMonitor);
    byId('qr-open').addEventListener('click',openQr); byId('qr-form').addEventListener('submit',(event)=>{event.preventDefault(); beginQr();}); byId('qr-close').addEventListener('click',()=>byId('qr-dialog').close()); byId('qr-dialog').addEventListener('close',stopQrPolling);
    load(); setInterval(load,10000);
  </script>
</body></html>`;
}
