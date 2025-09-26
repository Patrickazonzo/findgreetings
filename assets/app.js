(() => {
  // TODO: Considerare una strategia di offuscamento/build per rendere piu arduo il reverse engineering del flusso JS.
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

  const MEDIA_BASE = 'assets/media/';
  const MEDIA = {
    finalVoice: `${MEDIA_BASE}auguri.opus`,
    finalExtras: [
      {
        audio: `${MEDIA_BASE}monke.opus`,
        visual: { type: 'video', src: `${MEDIA_BASE}monkeZoomGif.mp4`, alt: 'Scimmia entusiasta che celebra la vittoria.' },
        autoCloseMs: 6500,
        caption: 'Modalita scimmia attivata: urla di gioia per il tuo trionfo!',
        closeLabel: 'Ok, basta urlare',
      },
      {
        audio: `${MEDIA_BASE}crow.mp3`,
        visual: { type: 'image', src: `${MEDIA_BASE}crow.jpg`, alt: 'Corvo sarcastico che applaude.' },
        autoCloseMs: 5200,
        caption: 'Il corvo chiacchierone gracchia "bravo!".',
        closeLabel: 'Grazie, corvaccio',
      },
      {
        audio: null,
        visual: { type: 'image', src: `${MEDIA_BASE}funnyFace.jpg`, alt: 'Faccia buffa con sorriso esagerato.' },
        autoCloseMs: 4800,
        caption: 'Sorriso gigante: missione completata, rilassati pure.',
        closeLabel: 'Che stile!',
      },
    ],
    failEffects: [
      {
        audio: `${MEDIA_BASE}crow.mp3`,
        visual: { type: 'image', src: `${MEDIA_BASE}shockFace.jpg`, alt: 'Illustrazione shock del labirinto di enigma 4.' },
        autoCloseMs: 4200,
        closeLabel: 'Riprovo',
      },
    ],
  };

  const PASSWORD_FAIL_KEY = 'fg_password_fail_count';

  const audioCache = new Map();

  const clampVolume = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 1;
    return Math.min(1, Math.max(0, value));
  };

  const playAudio = (src, options = {}) => {
    if (!src) return null;
    const opts = Object.assign({ volume: 1, loop: false, allowOverlap: false }, options);
    try {
      let audio = audioCache.get(src);
      if (opts.allowOverlap && audio && !audio.paused) {
        audio = audio.cloneNode(true);
      } else if (!audio) {
        audio = new Audio(src);
        audio.preload = 'auto';
        audioCache.set(src, audio);
      }
      audio.loop = !!opts.loop;
      audio.volume = clampVolume(opts.volume);
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise?.catch) {
        playPromise.catch((err) => console.warn('Audio play blocked', src, err));
      }
      return audio;
    } catch (err) {
      console.warn('Unable to initialise audio', src, err);
      return null;
    }
  };

  const stopAudio = (audio) => {
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (err) {
      console.warn('Unable to stop audio', err);
    }
  };

  const pickRandom = (list) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    const index = Math.floor(Math.random() * list.length);
    return list[index];
  };

  const shuffleCopy = (list) => {
    if (!Array.isArray(list)) return [];
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const ACTIVE_MEDIA_POPUPS = new Map();

  const showMediaPopup = (effect, options = {}) => {
    if (!effect) return null;
    const opts = Object.assign({
      id: 'fg-media-popup',
      closeLabel: effect.closeLabel || 'Chiudi',
      autoCloseMs: effect.autoCloseMs || 0,
      audioOptions: effect.audioOptions || { volume: 0.9, allowOverlap: true },
      onClose: null,
    }, options);

    const previous = ACTIVE_MEDIA_POPUPS.get(opts.id);
    if (previous && typeof previous.cleanup === 'function') {
      previous.cleanup();
    }

    const overlay = document.createElement('div');
    overlay.className = 'fg-media-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;z-index:14000;padding:24px;backdrop-filter:blur(2px);';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#121212;color:#f6f6f6;padding:18px 22px;border-radius:14px;max-width:min(92vw,420px);width:100%;box-shadow:0 20px 50px rgba(0,0,0,0.45);text-align:center;';

    let mediaNode = null;
    if (effect.visual?.type === 'video') {
      const video = document.createElement('video');
      video.src = effect.visual.src;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = 'max-width:100%;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
      if (effect.visual.alt) video.setAttribute('aria-label', effect.visual.alt);
      mediaNode = video;
    } else if (effect.visual?.src) {
      const img = document.createElement('img');
      img.src = effect.visual.src;
      img.alt = effect.visual.alt || '';
      img.style.cssText = 'max-width:100%;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
      mediaNode = img;
    }

    if (mediaNode) {
      panel.appendChild(mediaNode);
    }

    if (effect.caption) {
      const p = document.createElement('p');
      p.textContent = effect.caption;
      p.style.cssText = 'margin:14px 0 0;font-size:0.95rem;';
      panel.appendChild(p);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = opts.closeLabel;
    closeBtn.style.cssText = 'margin-top:14px;padding:8px 16px;border-radius:999px;border:none;background:#ffb347;color:#111;font-weight:600;cursor:pointer;';
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const audioOptions = opts.audioOptions || {};
    const audioRef = playAudio(effect.audio, audioOptions);

    let autoTimer = null;

    const cleanup = () => {
      if (overlay.parentNode) overlay.remove();
      if (audioRef && !audioOptions.keepPlaying) {
        stopAudio(audioRef);
      }
      if (typeof opts.onClose === 'function') {
        try { opts.onClose(); } catch (err) { console.warn('onClose handler error', err); }
      }
      if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
      ACTIVE_MEDIA_POPUPS.delete(opts.id);
    };

    closeBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) cleanup();
    });

    if (opts.autoCloseMs && opts.autoCloseMs > 0) {
      autoTimer = setTimeout(() => cleanup(), opts.autoCloseMs);
    }

    const record = { cleanup, overlay, audio: audioRef };
    ACTIVE_MEDIA_POPUPS.set(opts.id, record);
    return record;
  };

  let finalVoiceRef = null;
  let finalExtraTimer = null;

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
    if (finalExtraTimer) {
      clearTimeout(finalExtraTimer);
      finalExtraTimer = null;
    }

    const dlg = document.getElementById('auguriDialog');
    if (dlg?.showModal) {
      dlg.showModal();
      if (!dlg.dataset.audioHintAttached) {
        const container = dlg.querySelector('article') || dlg;
        const hint = document.createElement('p');
        hint.textContent = 'Alza il volume: sta partendo un messaggio vocale dedicato.';
        hint.style.marginTop = '0.75rem';
        hint.style.fontSize = '0.95rem';
        hint.style.fontWeight = '500';
        container.appendChild(hint);
        dlg.dataset.audioHintAttached = 'true';
      }
    }

    if (finalVoiceRef) {
      stopAudio(finalVoiceRef);
    }
    finalVoiceRef = playAudio(MEDIA.finalVoice, { volume: 0.85 });

    try {
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 90, spread: 60, origin: { y: 0.6 } });
        setTimeout(() => window.confetti({ particleCount: 120, spread: 80, scalar: 0.9 }), 400);
        setTimeout(() => window.confetti({ particleCount: 200, spread: 100, ticks: 200, scalar: 1.1 }), 900);
        setTimeout(ensureConfettiCanvasClass, 0);
        setTimeout(ensureConfettiCanvasClass, 200);
        if (typeof ensureCanvasClass === 'function') {
          setTimeout(ensureCanvasClass, 0);
          setTimeout(ensureCanvasClass, 200);
        }
      }
    } catch (err) {
      console.warn('Confetti not available', err);
    }

    if (Array.isArray(MEDIA.finalExtras) && MEDIA.finalExtras.length) {
      const effect = pickRandom(MEDIA.finalExtras);
      if (effect) {
        finalExtraTimer = setTimeout(() => {
          showMediaPopup(effect, {
            id: 'fg-final-popup',
            closeLabel: effect.closeLabel || 'Wow!',
            autoCloseMs: effect.autoCloseMs || 6000,
            audioOptions: Object.assign({ volume: 0.88, allowOverlap: true }, effect.audioOptions || {}),
          });
        }, 900);
      }
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

  const setupPasswordGate = (config = {}) => {
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
    let failCount = parseInt(sessionStorage.getItem(PASSWORD_FAIL_KEY) || '0', 10);
    if (!Number.isFinite(failCount) || failCount < 0) failCount = 0;
    let lastFailPopup = null;

    const setFeedback = (message = '', variant = '') => {
      if (!feedbackEl) return;
      feedbackEl.textContent = message;
      feedbackEl.dataset.variant = variant;
    };

    const setDisabled = (disabled) => {
      if (submitBtn) submitBtn.disabled = disabled;
      input.disabled = disabled;
    };

    const resetFailCount = () => {
      failCount = 0;
      sessionStorage.removeItem(PASSWORD_FAIL_KEY);
      if (lastFailPopup && typeof lastFailPopup.cleanup === 'function') {
        lastFailPopup.cleanup();
      }
      lastFailPopup = null;
    };

    const showPasswordFailPopup = () => {
      const effect = Array.isArray(MEDIA.failEffects) ? MEDIA.failEffects[0] : null;
      if (!effect) return;
      lastFailPopup = showMediaPopup(effect, {
        id: 'fg-password-fail-popup',
        closeLabel: effect.closeLabel || 'Riprovo',
        autoCloseMs: effect.autoCloseMs || 4500,
        audioOptions: Object.assign({ volume: 0.92, allowOverlap: true }, effect.audioOptions || {}),
        onClose: () => {
          if (input && !input.disabled) {
            setTimeout(() => input.focus(), 120);
          }
        },
      });
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
        resetFailCount();
        overlay.classList.add('is-hidden');
        setFeedback('');
        input.value = '';
        if (typeof config.onSuccess === 'function') {
          config.onSuccess();
        }
        return;
      }
      failCount += 1;
      sessionStorage.setItem(PASSWORD_FAIL_KEY, String(failCount));
      const nextLock = now() + cooldownMs;
      sessionStorage.setItem(FG.COOLDOWN_KEY, String(nextLock));
      applyLock(nextLock);
      input.value = '';
      if (failCount >= 1) {
        showPasswordFailPopup();
      }
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

  const initEnigma1 = () => {
    if (document.body?.dataset.page !== 'enigma1') return;

    const cipherTextEl = document.getElementById('cipherText');
    const form = document.getElementById('cipherForm');
    const answerInput = document.getElementById('cipherAnswer');
    const feedbackEl = document.getElementById('cipherFeedback');

    if (!cipherTextEl || !form || !answerInput || !feedbackEl || cipherTextEl.dataset.enigmaReady === 'true') {
      return;
    }

    cipherTextEl.dataset.enigmaReady = 'true';

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    const normalize = (text) => (text || '').replace(/[^a-z]/gi, '').toLowerCase();

    const encode = (plain, shift) => {
      const upper = plain.toUpperCase();
      return Array.from(upper).map((char) => {
        const idx = alphabet.indexOf(char);
        if (idx === -1) return char;
        const newIdx = (idx + shift + 26) % 26;
        return alphabet[newIdx];
      }).join('');
    };

    const randomShift = () => {
      let shift = 0;
      while (shift === 0) {
        shift = Math.floor(Math.random() * 25) + 1;
        if (Math.random() < 0.5) shift *= -1;
      }
      return shift;
    };

    const formatChunks = (text) => text.match(/.{1,4}/g)?.join(' ') || text;

    let currentPhase = 'phase1';
    let phase2Target = null;

    const applyPhaseTag = () => {
      cipherTextEl.dataset.phase = currentPhase;
    };

    const animateBoard = () => {
      cipherTextEl.classList.add('wiggle');
      setTimeout(() => cipherTextEl.classList.remove('wiggle'), 180);
    };

    const PHASE1_TARGET = 'ATTENTO A QUELLO CHE VEDI';
    const phase1TargetNormalized = normalize(PHASE1_TARGET);

    const phase2Catalog = [
      { id: 'mock-1', plain: 'SCEMO CHI DECODIFICA' },
      { id: 'mock-2', plain: 'MA GUARDA CHE TENACIA' },
      { id: 'mock-3', plain: 'STAI ANCORA PROVANDO DAVVERO' },
      { id: 'mock-4', plain: 'IL SEGRETO NON E QUI TRANQUILLO' },
      { id: 'mock-5', plain: 'OK HAI VINTO PASSA PURE ADESSO' },
    ].map((item) => Object.assign({}, item, { normalized: normalize(item.plain) }));

    const rollCipher = (reason = 'auto') => {
      if (currentPhase === 'phase1') {
        const encoded = formatChunks(encode(phase1TargetNormalized, randomShift()));
        cipherTextEl.textContent = encoded;
      } else {
        const order = shuffleCopy(phase2Catalog);
        const lines = order.map((item) => {
          const encoded = formatChunks(encode(item.normalized, randomShift()));
          return encoded;
        });
        cipherTextEl.textContent = lines.join('\n\n');
      }

      if (reason === 'typing' || reason === 'click') {
        animateBoard();
      }
    };

    const startPhase2 = () => {
      currentPhase = 'phase2';
      phase2Target = pickRandom(phase2Catalog);
      applyPhaseTag();
      feedbackEl.textContent = 'Davvero pensavi fosse finita? Decifra quella giusta fra le cinque.';
      feedbackEl.dataset.state = 'warn';
      answerInput.value = '';
      rollCipher('phase2-init');
      setTimeout(() => {
        if (typeof answerInput.focus === 'function') {
          answerInput.focus();
        }
      }, 150);
    };

    const handleSubmit = (event) => {
      event.preventDefault();
      const attempt = normalize(answerInput.value);
      if (!attempt) {
        feedbackEl.textContent = 'Serve scrivere qualcosa.';
        feedbackEl.dataset.state = 'warn';
        return;
      }

      if (currentPhase === 'phase1') {
        if (attempt === phase1TargetNormalized) {
          startPhase2();
          return;
        }
        feedbackEl.textContent = 'Nope. Il cifrario si confonde e cambia di nuovo.';
        feedbackEl.dataset.state = 'error';
        answerInput.focus();
        rollCipher('manual');
        return;
      }

      if (attempt === phase2Target?.normalized) {
        feedbackEl.textContent = 'Ok, te lo sei guadagnato.';
        feedbackEl.dataset.state = 'ok';
        setTimeout(() => goNext('enigma2.html', 'enigma2'), 500);
        return;
      }

      feedbackEl.textContent = 'Nemmeno questa volta. Tutto si rimescola di nuovo.';
      feedbackEl.dataset.state = 'error';
      answerInput.select();
      rollCipher('manual');
    };

    form.addEventListener('submit', handleSubmit);
    answerInput.addEventListener('input', () => rollCipher('typing'));
    answerInput.addEventListener('click', () => rollCipher('click'));
    cipherTextEl.addEventListener('click', () => rollCipher('click'));
    cipherTextEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        rollCipher('click');
      }
    });

    applyPhaseTag();
    rollCipher('init');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnigma1, { once: true });
  } else {
    initEnigma1();
  }

  window.resetToStart = resetToStart;
  window.checkAnswer = checkAnswer;
  window.showAuguri = showAuguri;
  window.goNext = goNext;
  window.initGate = initGate;
  window.startFlow = startFlow;
  window.setupPasswordGate = setupPasswordGate;
})();

