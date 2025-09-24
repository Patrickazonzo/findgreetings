/* Reset punitivo (torna alla home) */
function resetToStart() {
    window.location.href = 'index.html';
  }
  
  /* Check risposta con due modalità: reset o rigenera (stub) */
  function checkAnswer(userInput, expected, onFail = 'reset') {
    const u = (userInput || '').trim().toLowerCase();
    const e = (expected || '').trim().toLowerCase();
    if (u === e) return true;
  
    if (onFail === 'regen') {
      // qui potresti rigenerare l’enigma (seed/shift/ordine casuale)
      // esempio: ricarico la pagina con un query param random
      const url = new URL(window.location.href);
      url.searchParams.set('seed', Math.random().toString(36).slice(2, 8));
      window.location.href = url.toString();
    } else {
      // default: reset cattivo
      resetToStart();
    }
    return false;
  }
  
  /* Popup finale con confetti */
  function showAuguri() {
    const dlg = document.getElementById('auguriDialog');
    if (dlg && typeof dlg.showModal === 'function') {
      dlg.showModal();
    }
    try {
      // confetti “a ventaglio”
      confetti({ particleCount: 90, spread: 60, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 120, spread: 80, scalar: 0.9 }), 400);
      setTimeout(() => confetti({ particleCount: 200, spread: 100, ticks: 200, scalar: 1.1 }), 900);
    } catch (e) {
      // confetti non caricato: ignoriamo
    }
  }
  
  // Controllo accesso alle pagine
  function checkAccess(pageId, requiredStep) {
    const progress = sessionStorage.getItem("fg_progress");
    if (!progress || progress !== requiredStep) {
      console.warn("Accesso negato: redirect a index");
      resetToStart();
      return false;
    }
    // se accesso ok, salva nuovo step
    sessionStorage.setItem("fg_progress", pageId);
    return true;
  }
  
  // Funzione per avanzare in sicurezza
  function goNext(nextPage, nextStep) {
    sessionStorage.setItem("fg_progress", nextStep || nextPage);
    window.location.href = nextPage;
  }