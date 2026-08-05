/* ============================================================
   reports.js — Documentos em PDF (jsPDF via CDN)
     · recibo de aluguel, por parcela;
     · extrato do proprietário-cliente, para prestar contas.
   ============================================================ */

/* Extrato do período de um proprietário-cliente. O cálculo vive em
   owners.js (computeOwnerStatement); aqui só desenhamos.

   O documento diz de onde vem cada número e o que ele NÃO é: são valores
   registrados no aplicativo, não extrato bancário. Prometer conciliação
   num papel que a pessoa guarda seria criar uma discussão para o futuro. */
function generateOwnerStatementPDF(ownerId,mesInicio,mesFim){
  if(typeof computeOwnerStatement!=='function'){return;}
  const ext=computeOwnerStatement(ownerId,mesInicio,mesFim);
  if(!ext.owner||!ext.owner.nome){showToast('Proprietário não encontrado.','error');return;}
  if(!window.jspdf||!window.jspdf.jsPDF){
    showToast('Gerador de PDF indisponível agora. Verifique sua conexão e tente novamente.','error');return;
  }
  try{
    const jsPDF=window.jspdf.jsPDF;
    const doc=new jsPDF();
    const cfg=state.config||{};
    const margem=20;
    let y=24;

    doc.setFont('helvetica','bold');doc.setFontSize(16);
    doc.text('EXTRATO DO PROPRIETÁRIO',margem,y); y+=9;
    doc.setFont('helvetica','normal');doc.setFontSize(11);
    doc.text(ext.owner.nome,margem,y); y+=6;
    doc.setFontSize(10);
    doc.text('Período: '+ownerStatementPeriodLabel(ext),margem,y); y+=6;
    if(cfg.locadorNome){
      doc.text('Administrado por: '+cfg.locadorNome+
        (cfg.locadorDocumento?(' — '+cfg.locadorDocumento):''),margem,y); y+=6;
    }
    y+=4;

    doc.setFont('helvetica','bold');doc.setFontSize(10);
    doc.text('Imóvel',margem,y);
    doc.text('Recebido',120,y,{align:'right'});
    doc.text('Em aberto',152,y,{align:'right'});
    doc.text('Despesas',margemDireita(doc),y,{align:'right'});
    y+=3;
    doc.setDrawColor(180);doc.line(margem,y,margemDireita(doc),y);y+=6;

    doc.setFont('helvetica','normal');
    if(!ext.linhas.length){
      doc.text('Nenhum imóvel vinculado a este proprietário.',margem,y);y+=8;
    }
    ext.linhas.forEach(function(l){
      /* Quebra de página: um proprietário com muitos imóveis não pode ter
         o rodapé escrito por cima da última linha. */
      if(y>250){doc.addPage();y=24;}
      doc.text(String(l.house.nome||'').slice(0,42),margem,y);
      doc.text(fmtMoney(l.recebido),120,y,{align:'right'});
      doc.text(l.pendente>0?fmtMoney(l.pendente):'—',152,y,{align:'right'});
      doc.text(l.despesas>0?fmtMoney(l.despesas):'—',margemDireita(doc),y,{align:'right'});
      y+=7;
    });

    y+=3;doc.line(margem,y,margemDireita(doc),y);y+=8;
    const fechamento=[
      ['Total previsto no período',fmtMoney(ext.previsto)],
      ['Total recebido',fmtMoney(ext.recebido)],
      ['Ainda em aberto',fmtMoney(ext.pendente)]
    ];
    if(ext.taxa>0){
      fechamento.push(['Taxa de administração ('+(Number(ext.owner.taxaAdministracao)||0)+'%)',
        '- '+fmtMoney(ext.taxa)]);
    }
    if(ext.despesas>0) fechamento.push(['Despesas do período','- '+fmtMoney(ext.despesas)]);
    fechamento.forEach(function(par){
      if(y>262){doc.addPage();y=24;}
      doc.text(par[0],margem,y);
      doc.text(par[1],margemDireita(doc),y,{align:'right'});
      y+=7;
    });
    y+=2;
    doc.setFont('helvetica','bold');doc.setFontSize(12);
    doc.text('REPASSE DO PERÍODO',margem,y);
    doc.text(fmtMoney(ext.repasse),margemDireita(doc),y,{align:'right'});
    y+=10;

    doc.setFont('helvetica','normal');doc.setFontSize(9);
    if(ext.owner.pixChave){ doc.text('PIX para repasse: '+ext.owner.pixChave,margem,y); y+=5; }
    if(ext.owner.banco||ext.owner.conta){
      doc.text(['Banco '+(ext.owner.banco||'—'),'agência '+(ext.owner.agencia||'—'),
        'conta '+(ext.owner.conta||'—')].join(' · '),margem,y); y+=5;
    }
    y+=3;
    doc.setTextColor(110);
    doc.text('Valores registrados no aplicativo de gestão. Este documento não é extrato',margem,y);y+=4;
    doc.text('bancário e não substitui a conferência com a sua conta.',margem,y);y+=4;
    doc.text('Emitido em '+fmtDateBR(todayISO())+'.',margem,y);

    const nome=String(ext.owner.nome||'proprietario').replace(/\s+/g,'-').toLowerCase();
    doc.save('extrato-'+nome+'-'+(ext.meses[0]||'')+'.pdf');
    showToast('Extrato gerado.','success');
  }catch(e){
    console.error(e);
    showToast('Não foi possível gerar o PDF.','error');
  }
}
/* Margem direita do papel A4 usado pelo jsPDF. */
function margemDireita(doc){
  return doc.internal.pageSize.getWidth()-20;
}

function generateReceiptPDF(houseId,mes,contractId,receiptId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const charge=chargeForMonth(h,mes,'aluguel',contractId);
  const receipts=charge?receiptsForCharge(h,charge).slice().sort(function(a,b){
    return String(a.dataPagamento||'').localeCompare(String(b.dataPagamento||''))
      ||String(a.id||'').localeCompare(String(b.id||''));
  }):[];
  if(!receiptId&&receipts.length>1){
    openModal(
      '<h3 class="modal-title">Escolha o recebimento</h3>'+
      '<p class="modal-text">Cada parcela gera seu próprio recibo, sem declarar quitado um valor que ainda está em aberto.</p>'+
      '<div class="list-card"><div class="ledger">'+receipts.map(function(item,index){
        return '<button class="ledger-row" onclick="generateReceiptPDF(\''+houseId+'\',\''+mes+'\',\''+(contractId||'')+'\',\''+item.id+'\')">'+
          '<div class="ledger-row-main">Parcela '+(index+1)+'<div class="ledger-row-sub">'+fmtDateBR(item.dataPagamento)+(item.forma?' · '+esc(item.forma):'')+'</div></div>'+
          '<strong class="ledger-row-value num">'+fmtMoney(item.valor)+'</strong></button>';
      }).join('')+'</div></div>'+
      '<div class="modal-actions"><span></span><button class="btn btn-ghost" onclick="closeModal()">Fechar</button></div>'
    );
    return;
  }
  const legacy=paymentForMonth(h,mes,contractId);
  const receipt=receiptId
    ?receipts.find(function(item){return item.id===receiptId;})
    :(receipts[0]||legacy);
  if(!receipt){showToast('Não há recebimento para gerar o recibo.','error');return;}
  if(!window.jspdf || !window.jspdf.jsPDF){ showToast('Gerador de PDF indisponível agora. Verifique sua conexão e tente novamente.', 'error'); return; }
  try{
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF();
    const cfg = state.config || {};
    const t = (contract?contractTenant(contract):tenantOf(h)) || {};
    const expected=charge?(Number(charge.valorPrevisto)||0):(contract?contractExpectedRent(contract,mes):aluguelValorMes(h,mes));
    const receivedTotal=charge?chargeReceivedTotal(h,charge):(Number(legacy&&legacy.valorPago)||0);
    const receiptValue=Number(receipt.valor==null?receipt.valorPago:receipt.valor)||0;
    const remaining=Math.max(0,expected-receivedTotal);
    const isInstallment=receipts.length>1||receiptValue+0.005<expected||remaining>0;
    const paidAt=receipt.dataPagamento||todayISO();
    let y = 24;
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text(isInstallment?'RECIBO DE PARCELA DE ALUGUEL':'RECIBO DE ALUGUEL', 20, y); y+=14;
    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    const linhas = [
      'Recebi de '+(t.nome||'inquilino(a)')+(t.documento?(' (documento: '+maskSensitiveDocument(t.documento)+')'):'')+' a quantia de',
      fmtMoney(receiptValue)+', referente '+(isInstallment?'a uma parcela do aluguel':'ao aluguel')+' do imóvel localizado em',
      (h.endereco||h.nome)+', correspondente ao mês de referência '+monthLabel(mes)+'.',
      '',
      'Valor previsto no mês: '+fmtMoney(expected),
      'Total recebido até agora: '+fmtMoney(receivedTotal),
      remaining>0?'Saldo ainda em aberto: '+fmtMoney(remaining):'Situação após o registro: quitado',
      receipt.forma?'Forma deste recebimento: '+receipt.forma:'',
      'Data deste recebimento: '+fmtDateBR(paidAt),
      'Emitido em: '+fmtDateBR(todayISO())
    ].filter(Boolean);
    linhas.forEach(function(l){ doc.text(l, 20, y); y+=8; });
    y+=18;
    doc.text('_________________________________', 20, y); y+=8;
    doc.text((cfg.locadorNome||'Locador(a)')+(cfg.locadorDocumento?(' — '+cfg.locadorDocumento):''), 20, y);
    doc.save('recibo-'+h.nome.replace(/\s+/g,'-').toLowerCase()+'-'+mes+(receipt.id?'-'+String(receipt.id).slice(0,8):'')+'.pdf');
    closeModal();
    showToast('Recibo gerado.', 'success');
  }catch(e){
    console.error(e);
    showToast('Não foi possível gerar o PDF.', 'error');
  }
}
