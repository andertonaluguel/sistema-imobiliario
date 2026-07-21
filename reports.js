/* ============================================================
   reports.js — Recibo de aluguel em PDF (jsPDF via CDN)
   ============================================================ */
function generateReceiptPDF(houseId, mes,contractId){
  const h = state.houses.find(function(x){ return x.id===houseId; });
  const contract=contractForMonth(h,mes,contractId);
  const rec = paymentForMonth(h,mes,contractId);
  if(!rec){ showToast('Esse mês ainda não foi marcado como pago.', 'error'); return; }
  if(!window.jspdf || !window.jspdf.jsPDF){ showToast('Gerador de PDF indisponível agora. Verifique sua conexão e tente novamente.', 'error'); return; }
  try{
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF();
    const cfg = state.config || {};
    const t = (contract?contractTenant(contract):tenantOf(h)) || {};
    let y = 24;
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text('RECIBO DE ALUGUEL', 20, y); y+=14;
    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    const linhas = [
      'Recebi de '+(t.nome||'inquilino(a)')+(t.documento?(' (CPF/RG: '+t.documento+')'):'')+' a quantia de',
      fmtMoney(rec.valorPago)+', referente ao aluguel do imóvel localizado em',
      (h.endereco||h.nome)+', correspondente ao mês de referência '+monthLabel(mes)+'.',
      '',
      'Data do pagamento: '+fmtDateBR(rec.dataPagamento),
      'Emitido em: '+fmtDateBR(todayISO())
    ];
    linhas.forEach(function(l){ doc.text(l, 20, y); y+=8; });
    y+=18;
    doc.text('_________________________________', 20, y); y+=8;
    doc.text((cfg.locadorNome||'Locador(a)')+(cfg.locadorDocumento?(' — '+cfg.locadorDocumento):''), 20, y);
    doc.save('recibo-'+h.nome.replace(/\s+/g,'-').toLowerCase()+'-'+mes+'.pdf');
    showToast('Recibo gerado.', 'success');
  }catch(e){
    console.error(e);
    showToast('Não foi possível gerar o PDF.', 'error');
  }
}
