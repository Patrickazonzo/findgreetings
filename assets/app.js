(() => {`n  // TODO: Considerare una strategia di offuscamento/build per rendere piu arduo il reverse engineering del flusso JS.
  const FG = {
    VERSION: '2025-09-24-01',
    STORAGE_KEY: 'fg_state',
    COOLDOWN_KEY: 'fg_password_cooldown_until',
    TOKEN_LENGTH: 24,
    DEFAULT_COOLDOWN_MS: 15000,
  };

  let cachedState = null;

  const now = () => Date.now();

  const loadState = () => {
    if (cachedState) return cachedState;
    const raw = sessionStorage.getItem(FG.STORAGE_KEY);
    if (!raw) return null;
    try {
      cachedState = JSON.parse(raw);
      return cachedState;
    } catch (err) {
      sessionStorage.removeItem(FG.STORAGE_KEY);
      return null;
    }
  };

  const storeState = (state) => {
    cachedState = state;
    sessionStorage.setItem(FG.STORAGE_KEY, JSON.stringify(state));
  };

  const clearState = () => {
    cachedState = null;
    sessionStorage.removeItem(FG.STORAGE_KEY);
  };

  const ensureTokens = (state) => {
    if (!state.tokens || typeof state.tokens !== 'object') {
      state.tokens = {};
    }
    return state.tokens;
  };

  const randomToken = (len = FG.TOKEN_LENGTH) => {
    const crypto = window.crypto || window.msCrypto;
    if (crypto?.getRandomValues) {
      const arr = new Uint8Array(len);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => (b % 36).toString(36)).join('');
    }
    return Array.from({ length: len }, () => Math.random().toString(36).slice(-1)).join('');
  };

  const extractToken = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('k') || '';
  };

  const buildTargetUrl = (nextPage, token) => {
    try {
      const url = new URL(nextPage, window.location.href);
      url.searchParams.set('k', token);
      return url.href;
    } catch (err) {
      const [base, query = ''] = nextPage.split('?');
      const params = new URLSearchParams(query);
      params.set('k', token);
      const qs = params.toString();
      return `${base}${qs ? `?${qs}` : ''}`;
    }
  };

  const hardReset = () => {
    clearState();
    window.location.replace('index.html');
  };

  const markHistory = (state, pageId) => {
    if (!Array.isArray(state.history)) state.history = [];
    if (state.history[state.history.length - 1] !== pageId) {
      state.history.push(pageId);
    }
  };

  const initGate = (pageId, opts = {}) => {
    if (!pageId) return;
    const options = Object.assign({
      requiredStep: null,
      allowTokenless: false,
      isStart: false,
      onReady: null,
    }, opts);

    const run = () => {
      if (options.isStart) {
        clearState();
        if (typeof options.onReady === 'function') {
          try { options.onReady(null); } catch (err) { console.error(err); }
        }
        return;
      }

      if (pageId === 'index') {
        if (typeof options.onReady === 'function') {
          try { options.onReady(null); } catch (err) { console.error(err); }
        }
        return;
      }

      const state = loadState();
      if (!state || !state.passwordOk) {
        hardReset();
        return;
      }

      if (!options.allowTokenless) {
        const tokenInUrl = extractToken();
        const tokens = ensureTokens(state);
        const expectedToken = tokens[pageId];
        if (!tokenInUrl || !expectedToken || tokenInUrl !== expectedToken) {
          hardReset();
          return;
        }
        delete tokens[pageId];
      }

      if (options.requiredStep && state.lastStep !== options.requiredStep) {
        hardReset();
        return;
      }

      state.lastStep = pageId;
      markHistory(state, pageId);
      storeState(state);

      if (typeof options.onReady === 'function') {
        try { options.onReady(state); } catch (err) { console.error(err); }
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  };

  const goNext = (nextPage, nextStepId) => {
    const state = loadState();
    const currentPage = document.body?.dataset.page;

    if (!state || !state.passwordOk) {
      hardReset();
      return;
    }

    if (!currentPage || state.lastStep !== currentPage) {
      hardReset();
      return;
    }

    const stepId = nextStepId || nextPage.replace(/\..+$/, '');
    const token = randomToken();
    ensureTokens(state)[stepId] = token;
    storeState(state);

    window.location.href = buildTargetUrl(nextPage, token);
  };

  const startFlow = (nextPage, nextStepId, extra = {}) => {
    const token = randomToken();
    const state = {
      passwordOk: true,
      lastStep: 'start',
      startedAt: now(),
      history: ['index'],
      tokens: { [nextStepId]: token },
      meta: extra || {},
    };
    storeState(state);
    window.location.href = buildTargetUrl(nextPage, token);
  };

  const resetToStart = () => {
    clearState();
    window.location.replace('index.html');
  };

  const checkAnswer = (userInput, expected, onFail = 'reset') => {
    // TODO: Agganciare popup visivi con immagini o animazioni dedicate agli errori
    const sanitizedUser = (userInput || '').trim().toLowerCase();
    const sanitizedExpected = (expected || '').trim().toLowerCase();
    const success = sanitizedUser === sanitizedExpected;
    if (success) return true;

    if (onFail === 'regen') {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', randomToken(8));
      window.location.href = url.href;
    } else {
      resetToStart();
    }
    return false;
  };

  const ensureConfettiCanvasClass = () => {
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach((canvas) => {
      if (!canvas.classList.contains('confetti-canvas')) {
        canvas.classList.add('confetti-canvas');
      }
    });
  };

  const showAuguri = () => {
    // TODO: Allegare audio/voce finale (es. messaggio auguri) e invitare l'utente ad alzare il volume; valutare effetti extra (es. scimmia che urla)
    const dlg = document.getElementById('auguriDialog');
    if (dlg?.showModal) dlg.showModal();

    try {
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 90, spread: 60, origin: { y: 0.6 } });
        setTimeout(() => window.confetti({ particleCount: 120, spread: 80, scalar: 0.9 }), 400);
        setTimeout(() => window.confetti({ particleCount: 200, spread: 100, ticks: 200, scalar: 1.1 }), 900);
        setTimeout(ensureConfettiCanvasClass, 0);
        setTimeout(ensureConfettiCanvasClass, 200);
      }
    } catch (err) {
      console.warn('Confetti not available', err);
    }
  };

  window.addEventListener('resize', ensureConfettiCanvasClass);
  window.addEventListener('orientationchange', ensureConfettiCanvasClass);

  const globalObserver = new MutationObserver(() => ensureConfettiCanvasClass());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalObserver.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else if (document.body) {
    globalObserver.observe(document.body, { childList: true, subtree: true });
  }

  const setupPasswordGate = (config = {}) => {`n    // TODO: Integrare popup con immagini/suoni quando gli utenti sbagliano ripetutamente la password
    const overlay = document.querySelector(config.overlaySelector || '#fgPasswordOverlay');
    const form = overlay?.querySelector('form');
    const input = overlay?.querySelector(config.inputSelector || 'input[type="password"],input[type="text"]');
    const submitBtn = overlay?.querySelector(config.submitSelector || 'button[type="submit"]');
    const feedbackEl = overlay?.querySelector(config.feedbackSelector || '.gate-feedback');

    if (!overlay || !form || !input) {
      console.warn('Password gate missing elements');
      return;
    }

    const expected = (config.expected || '').trim().toLowerCase();
    const cooldownMs = config.cooldownMs ?? FG.DEFAULT_COOLDOWN_MS;
    let lockedUntil = 0;
    let countdownTimer = null;

    const setFeedback = (message = '', variant = '') => {
      if (!feedbackEl) return;
      feedbackEl.textContent = message;
      feedbackEl.dataset.variant = variant;
    };

    const setDisabled = (disabled) => {
      if (submitBtn) submitBtn.disabled = disabled;
      input.disabled = disabled;
    };

    const releaseLock = () => {
      lockedUntil = 0;
      sessionStorage.removeItem(FG.COOLDOWN_KEY);
      setDisabled(false);
      setFeedback('');
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };

    const applyLock = (untilTs) => {
      lockedUntil = untilTs;
      setDisabled(true);
      const update = () => {
        const diff = Math.max(0, untilTs - now());
        const seconds = Math.ceil(diff / 1000);
        if (seconds <= 0) {
          releaseLock();
        } else {
          setFeedback(`Password errata. Riprova tra ${seconds}s.`, 'error');
        }
      };
      update();
      countdownTimer = setInterval(update, 1000);
    };

    const storedCooldown = parseInt(sessionStorage.getItem(FG.COOLDOWN_KEY) || '0', 10);
    if (storedCooldown && storedCooldown > now()) {
      applyLock(storedCooldown);
    } else {
      releaseLock();
    }

    overlay.classList.remove('is-hidden');
    overlay.removeAttribute('hidden');

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (lockedUntil > now()) return;
      const value = (input.value || '').trim().toLowerCase();
      if (!value) {
        setFeedback('Inserisci la password.', 'warn');
        return;
      }
      if (expected && value === expected) {
        releaseLock();
        overlay.classList.add('is-hidden');
        setFeedback('');
        input.value = '';
        if (typeof config.onSuccess === 'function') {
          config.onSuccess();
        }
        return;
      }
      const nextLock = now() + cooldownMs;
      sessionStorage.setItem(FG.COOLDOWN_KEY, String(nextLock));
      applyLock(nextLock);
      input.value = '';
      if (typeof config.onFail === 'function') {
        config.onFail();
      }
    });

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay && input && !input.disabled) {
        input.focus();
      }
    });

    if (!input.disabled) {
      setTimeout(() => input.focus(), 50);
    }
  };

  window.resetToStart = resetToStart;
  window.checkAnswer = checkAnswer;
  window.showAuguri = showAuguri;
  window.goNext = goNext;
  window.initGate = initGate;
  window.startFlow = startFlow;
  window.setupPasswordGate = setupPasswordGate;
})();
