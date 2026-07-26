/* Seleciona a tela depois que o boot real terminou e adiciona protecoes visuais. */
(function(){
  const allowed={
    dashboard:{view:'dashboard'},
    houses:{view:'casas'},
    finance:{view:'financeiro'},
    detail:{view:'houseDetail',houseId:'house-jardim',tab:'geral'},
    interests:{view:'interessados'}
  };

  function installDemoGuards(){
    if(document.getElementById('demoCaptureBadge'))return;
    const badge=document.createElement('div');
    badge.id='demoCaptureBadge';
    badge.className='demo-capture-badge';
    badge.setAttribute('role','status');
    badge.textContent='DEMONSTRAÇÃO · DADOS FICTÍCIOS';
    document.body.appendChild(badge);
    document.documentElement.classList.add('demo-capture-mode');

    window.open=function(){
      if(typeof showToast==='function')showToast('Link externo desativado no ambiente demonstrativo.','success');
      return null;
    };
    window.confirm=function(){return false;};
    document.addEventListener('click',function(event){
      const link=event.target&&event.target.closest?event.target.closest('a[href]'):null;
      if(link && /^(https?:|mailto:|tel:)/i.test(link.getAttribute('href')||'')){
        event.preventDefault();
        event.stopImmediatePropagation();
        if(typeof showToast==='function')showToast('Link externo desativado no ambiente demonstrativo.','success');
      }
    },true);
  }

  function selectScreen(){
    installDemoGuards();
    const params=new URLSearchParams(location.search);
    const screen=(params.get('screen')||'dashboard').toLowerCase();

    if(screen==='catalog'){
      if(typeof state!=='undefined' && state.publicLoaded && !state.loading){
        document.body.dataset.captureReady='true';
      }
      return;
    }
    if(screen==='portal'){
      if(typeof state!=='undefined' && state.loaded && !state.loading){
        state.portalTab=params.get('tab')||'inicio';
        render();
        document.body.dataset.captureReady='true';
      }
      return;
    }

    const route=allowed[screen]||allowed.dashboard;
    if(typeof state==='undefined' || !state.loaded || state.loading)return;
    state.uiMode='advanced';
    state.view=route.view;
    state.activeHouseId=route.houseId||null;
    state.activeTab=params.get('tab')||route.tab||'geral';
    state.alertsExpanded=screen==='dashboard';
    state.movsExpanded=screen==='dashboard';
    state.reportListExpanded=false;
    render();
    document.body.dataset.captureReady='true';
  }

  const timer=setInterval(function(){
    selectScreen();
    if(document.body.dataset.captureReady==='true')clearInterval(timer);
  },25);
  setTimeout(function(){clearInterval(timer);selectScreen();},5000);
})();
