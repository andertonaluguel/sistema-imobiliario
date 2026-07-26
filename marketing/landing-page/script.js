(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const defaultConfig = {
    appName: 'Aluguel',
    appUrl: 'https://aluguel-casas-anderton.netlify.app',
    supportEmail: 'andertonaluguel@gmail.com',
    whatsappNumber: ''
  };
  const config = Object.assign({}, defaultConfig, window.ALUGUEL_LANDING_CONFIG || {});
  const whatsappDigits = String(config.whatsappNumber || '').replace(/\D/g, '');
  const contactChannel = whatsappDigits ? 'whatsapp' : 'email';

  window.dataLayer = window.dataLayer || [];

  function track(eventName, properties) {
    window.dataLayer.push(Object.assign({ event: eventName }, properties || {}));
  }

  function makeMailto(subject, body) {
    return 'mailto:' + String(config.supportEmail).trim() +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  function makeWhatsapp(body) {
    return 'https://wa.me/' + whatsappDigits + '?text=' + encodeURIComponent(body);
  }

  document.querySelectorAll('[data-app-link]').forEach(function (link) {
    link.href = config.appUrl;
  });

  document.querySelectorAll('[data-contact-link]').forEach(function (link) {
    if (whatsappDigits) {
      link.href = makeWhatsapp('Olá! Gostaria de saber mais sobre o aplicativo Aluguel.');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Falar pelo WhatsApp';
    } else {
      link.href = 'mailto:' + config.supportEmail;
      link.removeAttribute('target');
      link.textContent = config.supportEmail;
    }
  });

  document.addEventListener('click', function (event) {
    const tracked = event.target.closest('[data-track]');
    if (!tracked) return;
    track('cta_click', {
      cta_id: tracked.dataset.track,
      destination_type: tracked.matches('[data-app-link]') ? 'app' : (tracked.hash || '').startsWith('#') ? 'page_anchor' : 'contact'
    });
  });

  const header = document.querySelector('[data-header]');
  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
  }
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  const menuButton = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');

  function setMenu(open) {
    if (!menuButton || !menu) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    const label = menuButton.querySelector('.sr-only');
    if (label) label.textContent = open ? 'Fechar menu' : 'Abrir menu';
  }

  if (menuButton && menu) {
    menuButton.addEventListener('click', function () {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      setMenu(open);
      track('navigation_menu_toggle', { state: open ? 'open' : 'closed' });
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        setMenu(false);
        menuButton.focus();
      }
    });
    document.addEventListener('click', function (event) {
      if (menuButton.getAttribute('aria-expanded') === 'true' && !menu.contains(event.target) && !menuButton.contains(event.target)) {
        setMenu(false);
      }
    });
  }

  document.querySelectorAll('[data-product-image]').forEach(function (image) {
    function showFallback() {
      const container = image.parentElement;
      const fallback = container ? container.querySelector('[data-image-fallback]') : null;
      image.hidden = true;
      if (fallback) fallback.hidden = false;
    }

    image.addEventListener('error', showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  });

  const form = document.querySelector('[data-contact-form]');
  const formStatus = document.querySelector('[data-form-status]');
  let formStarted = false;

  if (form) {
    form.addEventListener('focusin', function () {
      if (formStarted) return;
      formStarted = true;
      track('contact_form_start', { contact_channel: contactChannel });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const values = new FormData(form);
      const name = String(values.get('name') || '').trim();
      const email = String(values.get('email') || '').trim();
      const phone = String(values.get('phone') || '').trim();
      const properties = String(values.get('properties') || '').trim();
      const need = String(values.get('need') || '').trim();
      const context = String(values.get('message') || '').trim();
      const lines = [
        'Olá! Gostaria de conhecer melhor o aplicativo Aluguel.',
        '',
        'Nome: ' + name,
        'E-mail: ' + email,
        'Telefone: ' + (phone || 'Não informado'),
        'Carteira: ' + properties,
        'Prioridade: ' + need,
        'Contexto: ' + (context || 'Não informado')
      ];
      const body = lines.join('\n');
      const destination = whatsappDigits
        ? makeWhatsapp(body)
        : makeMailto('Demonstração do aplicativo Aluguel — ' + name, body);

      track('contact_form_prepare', {
        contact_channel: contactChannel,
        properties_range: properties,
        primary_need: need
      });

      if (formStatus) {
        formStatus.textContent = whatsappDigits
          ? 'Abrindo o WhatsApp para você revisar e enviar a mensagem.'
          : 'Abrindo seu aplicativo de e-mail para você revisar e enviar a mensagem.';
      }

      if (whatsappDigits) {
        const opened = window.open(destination, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.href = destination;
      } else {
        window.location.href = destination;
      }
    });
  }

  document.querySelectorAll('.faq-list details').forEach(function (item, index) {
    item.addEventListener('toggle', function () {
      if (item.open) track('faq_open', { faq_index: index + 1 });
    });
  });

  if ('IntersectionObserver' in window) {
    const viewedSections = new Set();
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        const sectionName = entry.target.dataset.section;
        if (entry.isIntersecting && sectionName && !viewedSections.has(sectionName)) {
          viewedSections.add(sectionName);
          track('section_view', { section_name: sectionName });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    document.querySelectorAll('[data-section]').forEach(function (section) { observer.observe(section); });
  }

  const year = document.querySelector('[data-current-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
