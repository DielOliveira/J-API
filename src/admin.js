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
    .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:end; padding:14px; background:var(--paper); border:1px solid var(--line); border-radius:12px 12px 0 0; }
    label { display:grid; gap:4px; color:var(--muted); font-size:12px; }
    select,button { min-height:36px; border:1px solid #c9d4cc; border-radius:8px; background:#fff; color:var(--ink); padding:6px 10px; font:inherit; }
    button { cursor:pointer; margin-left:auto; color:#fff; border-color:var(--green); background:var(--green); font-weight:600; }
    button:disabled { opacity:.65; cursor:wait; }
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
    @media (max-width:700px) { header div { align-items:flex-start; flex-direction:column; }.cards { grid-template-columns:repeat(2,1fr); } main { padding:14px; }.controls label { flex:1; min-width:130px; } button { margin-left:0; width:100%; } }
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
    <section class="controls" aria-label="Filtros">
      <label>Sessão<select id="session-filter"><option value="">Todas</option></select></label>
      <label>Status<select id="status-filter"><option value="">Todos</option><option value="pending">Pendente</option><option value="processing">Processando</option><option value="sent">Enviada</option><option value="failed">Falha</option></select></label>
      <button id="refresh" type="button">Atualizar agora</button>
    </section>
    <div class="table-wrap">
      <table><thead><tr><th>Status</th><th>Sessão</th><th>Destinatário</th><th>Tipo</th><th>Criado</th><th>Enviado</th><th>Tentativas</th><th>Último erro</th></tr></thead><tbody id="jobs"></tbody></table>
      <div class="empty" id="empty" hidden>Nenhum envio encontrado para os filtros selecionados.</div>
    </div>
    <footer>Atualização automática a cada 10 segundos · até 500 jobs recentes por sessão</footer>
  </main>
  <script nonce="${nonce}">
    const state = { jobs: [], loading: false };
    const byId = (id) => document.getElementById(id);
    const labels = { pending:'Pendente', processing:'Processando', sent:'Enviada', failed:'Falha', text:'Texto', pix:'PIX', pdf:'PDF' };
    const maskPhone = (phone) => phone.length < 8 ? '••••' : phone.slice(0,4) + '•••••' + phone.slice(-4);
    const date = (value) => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(value)) : '—';

    function cell(row, value, className) { const td=document.createElement('td'); td.textContent=value; if(className) td.className=className; row.append(td); return td; }
    function render() {
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
        const {sessions}=await sessionResponse.json();
        const current=byId('session-filter').value; const select=byId('session-filter'); select.replaceChildren(new Option('Todas',''));
        for(const session of sessions) select.add(new Option(session.id,session.id)); select.value=current;
        const responses=await Promise.all(sessions.map(async(session)=>{const response=await fetch('/sessions/'+encodeURIComponent(session.id)+'/queue?limit=500',{cache:'no-store'}); if(!response.ok) throw new Error('Falha ao consultar '+session.id); return (await response.json()).queue;}));
        state.jobs=responses.flat().sort((a,b)=>b.createdAt-a.createdAt); render();
        byId('connection').textContent='Atualizado às '+new Intl.DateTimeFormat('pt-BR',{timeStyle:'medium'}).format(new Date());
      } catch(error) { byId('connection').textContent='Erro: '+error.message; }
      finally { state.loading=false; button.disabled=false; }
    }
    byId('session-filter').addEventListener('change',render); byId('status-filter').addEventListener('change',render); byId('refresh').addEventListener('click',load);
    load(); setInterval(load,10000);
  </script>
</body></html>`;
}
