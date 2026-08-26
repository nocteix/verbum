(function(){
  var state = {
    title: '',
    lang: 'la',
    sentences: [],
    translations: [],
    refTranslations: [],
    wordColors: {},
    syntaxLinks: {},
    interlinearNotes: {},
    current: 0,
    secondsElapsed: 0
  };

  var interlinearActive = false;
  var syntaxModeActive = false;
  var syntaxSourceWord = null;
  var timerInterval = null;
  var hasUnsavedTranslation = false;
  var hasUnsavedGloss = false;

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function persist() {
    try { localStorage.setItem('verbum_state_full', JSON.stringify(state)); } catch(e){}
  }

  function getAutoParsedGlossary() {
    var fullText = state.sentences.join(' ');
    var tokens = fullText.match(/[\p{L}\p{M}]+/gu) || [];
    var uniqueMap = {};
    
    tokens.forEach(function(t) {
      var norm = t.toLowerCase();
      if (!uniqueMap[norm]) {
        uniqueMap[norm] = t;
      }
    });

    return Object.keys(uniqueMap).map(function(normKey) {
      return { word: uniqueMap[normKey], key: normKey };
    });
  }

  function renderTimeDisplay() {
    var m = Math.floor(state.secondsElapsed / 60);
    var s = state.secondsElapsed % 60;
    var timeEl = document.getElementById('stat-time');
    if(timeEl) timeEl.textContent = m + 'm ' + s + 's';
  }

  function startTimer() {
    if(timerInterval) clearInterval(timerInterval);
    renderTimeDisplay();
    timerInterval = setInterval(function(){
      state.secondsElapsed++;
      renderTimeDisplay();

      if(state.secondsElapsed % 5 === 0) persist();
    }, 1000);
  }

  window.addEventListener('beforeunload', function(e){
    if(timerInterval) persist();
    if(hasUnsavedTranslation || hasUnsavedGloss) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  document.getElementById('btn-start-session').addEventListener('click', function(){
    var title = document.getElementById('input-title').value.trim() || 'Untitled Passage';
    var lang = document.getElementById('input-lang').value;
    var rawText = document.getElementById('input-text').value.trim();
    var rawRef = document.getElementById('input-reftrans').value.trim();

    if(!rawText) {
      alert('Please enter text to translate.');
      return;
    }

    var sentences = rawText.match(/[^.!?]+[.!?]+(\s|$)/g) || [rawText];
    sentences = sentences.map(function(s){ return s.trim(); });

    var refSentences = rawRef ? (rawRef.match(/[^.!?]+[.!?]+(\s|$)/g) || [rawRef]) : [];
    refSentences = refSentences.map(function(s){ return s.trim(); });

    var refMismatch = refSentences.length > 0 && refSentences.length !== sentences.length;

    state = {
      title: title,
      lang: lang,
      sentences: sentences,
      translations: new Array(sentences.length).fill(''),
      refTranslations: refSentences,
      refMismatch: refMismatch,
      refFullText: rawRef,
      wordColors: {},
      syntaxLinks: {},
      interlinearNotes: {},
      current: 0,
      secondsElapsed: 0
    };

    persist();
    showPractice();
  });

  document.getElementById('btn-return-home').addEventListener('click', function(){
    if(timerInterval) clearInterval(timerInterval);
    document.getElementById('view-setup').classList.remove('hidden');
    document.getElementById('view-practice').classList.add('hidden');
    document.getElementById('btn-return-home').classList.add('hidden');
  });

  function showPractice() {
    document.getElementById('view-setup').classList.add('hidden');
    document.getElementById('view-practice').classList.remove('hidden');
    document.getElementById('btn-return-home').classList.remove('hidden');
    document.getElementById('session-title-display').textContent = state.title;
    
    if(!state.wordColors) state.wordColors = {};
    if(!state.syntaxLinks) state.syntaxLinks = {};
    if(!state.interlinearNotes) state.interlinearNotes = {};

    updateDashboardStats();
    startTimer();
    renderSentence();
  }

  function updateDashboardStats() {
    var autoGlossary = getAutoParsedGlossary();
    document.getElementById('stat-words').textContent = autoGlossary.length;

    var totalLinks = 0;
    Object.keys(state.syntaxLinks).forEach(function(sKey){
      if(state.syntaxLinks[sKey]) totalLinks += state.syntaxLinks[sKey].length;
    });
    document.getElementById('stat-links').textContent = totalLinks;
  }

  function renderSentence() {
    var card = document.getElementById('active-sentence-card');
    card.innerHTML = '';

    var currentText = state.sentences[state.current];
    var words = currentText.match(/[\p{L}\p{M}]+|[^\p{L}\p{M}\s]+|\s+/gu) || [currentText];
    var wordIndexCounter = 0;

    words.forEach(function(token) {
      if(/^[\p{L}\p{M}]+$/u.test(token)) {
        var span = document.createElement('span');
        span.className = 'word';
        span.textContent = token;
        span.setAttribute('tabindex', '0');
        span.setAttribute('role', 'button');
        span.setAttribute('aria-label', 'Word: ' + token + '. Activate to set a highlight color.');

        var wordKey = state.current + '_' + wordIndexCounter;
        span.setAttribute('data-word-key', wordKey);

        if (state.wordColors && state.wordColors[wordKey]) {
          span.setAttribute('data-color', state.wordColors[wordKey]);
        }

        card.appendChild(span);
        wordIndexCounter++;
      } else {
        card.appendChild(document.createTextNode(token));
      }
    });

    rebindWordEvents();

    document.getElementById('sentence-counter').textContent = 'Sentence ' + (state.current + 1) + ' of ' + state.sentences.length;
    document.getElementById('user-translation-input').value = state.translations[state.current] || '';

    document.getElementById('btn-prev-sentence').disabled = (state.current === 0);
    var nextBtn = document.getElementById('btn-next-sentence');
    if (state.current === state.sentences.length - 1) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'End of Passage';
    } else {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Next →';
    }

    var completionPanel = document.getElementById('completion-panel');
    if (state.current === state.sentences.length - 1) {
      renderCompletionSummary();
      completionPanel.classList.remove('hidden');
    } else {
      completionPanel.classList.add('hidden');
    }

    var refPanel = document.getElementById('reference-panel');
    var refDisplay = document.getElementById('reference-text-display');
    if(state.refMismatch) {

      refDisplay.innerHTML = '<span style="display:block; font-family:\'IBM Plex Mono\',monospace; font-size:10px; color:var(--rubric); font-style:normal; margin-bottom:8px;">⚠ This reference translation has ' + state.refTranslations.length + ' segment(s) but the passage has ' + state.sentences.length + ' sentence(s), so per-sentence alignment isn\'t reliable — showing the full reference text instead.</span>' + escapeHtml(state.refFullText);
      refPanel.style.display = 'block';
    } else if(state.refTranslations && state.refTranslations[state.current]) {
      refDisplay.textContent = state.refTranslations[state.current];
      refPanel.style.display = 'block';
    } else {
      refPanel.style.display = 'none';
    }

    if(interlinearActive) buildInterlinearView();
    if(syntaxModeActive) renderSyntaxCanvas();
  }

  function renderCompletionSummary() {
    var collationBox = document.getElementById('full-collation-text');
    var fullText = state.translations.map(function(t, i){
      return (i + 1) + '. ' + (t.trim() ? t.trim() : '[Draft missing]');
    }).join('\n\n');
    collationBox.textContent = fullText;

    renderEndGlossaryList();
  }

  function renderEndGlossaryList() {
    var list = document.getElementById('end-glossary-list');
    list.innerHTML = '';
    var glossary = getAutoParsedGlossary();

    if(glossary.length === 0) {
      list.innerHTML = '<div style="font-family:\'IBM Plex Mono\', monospace; font-size:12px; color:var(--ink-faint); padding: 8px;">No text found in passage.</div>';
      return;
    }

    glossary.forEach(function(item){
      var logeionUrl = 'https://logeion.uchicago.edu/' + encodeURIComponent(item.word);
      var row = document.createElement('div');
      row.className = 'glossary-item';
      row.innerHTML = '<div><a href="' + logeionUrl + '" target="_blank" class="glossary-term" style="text-decoration:none; color:var(--ink);">' + escapeHtml(item.word) + ' ↗</a></div>' +
                      '<a href="' + logeionUrl + '" target="_blank" class="btn-ghost" style="font-size:11px;">Logeion Dictionary</a>';
      list.appendChild(row);
    });
  }

  function sanitizeFilename(str) {
    return str
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Untitled';
  }

  document.getElementById('btn-copy-collation').addEventListener('click', function(){
    var collationBox = document.getElementById('full-collation-text');
    navigator.clipboard.writeText(collationBox.textContent).then(function(){
      alert('Complete translation copied to clipboard!');
    });
  });

  document.getElementById('btn-export-markdown').addEventListener('click', function(){
    var glossary = getAutoParsedGlossary();
    var md = '# ' + state.title + '\n\n## Source Text\n' + state.sentences.join(' ') + '\n\n## Full Translation Collation\n' + state.translations.join('\n\n') + '\n\n## Passage Vocabulary (' + glossary.length + ' words)\n' + glossary.map(function(g){ return '- ' + g.word; }).join('\n');
    var blob = new Blob([md], {type: 'text/markdown'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(state.title) + '_Verbum_Report.md';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-export-anki').addEventListener('click', function(){
    var glossary = getAutoParsedGlossary();
    if(glossary.length === 0) {
      alert('No words found in passage.');
      return;
    }
    var csv = glossary.map(function(g){
      return '"' + g.word + '",""';
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/csv'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(state.title) + '_Anki_Cards.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  function rebindWordEvents() {
    var container = document.getElementById('active-sentence-card');
    var wordsArray = Array.from(container.querySelectorAll('.word'));

    wordsArray.forEach(function(span) {
      span.onclick = function(e){
        e.stopPropagation();
        if(syntaxModeActive) return;

        wordsArray.forEach(function(w){ w.classList.remove('picked'); });
        this.classList.add('picked');
        
        var rect = this.getBoundingClientRect();
        var wordKey = this.getAttribute('data-word-key');
        openColorMenu(this.textContent, wordKey, rect.left + (rect.width / 2), rect.top);
      };
      span.onkeydown = function(e){
        if(e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
      };
    });
  }

  function openColorMenu(word, wordKey, clientX, clientY) {
    var logeionUrl = 'https://logeion.uchicago.edu/' + encodeURIComponent(word);

    var contentHtml = '<div style="font-family:\'Cardo\'; font-size:16px; font-weight:bold; color:var(--ink); margin-bottom:2px;">' + escapeHtml(word) + '</div>' +
                      '<div style="font-size:10px; color:var(--ink-soft); margin-bottom:6px;">Highlight Color:</div>' +
                      '<div class="color-swatch-grid">' +
                        '<button class="color-btn" data-val="red" title="Red" aria-label="Highlight red"></button>' +
                        '<button class="color-btn" data-val="green" title="Green" aria-label="Highlight green"></button>' +
                        '<button class="color-btn" data-val="blue" title="Blue" aria-label="Highlight blue"></button>' +
                        '<button class="color-btn" data-val="yellow" title="Yellow" aria-label="Highlight yellow"></button>' +
                        '<button class="color-btn" data-val="bronze" title="Bronze" aria-label="Highlight bronze"></button>' +
                        '<button class="color-btn" data-val="purple" title="Purple" aria-label="Highlight purple"></button>' +
                      '</div>' +
                      '<button class="btn-ghost" id="clear-color-btn" style="width:100%; font-size:10px; padding:3px 0; margin-bottom:6px;">Clear Highlight ✕</button>' +
                      '<a class="logeion-link" href="' + logeionUrl + '" target="_blank">Open in Logeion ↗</a>';

    showWordColorMenu(clientX, clientY, contentHtml);

    setTimeout(function(){
      var menu = document.getElementById('word-color-menu');
      
      menu.querySelectorAll('.color-btn').forEach(function(btn){
        btn.onclick = function(){
          var c = this.getAttribute('data-val');
          if(!state.wordColors) state.wordColors = {};
          state.wordColors[wordKey] = c;
          persist();
          
          var wordEl = document.querySelector('[data-word-key="' + wordKey + '"]');
          if(wordEl) wordEl.setAttribute('data-color', c);
          menu.style.display = 'none';
        };
      });

      var clearBtn = document.getElementById('clear-color-btn');
      if(clearBtn) {
        clearBtn.onclick = function(){
          if(state.wordColors && state.wordColors[wordKey]) {
            delete state.wordColors[wordKey];
            persist();
          }
          var wordEl = document.querySelector('[data-word-key="' + wordKey + '"]');
          if(wordEl) wordEl.removeAttribute('data-color');
          menu.style.display = 'none';
        };
      }
    }, 50);
  }

  function showWordColorMenu(x, y, htmlContent){
    var menu = document.getElementById('word-color-menu');
    menu.innerHTML = htmlContent;

    var vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    var vTop = window.visualViewport ? window.visualViewport.offsetTop : 0;

    var menuW = Math.min(220, vw - 24);
    menu.style.width = menuW + 'px';

    var posX = Math.round(x - (menuW / 2));
    if (posX + menuW > vw - 12) posX = vw - menuW - 12;
    if (posX < 12) posX = 12;

    var posY = Math.round(y - 70);
    if (posY < vTop + 12) posY = y + 30;

    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';
    menu.style.display = 'block';
  }

  document.addEventListener('click', function(e){
    var menu = document.getElementById('word-color-menu');
    if(!e.target.closest('.word') && !e.target.closest('#word-color-menu')) {
      menu.style.display = 'none';
      document.querySelectorAll('.word.picked').forEach(function(w){ w.classList.remove('picked'); });
    }
  });

  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape') return;

    var menu = document.getElementById('word-color-menu');
    if(menu && menu.style.display === 'block') {
      menu.style.display = 'none';
      document.querySelectorAll('.word.picked').forEach(function(w){ w.classList.remove('picked'); });
    }

    if(syntaxSourceWord) {
      clearSyntaxSourceHighlight();
      var statusEl = document.getElementById('syntax-status');
      if(statusEl) statusEl.textContent = 'Cancelled selection.';
    }
  });

  document.getElementById('btn-toggle-interlinear').addEventListener('click', function(){
    interlinearActive = !interlinearActive;
    var container = document.getElementById('interlinear-container');
    var status = document.getElementById('interlinear-status');
    
    if(interlinearActive) {
      container.classList.remove('hidden');
      status.textContent = 'Active (Columnar Workspace)';
      this.style.background = 'var(--verdigris)';
      this.style.color = 'var(--paper)';
      buildInterlinearView();
    } else {
      container.classList.add('hidden');
      status.textContent = 'Off';
      this.style.background = 'transparent';
      this.style.color = 'var(--ink-soft)';
    }
  });

  document.getElementById('btn-save-interlinear').addEventListener('click', function(){
    collectInterlinearInputs();
    persist();
    alert('Interlinear gloss notes saved.');
  });

  function buildInterlinearView() {
    var listContainer = document.getElementById('interlinear-rows-list');
    listContainer.innerHTML = '';

    var currentText = state.sentences[state.current];
    var words = currentText.match(/[\p{L}\p{M}]+/gu) || [];
    
    if(!state.interlinearNotes) state.interlinearNotes = {};
    if(!state.interlinearNotes[state.current]) state.interlinearNotes[state.current] = {};

    words.forEach(function(w, idx){
      var existingVal = state.interlinearNotes[state.current][idx] || '';
      var logeionUrl = 'https://logeion.uchicago.edu/' + encodeURIComponent(w);

      var group = document.createElement('div');
      group.className = 'interlinear-word-group';
      group.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<span class="interlinear-orig">' + escapeHtml(w) + '</span>' +
                        '<a href="' + logeionUrl + '" target="_blank" style="font-size:10px; color:var(--verdigris); text-decoration:none;" title="Logeion">↗</a>' +
                        '</div>' +
                        '<input type="text" class="interlinear-custom-gloss" data-word-idx="' + idx + '" value="' + escapeHtml(existingVal) + '" placeholder="gloss...">';
      listContainer.appendChild(group);
    });
  }

  function collectInterlinearInputs() {
    if(!state.interlinearNotes) state.interlinearNotes = {};
    if(!state.interlinearNotes[state.current]) state.interlinearNotes[state.current] = {};

    var inputs = document.querySelectorAll('.interlinear-custom-gloss');
    inputs.forEach(function(input){
      var idx = input.getAttribute('data-word-idx');
      state.interlinearNotes[state.current][idx] = input.value.trim();
    });
    hasUnsavedGloss = false;
  }

  document.getElementById('interlinear-rows-list').addEventListener('input', function(e){
    if(e.target.classList.contains('interlinear-custom-gloss')) {
      hasUnsavedGloss = true;
    }
  });

  document.getElementById('btn-toggle-syntax').addEventListener('click', function(){
    syntaxModeActive = !syntaxModeActive;
    var panel = document.getElementById('syntax-tree-panel');
    var status = document.getElementById('syntax-status');
    
    if(syntaxModeActive) {
      panel.classList.remove('hidden');
      status.textContent = 'Canvas Mode: Click dependent word badge, then head word badge.';
      this.style.background = 'var(--verdigris)';
      this.style.color = 'var(--paper)';
      renderSyntaxCanvas();
    } else {
      panel.classList.add('hidden');
      status.textContent = 'Click a word, then click its head word';
      this.style.background = 'transparent';
      this.style.color = 'var(--ink-soft)';
      clearSyntaxSourceHighlight();
    }
  });

  document.getElementById('syntax-clear-links').addEventListener('click', function(){
    if(!state.syntaxLinks) state.syntaxLinks = {};
    state.syntaxLinks[state.current] = [];
    persist();
    renderSyntaxCanvas();
    updateDashboardStats();
  });

  function clearSyntaxSourceHighlight(){
    syntaxSourceWord = null;
    document.querySelectorAll('.syntax-node-badge').forEach(function(b){ b.style.borderColor = 'var(--verdigris)'; });
  }

  function renderSyntaxCanvas() {
    var canvas = document.getElementById('syntax-canvas');
    canvas.innerHTML = '';

    var currentText = state.sentences[state.current];
    var words = currentText.match(/[\p{L}\p{M}]+/gu) || [];
    var total = words.length;
    if(total === 0) return;

    var minStep = 100;
    var visibleWidth = canvas.clientWidth || 800;
    var totalCanvasWidth = Math.max(visibleWidth, (total + 1) * minStep);
    var stepX = totalCanvasWidth / (total + 1);

    var svgNs = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("width", totalCanvasWidth + "px");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    canvas.appendChild(svg);

    if(state.syntaxLinks && state.syntaxLinks[state.current]) {
      state.syntaxLinks[state.current].forEach(function(link){
        var x1 = stepX * (link.fromIdx + 1);
        var x2 = stepX * (link.toIdx + 1);
        var line = document.createElementNS(svgNs, "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", "125");
        line.setAttribute("x2", x2);
        line.setAttribute("y2", "35");
        line.setAttribute("stroke", "var(--bronze)");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("stroke-dasharray", "4");
        svg.appendChild(line);
      });
    }

    words.forEach(function(w, idx){
      var badge = document.createElement('div');
      badge.className = 'syntax-node-badge';
      badge.textContent = w;
      badge.setAttribute('tabindex', '0');
      badge.setAttribute('role', 'button');
      badge.setAttribute('aria-label', 'Syntax node: ' + w + '. Activate to select as dependent or head word.');
      var posX = stepX * (idx + 1);
      badge.style.left = posX + 'px';
      badge.style.bottom = '16px';

      badge.onclick = function(e){
        e.stopPropagation();
        if(!syntaxSourceWord) {
          syntaxSourceWord = { index: idx, text: w };
          badge.style.borderColor = 'var(--rubric)';
          document.getElementById('syntax-status').textContent = 'Selected "' + w + '". Now click its Head word.';
        } else {
          if(syntaxSourceWord.index === idx) {
            clearSyntaxSourceHighlight();
            document.getElementById('syntax-status').textContent = 'Cancelled selection.';
            return;
          }
          if(!state.syntaxLinks) state.syntaxLinks = {};
          if(!state.syntaxLinks[state.current]) state.syntaxLinks[state.current] = [];

          state.syntaxLinks[state.current].push({
            fromIdx: syntaxSourceWord.index,
            fromText: syntaxSourceWord.text,
            toIdx: idx,
            toText: w
          });

          persist();
          renderSyntaxCanvas();
          updateDashboardStats();
          clearSyntaxSourceHighlight();
          document.getElementById('syntax-status').textContent = 'Link mapped successfully!';
        }
      };
      badge.onkeydown = function(e){
        if(e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          badge.click();
        }
      };

      canvas.appendChild(badge);
    });

    renderSyntaxLinksList();
  }

  function renderSyntaxLinksList() {
    var listContainer = document.getElementById('syntax-links-list');
    listContainer.innerHTML = '';
    
    if(!state.syntaxLinks || !state.syntaxLinks[state.current] || state.syntaxLinks[state.current].length === 0) {
      listContainer.innerHTML = '<span style="color:var(--ink-faint);">No dependency connections mapped for this sentence yet.</span>';
      return;
    }

    state.syntaxLinks[state.current].forEach(function(link, idx){
      var pill = document.createElement('div');
      pill.style.background = 'var(--paper)';
      pill.style.border = '1px solid var(--line-strong)';
      pill.style.padding = '2px 8px';
      pill.style.borderRadius = '3px';
      pill.innerHTML = '<span><strong>' + escapeHtml(link.fromText) + '</strong> → <em>head:</em> ' + escapeHtml(link.toText) + '</span> ' +
                       '<span style="cursor:pointer; color:var(--rubric); font-weight:bold;" data-link-idx="' + idx + '">✕</span>';
      listContainer.appendChild(pill);
    });

    listContainer.querySelectorAll('[data-link-idx]').forEach(function(delBtn){
      delBtn.addEventListener('click', function(){
        var linkIdx = parseInt(this.getAttribute('data-link-idx'), 10);
        state.syntaxLinks[state.current].splice(linkIdx, 1);
        persist();
        renderSyntaxCanvas();
        updateDashboardStats();
      });
    });
  }

  function collectTranslationDraft() {
    var draft = document.getElementById('user-translation-input').value;
    state.translations[state.current] = draft;
    hasUnsavedTranslation = false;
  }

  document.getElementById('user-translation-input').addEventListener('input', function(){
    hasUnsavedTranslation = true;
  });

  document.getElementById('btn-save-translation').addEventListener('click', function(){
    if(interlinearActive) collectInterlinearInputs();
    collectTranslationDraft();
    persist();
    
    if (state.current === state.sentences.length - 1) {
      renderCompletionSummary();
    }
    alert('Translation draft saved.');
  });

  document.getElementById('btn-prev-sentence').addEventListener('click', function(){
    if(state.current > 0) {
      if(interlinearActive) collectInterlinearInputs();
      collectTranslationDraft();
      persist();
      state.current--;
      renderSentence();
    }
  });

  document.getElementById('btn-next-sentence').addEventListener('click', function(){
    if(state.current < state.sentences.length - 1) {
      if(interlinearActive) collectInterlinearInputs();
      collectTranslationDraft();
      persist();
      state.current++;
      renderSentence();
    }
  });

  try {
    var saved = localStorage.getItem('verbum_state_full');
    if(saved) {
      var parsed = JSON.parse(saved);
      if(parsed && parsed.sentences && parsed.sentences.length > 0) {
        state = parsed;
        if(!state.wordColors) state.wordColors = {};
        if(!state.syntaxLinks) state.syntaxLinks = {};
        if(!state.interlinearNotes) state.interlinearNotes = {};
        showPractice();
      }
    }
  } catch(e){}

})();
