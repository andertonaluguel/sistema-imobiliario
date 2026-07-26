import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const PROJECT = "C:/APP - CASAS DE ALUGUEL - GPT/aluguel/aluguel";
const MARKETING = path.join(PROJECT, "marketing");
const OUT_DECK = path.join(MARKETING, "apresentacao");
const OUT_ONEPAGE = path.join(MARKETING, "one-page");
const OUT_WHATSAPP = path.join(MARKETING, "whatsapp");

const C = {
  cover: "#14322A",
  coverLight: "#1F4339",
  paper: "#F4F6F3",
  white: "#FFFFFF",
  ink: "#1C2620",
  soft: "#5C6B63",
  faint: "#93A099",
  brass: "#B8863C",
  brassDeep: "#8C631F",
  brassSoft: "#F1E4C8",
  rust: "#A23B2E",
  rustSoft: "#F4DCD7",
  blue: "#3E6B8A",
  blueSoft: "#DCE7ED",
  line: "#DDE4DE",
  greenSoft: "#EAF5ED",
};

const ASSET_PATHS = {
  dashboard: path.join(MARKETING, "mockups/screenshots/dashboard-desktop.png"),
  houses: path.join(MARKETING, "mockups/screenshots/imoveis-desktop.png"),
  detail: path.join(MARKETING, "mockups/screenshots/imovel-detalhe-desktop.png"),
  detailMobile: path.join(MARKETING, "mockups/screenshots/detalhe-imovel-mobile.png"),
  finance: path.join(MARKETING, "mockups/screenshots/financeiro-detalhes-desktop.png"),
  interests: path.join(MARKETING, "mockups/screenshots/interessados-desktop.png"),
  catalog: path.join(MARKETING, "mockups/screenshots/catalogo-desktop.png"),
  portal: path.join(MARKETING, "mockups/screenshots/portal-inquilino-mobile.png"),
  mockHero: path.join(MARKETING, "mockups/finais/mockup-hero-dashboard.png"),
  mockPortfolio: path.join(MARKETING, "mockups/finais/mockup-carteira-imovel.png"),
  mockFinance: path.join(MARKETING, "mockups/finais/mockup-financeiro.png"),
  mockPortal: path.join(MARKETING, "mockups/finais/mockup-portal-mobile.png"),
  qr: path.join(MARKETING, "qr-codes/qr-app-aluguel.png"),
  logo: path.join(MARKETING, "branding/logo-simbolo-dourado.png"),
};

async function buffer(pathName) {
  const bytes = await fs.readFile(pathName);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function loadAssets() {
  const entries = await Promise.all(Object.entries(ASSET_PATHS).map(async ([key, value]) => [key, await buffer(value)]));
  return Object.fromEntries(entries);
}

async function writeBlob(filePath, blob) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function shape(slide, { x, y, w, h, fill = "none", radius = "rounded-xl", line = "none", lineWidth = 0, shadow, name }) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: lineWidth },
    ...(radius ? { borderRadius: radius } : {}),
    ...(shadow ? { shadow } : {}),
  });
}

function text(slide, value, { x, y, w, h, size = 20, color = C.ink, bold = false, align = "left", name, font = "Arial" }) {
  const box = slide.shapes.add({
    geometry: "textbox",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = value;
  box.text.style = { fontFamily: font, fontSize: size, color, bold, alignment: align };
  return box;
}

function image(slide, blob, alt, { x, y, w, h, fit = "contain", radius = "rounded-xl", name }) {
  return slide.images.add({
    blob,
    contentType: "image/png",
    alt,
    name,
    fit,
    position: { left: x, top: y, width: w, height: h },
    geometry: radius ? "roundRect" : "rect",
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function line(slide, x, y, w, h = 3, fill = C.brass) {
  shape(slide, { x, y, w, h, fill, radius: null });
}

function deckLogo(slide, assets, dark = false, x = 64, y = 40) {
  image(slide, assets.logo, "Símbolo do Aluguel", { x, y, w: 32, h: 32, fit: "contain", radius: null });
  text(slide, "Aluguel", { x: x + 42, y: y - 1, w: 180, h: 36, size: 23, color: dark ? C.white : C.ink, bold: true });
}

function footer(slide, index, dark = false, label = "APRESENTAÇÃO COMERCIAL") {
  text(slide, label, { x: 64, y: 680, w: 430, h: 20, size: 10, color: dark ? "#B9CCC3" : C.faint, bold: true });
  text(slide, String(index).padStart(2, "0"), { x: 1165, y: 678, w: 50, h: 20, size: 11, color: dark ? C.brass : C.brassDeep, bold: true, align: "right" });
}

function slideTitle(slide, kicker, titleValue, subtitle, index, dark = false) {
  text(slide, kicker.toUpperCase(), { x: 64, y: 54, w: 520, h: 22, size: 11, color: dark ? C.brass : C.brassDeep, bold: true });
  text(slide, titleValue, { x: 64, y: 88, w: 1060, h: 66, size: 40, color: dark ? C.white : C.ink, bold: true });
  if (subtitle) text(slide, subtitle, { x: 64, y: 154, w: 1040, h: 48, size: 18, color: dark ? "#C9D9D1" : C.soft });
  footer(slide, index, dark);
}

function browserFrame(slide, assetsBlob, alt, { x, y, w, h }) {
  shape(slide, { x, y, w, h, fill: C.white, line: "#C8D2CC", lineWidth: 1, radius: "rounded-2xl", shadow: "shadow-lg" });
  shape(slide, { x, y, w, h: 30, fill: "#E9EEEB", radius: "rounded-2xl" });
  for (let i = 0; i < 3; i += 1) shape(slide, { x: x + 16 + i * 14, y: y + 11, w: 7, h: 7, fill: ["#D99A8D", "#D9B868", "#83B08E"][i], radius: "rounded-full" });
  text(slide, "aluguel.app", { x: x + 68, y: y + 7, w: 180, h: 16, size: 9, color: C.soft });
  image(slide, assetsBlob, alt, { x: x + 2, y: y + 31, w: w - 4, h: h - 33, fit: "cover", radius: null });
}

function addCard(slide, { x, y, w, h, number, titleValue, body, fill = C.white, accent = C.brass, titleSize = 24 }) {
  shape(slide, { x, y, w, h, fill, line: C.line, lineWidth: 1, radius: "rounded-2xl" });
  line(slide, x, y, 7, h, accent);
  if (number) text(slide, number, { x: x + 26, y: y + 22, w: 60, h: 22, size: 11, color: accent, bold: true });
  text(slide, titleValue, { x: x + 26, y: y + (number ? 54 : 26), w: w - 52, h: 46, size: titleSize, color: C.ink, bold: true });
  text(slide, body, { x: x + 26, y: y + (number ? 104 : 77), w: w - 52, h: h - (number ? 120 : 92), size: 16, color: C.soft });
}

function addPlan(slide, x, name, houses, storage, description, featured = false) {
  const fill = featured ? C.cover : C.white;
  const color = featured ? C.white : C.ink;
  const soft = featured ? "#C9D9D1" : C.soft;
  shape(slide, { x, y: 240, w: 350, h: 320, fill, line: featured ? C.brass : C.line, lineWidth: featured ? 2 : 1, radius: "rounded-2xl", shadow: featured ? "shadow-md" : undefined });
  if (featured) text(slide, "MAIS EQUILÍBRIO", { x: x + 28, y: 262, w: 190, h: 20, size: 10, color: C.brass, bold: true });
  text(slide, name, { x: x + 28, y: featured ? 292 : 270, w: 260, h: 42, size: 31, color, bold: true });
  text(slide, `${houses} imóvel${houses === "1" ? "" : "is"}`, { x: x + 28, y: 350, w: 190, h: 34, size: 22, color: featured ? C.brass : C.brassDeep, bold: true });
  text(slide, storage, { x: x + 28, y: 392, w: 190, h: 24, size: 16, color: soft, bold: true });
  line(slide, x + 28, 432, 294, 2, featured ? "#36594E" : C.line);
  text(slide, description, { x: x + 28, y: 452, w: 294, h: 76, size: 16, color: soft });
  text(slide, name === "Gratuito" ? "Começar grátis" : "Condições sob consulta", { x: x + 28, y: 530, w: 294, h: 22, size: 14, color: featured ? C.brass : C.cover, bold: true });
}

async function buildMainDeck(assets) {
  const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

  // 01 — Capa
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    shape(s, { x: 880, y: 2, w: 380, h: 380, fill: "none", line: "#305A4C", lineWidth: 2, radius: "rounded-full" });
    shape(s, { x: 950, y: 42, w: 270, h: 270, fill: "none", line: "#3D6658", lineWidth: 1, radius: "rounded-full" });
    deckLogo(s, assets, true, 68, 52);
    text(s, "GESTÃO DE ALUGUÉIS", { x: 68, y: 154, w: 370, h: 24, size: 12, color: C.brass, bold: true });
    text(s, "Da casa vaga\nao pagamento\nrecebido.", { x: 68, y: 194, w: 485, h: 230, size: 58, color: C.white, bold: true });
    line(s, 68, 450, 84, 5, C.brass);
    text(s, "Uma visão organizada de imóveis, contratos, cobranças e documentos — feita para pequenos locadores.", { x: 68, y: 478, w: 450, h: 100, size: 20, color: "#C9D9D1" });
    browserFrame(s, assets.dashboard, "Painel demonstrativo do Aluguel", { x: 545, y: 150, w: 690, h: 440 });
    text(s, "PRODUTO REAL • DADOS DEMONSTRATIVOS", { x: 69, y: 660, w: 380, h: 20, size: 10, color: "#AFC5BA", bold: true });
    text(s, "Aluguel Comercial 1.0", { x: 1010, y: 660, w: 200, h: 20, size: 10, color: C.brass, bold: true, align: "right" });
  }

  // 02 — Problema
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    slideTitle(s, "O problema", "A informação existe. O difícil é encontrá-la na hora certa.", "Quando a operação se espalha, perguntas simples exigem conferências demoradas.", 2);
    addCard(s, { x: 64, y: 238, w: 350, h: 310, number: "01", titleValue: "Planilhas", body: "Recebimentos e despesas ficam separados do imóvel e do contrato que explicam cada valor.", fill: C.white });
    addCard(s, { x: 465, y: 238, w: 350, h: 310, number: "02", titleValue: "Conversas", body: "Cobranças, interessados e combinações importantes se perdem em históricos difíceis de consultar.", fill: C.brassSoft, accent: C.brassDeep });
    addCard(s, { x: 866, y: 238, w: 350, h: 310, number: "03", titleValue: "Arquivos", body: "Fotos, contratos, recibos e leituras ficam sem vínculo claro com a rotina de cada casa.", fill: C.white, accent: C.blue });
    text(s, "O resultado é menos clareza para decidir o próximo passo.", { x: 64, y: 594, w: 820, h: 34, size: 23, color: C.cover, bold: true });
  }

  // 03 — Solução / fluxo
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    slideTitle(s, "A solução", "Uma operação conectada, da entrada à consulta.", "O Aluguel reúne as etapas essenciais sem esconder as confirmações que ainda dependem do usuário.", 3, true);
    const steps = [
      ["01", "Cadastrar", "Imóvel e pessoas"],
      ["02", "Contratar", "Período e vencimento"],
      ["03", "Acompanhar", "Aluguel, energia e despesas"],
      ["04", "Cobrar", "WhatsApp e PIX manuais"],
      ["05", "Consultar", "Painel, relatórios e portal"],
    ];
    steps.forEach((item, i) => {
      const x = 64 + i * 235;
      shape(s, { x, y: 270, w: 202, h: 214, fill: i === 4 ? C.brassSoft : "#1B4035", line: i === 4 ? C.brass : "#36594E", lineWidth: 1, radius: "rounded-2xl" });
      text(s, item[0], { x: x + 22, y: 292, w: 52, h: 24, size: 11, color: i === 4 ? C.brassDeep : C.brass, bold: true });
      text(s, item[1], { x: x + 22, y: 346, w: 160, h: 40, size: 25, color: i === 4 ? C.ink : C.white, bold: true });
      text(s, item[2], { x: x + 22, y: 402, w: 160, h: 54, size: 15, color: i === 4 ? C.soft : "#C9D9D1" });
      if (i < 4) text(s, "→", { x: x + 206, y: 352, w: 28, h: 30, size: 22, color: C.brass, bold: true, align: "center" });
    });
    text(s, "Gestão assistida: o sistema organiza e prepara; o responsável confirma e envia.", { x: 64, y: 548, w: 1080, h: 32, size: 19, color: "#D6E2DC", bold: true });
  }

  // 04 — Painel
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    slideTitle(s, "Painel", "Comece o dia sabendo o que exige atenção.", "Previsto, recebido, pendências, ocupação, manutenção e movimentações em uma visão única.", 4);
    browserFrame(s, assets.dashboard, "Painel com indicadores e alertas", { x: 64, y: 222, w: 870, h: 430 });
    addCard(s, { x: 970, y: 222, w: 246, h: 198, titleValue: "O mês em contexto", body: "Aluguel, energia e recebido aparecem lado a lado.", fill: C.white, titleSize: 22 });
    addCard(s, { x: 970, y: 442, w: 246, h: 210, titleValue: "Ação priorizada", body: "Atrasos, próximos vencimentos e manutenção ficam visíveis.", fill: C.brassSoft, accent: C.rust, titleSize: 22 });
  }

  // 05 — Carteira
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    image(s, assets.mockPortfolio, "Mockup da carteira e do detalhe do imóvel", { x: 0, y: 0, w: 1280, h: 720, fit: "cover", radius: null });
    shape(s, { x: 930, y: 620, w: 286, h: 54, fill: C.cover, radius: "rounded-full" });
    text(s, "CAPTURAS REAIS • DADOS DEMO", { x: 951, y: 637, w: 240, h: 18, size: 10, color: C.white, bold: true, align: "center" });
  }

  // 06 — Financeiro
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    image(s, assets.mockFinance, "Mockup da gestão financeira", { x: 0, y: 0, w: 1280, h: 720, fit: "cover", radius: null });
    shape(s, { x: 885, y: 623, w: 331, h: 52, fill: C.cover, radius: "rounded-full" });
    text(s, "RECEBIMENTOS SÃO REGISTRADOS MANUALMENTE", { x: 904, y: 639, w: 292, h: 18, size: 9, color: C.white, bold: true, align: "center" });
  }

  // 07 — Cobrança assistida
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    slideTitle(s, "Cobrança assistida", "Prepare a cobrança. Mantenha o envio sob seu controle.", "O aplicativo monta o contexto e oferece atalhos; nenhuma mensagem ou baixa acontece sem ação humana.", 7, true);
    const list = [
      ["1", "Identifique a pendência", "O painel e a ficha mostram o mês e o valor."],
      ["2", "Abra a mensagem", "O WhatsApp recebe um texto pré-preenchido."],
      ["3", "Inclua o PIX", "Use o Copia e Cola quando a chave estiver configurada."],
      ["4", "Confirme o recebimento", "A baixa é registrada manualmente no aplicativo."],
    ];
    list.forEach((item, i) => {
      const y = 240 + i * 92;
      shape(s, { x: 64, y, w: 52, h: 52, fill: i === 3 ? C.brass : "#23493D", line: "#3A6254", lineWidth: 1, radius: "rounded-full" });
      text(s, item[0], { x: 64, y: y + 12, w: 52, h: 25, size: 17, color: i === 3 ? C.cover : C.brass, bold: true, align: "center" });
      text(s, item[1], { x: 136, y: y - 2, w: 355, h: 28, size: 21, color: C.white, bold: true });
      text(s, item[2], { x: 136, y: y + 30, w: 390, h: 38, size: 15, color: "#C9D9D1" });
    });
    browserFrame(s, assets.detail, "Ficha do imóvel com cobrança", { x: 565, y: 236, w: 650, h: 390 });
    shape(s, { x: 842, y: 584, w: 344, h: 60, fill: C.brassSoft, radius: "rounded-xl" });
    text(s, "Sem gateway • sem conciliação bancária automática", { x: 861, y: 603, w: 306, h: 20, size: 12, color: C.brassDeep, bold: true, align: "center" });
  }

  // 08 — Vagas e interessados
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    slideTitle(s, "Vacância e demanda", "Da casa vaga ao próximo contrato, sem perder o fio.", "Publique imóveis vagos, organize interessados e encontre combinações por regras de preço, cômodos e comodidades.", 8);
    browserFrame(s, assets.interests, "Funil de interessados", { x: 64, y: 230, w: 690, h: 410 });
    browserFrame(s, assets.catalog, "Catálogo público de imóveis", { x: 784, y: 230, w: 432, h: 270 });
    addCard(s, { x: 784, y: 520, w: 432, h: 120, titleValue: "Matching transparente", body: "Filtro por critérios definidos — não é inteligência artificial.", fill: C.brassSoft, titleSize: 21 });
  }

  // 09 — Portal
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    image(s, assets.mockPortal, "Mockup do portal do inquilino", { x: 0, y: 0, w: 1280, h: 720, fit: "cover", radius: null });
    shape(s, { x: 70, y: 624, w: 360, h: 51, fill: "#21473B", line: "#40675A", lineWidth: 1, radius: "rounded-full" });
    text(s, "ACESSO DE CONSULTA • PERFIL SEPARADO", { x: 92, y: 640, w: 318, h: 18, size: 10, color: C.white, bold: true, align: "center" });
  }

  // 10 — Cobertura
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    slideTitle(s, "Cobertura operacional", "O essencial da locação em uma única rotina.", "Cada módulo preserva o contexto do imóvel, do contrato e do período correspondente.", 10);
    const modules = [
      ["Imóveis", "Status, características, fotos, documentos e histórico", C.brass],
      ["Inquilinos", "Cadastro reutilizável, vínculos e portal", C.blue],
      ["Contratos", "Período, vencimento, proporcional e ciclos", C.cover],
      ["Financeiro", "Previsto, recebido, despesas, saldo e relatórios", C.rust],
      ["Energia", "Leituras, consumo, vencimento e comprovante", C.brassDeep],
      ["Interessados", "Funil, preferências, matching e conversão", C.blue],
    ];
    modules.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      addCard(s, { x: 64 + col * 392, y: 236 + row * 185, w: 352, h: 154, titleValue: m[0], body: m[1], fill: C.white, accent: m[2], titleSize: 23 });
    });
  }

  // 11 — Implantação
  {
    const s = deck.slides.add();
    s.background.fill = C.white;
    slideTitle(s, "Começar", "Da primeira casa à visão completa da carteira.", "Uma sequência simples, ajustada ao volume e ao nível de apoio contratado.", 11);
    line(s, 150, 357, 980, 4, C.line);
    const steps = [
      ["01", "Criar conta", "Comece grátis"],
      ["02", "Configurar", "Locador e PIX"],
      ["03", "Cadastrar", "Imóveis e pessoas"],
      ["04", "Organizar", "Contratos e histórico"],
      ["05", "Operar", "Painel e rotina"],
    ];
    steps.forEach((item, i) => {
      const x = 83 + i * 238;
      shape(s, { x, y: 315, w: 88, h: 88, fill: i === 4 ? C.cover : C.brassSoft, line: i === 4 ? C.cover : C.brass, lineWidth: 1, radius: "rounded-full" });
      text(s, item[0], { x, y: 340, w: 88, h: 30, size: 18, color: i === 4 ? C.brass : C.brassDeep, bold: true, align: "center" });
      text(s, item[1], { x: x - 42, y: 424, w: 172, h: 30, size: 19, color: C.ink, bold: true, align: "center" });
      text(s, item[2], { x: x - 52, y: 462, w: 192, h: 42, size: 14, color: C.soft, align: "center" });
    });
    shape(s, { x: 188, y: 552, w: 904, h: 58, fill: C.paper, line: C.line, lineWidth: 1, radius: "rounded-xl" });
    text(s, "Treinamento, migração, prazo e suporte são definidos na proposta comercial.", { x: 215, y: 570, w: 850, h: 22, size: 17, color: C.cover, bold: true, align: "center" });
  }

  // 12 — ICP
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    slideTitle(s, "Aderência", "Feito para pequenos locadores que operam a própria carteira.", "O melhor encaixe é uma rotina que precisa de centralização e controle, sem depender de integrações corporativas.", 12);
    shape(s, { x: 64, y: 235, w: 550, h: 350, fill: C.greenSoft, line: "#BFD8C6", lineWidth: 1, radius: "rounded-2xl" });
    text(s, "É para você se...", { x: 96, y: 270, w: 450, h: 40, size: 30, color: C.cover, bold: true });
    const yes = ["Administra uma carteira pequena", "Quer histórico por imóvel e contrato", "Registra recebimentos e despesas manualmente", "Precisa organizar vagas e interessados"];
    yes.forEach((v, i) => text(s, `✓  ${v}`, { x: 98, y: 333 + i * 52, w: 470, h: 32, size: 17, color: C.ink, bold: i === 0 }));
    shape(s, { x: 666, y: 235, w: 550, h: 350, fill: C.white, line: C.line, lineWidth: 1, radius: "rounded-2xl" });
    text(s, "Pode não ser o melhor encaixe se...", { x: 698, y: 270, w: 465, h: 62, size: 28, color: C.ink, bold: true });
    const no = ["Exige conciliação bancária automática", "Precisa de assinatura digital integrada", "Depende de integrações contábeis/ERP", "Quer edição totalmente offline"];
    no.forEach((v, i) => text(s, `—  ${v}`, { x: 700, y: 350 + i * 52, w: 470, h: 32, size: 17, color: C.soft }));
  }

  // 13 — Planos
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    slideTitle(s, "Planos", "Comece pequeno. Evolua conforme a carteira.", "Os limites abaixo são os definidos no produto. Valores e condições dos planos pagos são apresentados pela equipe comercial.", 13);
    addPlan(s, 64, "Gratuito", "1", "50 MB", "Para experimentar o fluxo com um imóvel.");
    addPlan(s, 465, "Básico", "3", "1 GB", "Para uma carteira pequena em operação cotidiana.", true);
    addPlan(s, 866, "Premium", "100", "10 GB", "Para ampliar a carteira e a capacidade de arquivos.");
    text(s, "Nenhum plano é descrito como ilimitado.", { x: 64, y: 602, w: 600, h: 25, size: 15, color: C.soft, bold: true });
  }

  // 14 — Confiança
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    slideTitle(s, "Confiança por projeto", "Dados separados, acesso por perfil e portabilidade.", "A comunicação permanece precisa: segurança é tratada por arquitetura e governança, sem promessas absolutas.", 14, true);
    const items = [
      ["Conta", "Dados operacionais separados por proprietário e políticas de acesso."],
      ["Arquivos", "Bucket privado e links temporários quando um documento é solicitado."],
      ["Backup", "Exportação manual e snapshots diários conforme a configuração atual."],
      ["Offline", "Consulta da última cópia disponível; alterações exigem internet."],
    ];
    items.forEach((item, i) => {
      const x = 64 + (i % 2) * 574;
      const y = 238 + Math.floor(i / 2) * 168;
      shape(s, { x, y, w: 540, h: 140, fill: i === 2 ? C.brassSoft : "#1B4035", line: i === 2 ? C.brass : "#36594E", lineWidth: 1, radius: "rounded-2xl" });
      text(s, item[0], { x: x + 28, y: y + 24, w: 160, h: 34, size: 25, color: i === 2 ? C.ink : C.white, bold: true });
      text(s, item[1], { x: x + 28, y: y + 68, w: 480, h: 56, size: 16, color: i === 2 ? C.soft : "#C9D9D1" });
    });
    text(s, "Sem alegação de certificação LGPD, criptografia ponta a ponta, disponibilidade ou ROI garantido.", { x: 64, y: 594, w: 1120, h: 32, size: 17, color: C.brass, bold: true });
  }

  // 15 — CTA
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    deckLogo(s, assets, false, 70, 48);
    text(s, "PRÓXIMO PASSO", { x: 70, y: 150, w: 260, h: 22, size: 11, color: C.brassDeep, bold: true });
    text(s, "Veja sua rotina\ndentro do Aluguel.", { x: 70, y: 190, w: 630, h: 130, size: 54, color: C.ink, bold: true });
    text(s, "Solicite uma demonstração guiada ou comece gratuitamente com 1 imóvel.", { x: 70, y: 340, w: 580, h: 70, size: 21, color: C.soft });
    shape(s, { x: 70, y: 450, w: 330, h: 64, fill: C.cover, radius: "rounded-xl" });
    text(s, "Solicitar demonstração", { x: 92, y: 470, w: 286, h: 24, size: 18, color: C.white, bold: true, align: "center" });
    shape(s, { x: 420, y: 450, w: 230, h: 64, fill: C.brassSoft, line: C.brass, lineWidth: 1, radius: "rounded-xl" });
    text(s, "Começar grátis", { x: 440, y: 470, w: 190, h: 24, size: 18, color: C.cover, bold: true, align: "center" });
    text(s, "andertonaluguel@gmail.com", { x: 70, y: 548, w: 430, h: 30, size: 17, color: C.cover, bold: true });
    text(s, "WhatsApp: inserir número oficial com DDD", { x: 70, y: 584, w: 430, h: 26, size: 14, color: C.soft });
    shape(s, { x: 785, y: 100, w: 370, h: 500, fill: C.white, line: C.line, lineWidth: 1, radius: "rounded-2xl", shadow: "shadow-md" });
    image(s, assets.qr, "QR Code para abrir o aplicativo Aluguel", { x: 837, y: 157, w: 266, h: 266, fit: "contain", radius: null });
    text(s, "ABRA O APLICATIVO", { x: 820, y: 452, w: 300, h: 24, size: 11, color: C.brassDeep, bold: true, align: "center" });
    text(s, "aluguel-casas-anderton.netlify.app", { x: 812, y: 486, w: 316, h: 48, size: 16, color: C.cover, bold: true, align: "center" });
    text(s, "QR validado para o destino oficial", { x: 815, y: 546, w: 310, h: 22, size: 12, color: C.soft, align: "center" });
    footer(s, 15, false, "APRESENTAÇÃO COMERCIAL • 22/07/2026");
  }

  return deck;
}

async function buildOnePage(assets) {
  const deck = Presentation.create({ slideSize: { width: 794, height: 1123 } });
  const s = deck.slides.add();
  s.background.fill = C.paper;
  shape(s, { x: 0, y: 0, w: 794, h: 196, fill: C.cover, radius: null });
  deckLogo(s, assets, true, 52, 38);
  text(s, "GESTÃO DE ALUGUÉIS", { x: 52, y: 95, w: 270, h: 20, size: 10, color: C.brass, bold: true });
  text(s, "Seus aluguéis sob controle.", { x: 52, y: 122, w: 610, h: 52, size: 38, color: C.white, bold: true });
  text(s, "Sem planilhas espalhadas.", { x: 52, y: 169, w: 610, h: 44, size: 31, color: C.brass, bold: true });

  browserFrame(s, assets.dashboard, "Painel do Aluguel", { x: 52, y: 238, w: 690, h: 365 });
  shape(s, { x: 52, y: 626, w: 214, h: 130, fill: C.white, line: C.line, lineWidth: 1, radius: "rounded-xl" });
  shape(s, { x: 290, y: 626, w: 214, h: 130, fill: C.brassSoft, line: C.brass, lineWidth: 1, radius: "rounded-xl" });
  shape(s, { x: 528, y: 626, w: 214, h: 130, fill: C.white, line: C.line, lineWidth: 1, radius: "rounded-xl" });
  const benefits = [
    [52, "Veja o mês", "Previsto, recebido, pendências e ocupação."],
    [290, "Centralize", "Imóvel, contrato, pagamentos e documentos."],
    [528, "Compartilhe", "Cobrança assistida e portal do inquilino."],
  ];
  benefits.forEach(([x, titleValue, body]) => {
    text(s, titleValue, { x: x + 18, y: 648, w: 178, h: 28, size: 19, color: C.cover, bold: true });
    text(s, body, { x: x + 18, y: 686, w: 178, h: 54, size: 13, color: C.soft });
  });

  text(s, "O que está incluído", { x: 52, y: 790, w: 320, h: 32, size: 23, color: C.ink, bold: true });
  const modules = ["Imóveis e inquilinos", "Contratos e recebimentos", "Energia e despesas", "Interessados e catálogo", "Relatórios e recibos", "Portal e documentos"];
  modules.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    shape(s, { x: 52 + col * 355, y: 836 + row * 46, w: 332, h: 36, fill: i === 0 ? C.brassSoft : C.white, line: C.line, lineWidth: 1, radius: "rounded-full" });
    text(s, `✓  ${item}`, { x: 68 + col * 355, y: 846 + row * 46, w: 300, h: 18, size: 13, color: C.cover, bold: i === 0 });
  });

  shape(s, { x: 52, y: 989, w: 690, h: 92, fill: C.cover, radius: "rounded-xl" });
  text(s, "Grátis: 1 imóvel • Básico: 3 • Premium: 100", { x: 72, y: 1007, w: 445, h: 25, size: 16, color: C.white, bold: true });
  text(s, "Valores dos planos pagos sob consulta.", { x: 72, y: 1041, w: 400, h: 20, size: 12, color: "#B9CCC3" });
  image(s, assets.qr, "QR Code do aplicativo", { x: 646, y: 998, w: 77, h: 77, fit: "contain", radius: null });
  text(s, "andertonaluguel@gmail.com", { x: 52, y: 1092, w: 360, h: 18, size: 12, color: C.soft, bold: true });
  text(s, "22/07/2026 • produto real, dados demonstrativos", { x: 420, y: 1092, w: 322, h: 18, size: 9, color: C.faint, bold: true, align: "right" });
  return deck;
}

function waHeader(slide, assets, dark = false) {
  deckLogo(slide, assets, dark, 70, 60);
  text(slide, "GESTÃO DE ALUGUÉIS", { x: 690, y: 67, w: 320, h: 22, size: 13, color: dark ? "#B9CCC3" : C.soft, bold: true, align: "right" });
}

function waFooter(slide, value, dark = false) {
  text(slide, value, { x: 70, y: 1287, w: 940, h: 24, size: 12, color: dark ? "#AFC5BA" : C.faint, bold: true });
}

async function buildWhatsapp(assets) {
  const deck = Presentation.create({ slideSize: { width: 1080, height: 1350 } });
  // 1
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    waHeader(s, assets, true);
    text(s, "APRESENTAÇÃO COMERCIAL", { x: 70, y: 170, w: 430, h: 24, size: 14, color: C.brass, bold: true });
    text(s, "Seus aluguéis\nsob controle.", { x: 70, y: 214, w: 830, h: 164, size: 68, color: C.white, bold: true });
    text(s, "Sem planilhas espalhadas.", { x: 70, y: 389, w: 760, h: 48, size: 35, color: C.brass, bold: true });
    text(s, "Da casa vaga ao pagamento recebido, com a rotina em uma visão única.", { x: 70, y: 458, w: 860, h: 66, size: 24, color: "#C9D9D1" });
    browserFrame(s, assets.dashboard, "Painel real do Aluguel", { x: 70, y: 575, w: 940, h: 585 });
    shape(s, { x: 70, y: 1197, w: 940, h: 74, fill: "#1B4035", line: "#36594E", lineWidth: 1, radius: "rounded-2xl" });
    text(s, "Produto real • dados demonstrativos • leitura clara da operação", { x: 100, y: 1220, w: 880, h: 30, size: 20, color: C.white, bold: true, align: "center" });
    waFooter(s, "1/6 • Aluguel — cada aluguel no lugar certo", true);
  }
  // 2
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    waHeader(s, assets);
    text(s, "Veja o mês\nantes de agir.", { x: 70, y: 180, w: 850, h: 150, size: 68, color: C.ink, bold: true });
    text(s, "Previsto, recebido, pendências, ocupação e alertas em uma visão única.", { x: 70, y: 350, w: 820, h: 74, size: 25, color: C.soft });
    browserFrame(s, assets.dashboard, "Painel do Aluguel", { x: 70, y: 470, w: 940, h: 610 });
    shape(s, { x: 70, y: 1124, w: 940, h: 105, fill: C.brassSoft, radius: "rounded-2xl" });
    text(s, "Clareza para priorizar cobranças e manutenção.", { x: 100, y: 1157, w: 880, h: 40, size: 25, color: C.cover, bold: true, align: "center" });
    waFooter(s, "2/6 • Captura real com dados demonstrativos");
  }
  // 3
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    waHeader(s, assets);
    text(s, "Do conjunto\nao detalhe.", { x: 70, y: 178, w: 760, h: 150, size: 66, color: C.ink, bold: true });
    text(s, "Cada imóvel mantém contrato, cobrança, histórico e documentos no mesmo contexto.", { x: 70, y: 350, w: 870, h: 68, size: 24, color: C.soft });
    browserFrame(s, assets.houses, "Carteira real de imóveis", { x: 70, y: 470, w: 940, h: 430 });
    shape(s, { x: 70, y: 950, w: 170, h: 208, fill: C.cover, radius: "rounded-2xl" });
    text(s, "1", { x: 100, y: 985, w: 110, h: 58, size: 44, color: C.brass, bold: true, align: "center" });
    text(s, "imóvel,\ntoda a história", { x: 92, y: 1054, w: 126, h: 78, size: 20, color: C.white, bold: true, align: "center" });
    browserFrame(s, assets.detail, "Detalhe real do imóvel", { x: 270, y: 930, w: 740, h: 310 });
    waFooter(s, "3/6 • Capturas reais com dados demonstrativos");
  }
  // 4
  {
    const s = deck.slides.add();
    s.background.fill = C.paper;
    waHeader(s, assets);
    text(s, "Previsto, recebido\ne despesas.", { x: 70, y: 178, w: 850, h: 150, size: 63, color: C.ink, bold: true });
    text(s, "Registros manuais transformados em visão por imóvel e por mês.", { x: 70, y: 350, w: 850, h: 62, size: 24, color: C.soft });
    browserFrame(s, assets.finance, "Visão financeira real do Aluguel", { x: 70, y: 470, w: 940, h: 620 });
    shape(s, { x: 70, y: 1135, w: 940, h: 90, fill: C.brassSoft, radius: "rounded-2xl" });
    text(s, "Mais clareza para cobrar, conferir e planejar.", { x: 105, y: 1163, w: 870, h: 36, size: 24, color: C.cover, bold: true, align: "center" });
    waFooter(s, "4/6 • Captura real com dados demonstrativos");
  }
  // 5
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    waHeader(s, assets, true);
    text(s, "Uma área clara\npara o inquilino.", { x: 70, y: 190, w: 500, h: 158, size: 58, color: C.white, bold: true });
    text(s, "Acesso somente leitura aos dados que o locador libera.", { x: 70, y: 382, w: 450, h: 72, size: 24, color: "#C9D9D1" });
    const portalItems = ["Contrato", "Pagamentos", "Energia", "Arquivos"];
    portalItems.forEach((item, index) => {
      shape(s, { x: 70, y: 515 + index * 90, w: 420, h: 66, fill: index === 0 ? C.brass : "#1B4035", line: index === 0 ? C.brass : "#36594E", lineWidth: 1, radius: "rounded-full" });
      text(s, `✓  ${item}`, { x: 100, y: 536 + index * 90, w: 360, h: 28, size: 21, color: index === 0 ? C.cover : C.white, bold: true });
    });
    shape(s, { x: 590, y: 170, w: 410, h: 920, fill: "#0A1C17", line: "#42675B", lineWidth: 2, radius: "rounded-2xl", shadow: "shadow-lg" });
    shape(s, { x: 744, y: 190, w: 102, h: 12, fill: "#42675B", radius: "rounded-full" });
    image(s, assets.portal, "Portal real do inquilino", { x: 614, y: 224, w: 362, h: 810, fit: "cover", radius: "rounded-xl" });
    shape(s, { x: 70, y: 1140, w: 930, h: 84, fill: "#1B4035", line: "#36594E", lineWidth: 1, radius: "rounded-2xl" });
    text(s, "Menos mensagens repetidas. Mais autonomia com controle.", { x: 102, y: 1166, w: 866, h: 34, size: 23, color: C.brass, bold: true, align: "center" });
    waFooter(s, "5/6 • Captura real com dados demonstrativos", true);
  }
  // 6
  {
    const s = deck.slides.add();
    s.background.fill = C.cover;
    waHeader(s, assets, true);
    text(s, "Veja sua rotina\ndentro do Aluguel.", { x: 70, y: 188, w: 760, h: 160, size: 64, color: C.white, bold: true });
    text(s, "Solicite uma demonstração ou comece grátis com 1 imóvel.", { x: 70, y: 380, w: 760, h: 72, size: 25, color: "#C9D9D1" });
    shape(s, { x: 70, y: 500, w: 940, h: 560, fill: C.white, radius: "rounded-2xl" });
    image(s, assets.qr, "QR Code do aplicativo", { x: 150, y: 585, w: 390, h: 390, fit: "contain", radius: null });
    text(s, "ABRA O APLICATIVO", { x: 602, y: 625, w: 330, h: 28, size: 15, color: C.brassDeep, bold: true });
    text(s, "Começar\ngrátis", { x: 602, y: 682, w: 330, h: 105, size: 45, color: C.ink, bold: true });
    text(s, "aluguel-casas-anderton\n.netlify.app", { x: 602, y: 820, w: 330, h: 70, size: 22, color: C.cover, bold: true });
    text(s, "Demonstração comercial:", { x: 602, y: 930, w: 330, h: 25, size: 16, color: C.soft });
    text(s, "andertonaluguel@gmail.com", { x: 602, y: 966, w: 330, h: 26, size: 18, color: C.cover, bold: true });
    shape(s, { x: 70, y: 1108, w: 940, h: 104, fill: "#1B4035", line: "#36594E", lineWidth: 1, radius: "rounded-2xl" });
    text(s, "WhatsApp oficial será incluído após a confirmação do número com DDD.", { x: 102, y: 1139, w: 876, h: 40, size: 20, color: C.brass, bold: true, align: "center" });
    waFooter(s, "6/6 • Aluguel — cada aluguel no lugar certo", true);
  }
  return deck;
}

async function exportPresentation(presentation, outputDir, pptxName, renderScale = 1) {
  const renderDir = path.join(outputDir, "rendered");
  const layoutDir = path.join(outputDir, "layouts");
  await fs.mkdir(renderDir, { recursive: true });
  await fs.mkdir(layoutDir, { recursive: true });
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(renderDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: renderScale }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(layoutDir, `${stem}.layout.json`), await layout.text());
  }
  await writeBlob(path.join(outputDir, "montagem.webp"), await presentation.export({ format: "webp", montage: true, scale: 0.45 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(path.join(outputDir, pptxName));
}

async function main() {
  const assets = await loadAssets();
  await fs.mkdir(OUT_DECK, { recursive: true });
  await fs.mkdir(OUT_ONEPAGE, { recursive: true });
  await fs.mkdir(OUT_WHATSAPP, { recursive: true });
  await exportPresentation(await buildMainDeck(assets), OUT_DECK, "aluguel-apresentacao-comercial-editavel.pptx", 1.5);
  await exportPresentation(await buildOnePage(assets), OUT_ONEPAGE, "aluguel-one-page-editavel.pptx", 2);
  await exportPresentation(await buildWhatsapp(assets), OUT_WHATSAPP, "aluguel-kit-whatsapp-editavel.pptx", 1);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
