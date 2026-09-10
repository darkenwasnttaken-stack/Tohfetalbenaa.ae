(function(){
  "use strict";

  document.documentElement.classList.add('js');

  /* The <head> failsafe force-reveals everything after a long delay in case
     this file never loads. It has, so cancel it now and let the scroll
     observer below do the reveals as designed. */
  if (window.__revealFailsafe) { clearTimeout(window.__revealFailsafe); window.__revealFailsafe = null; }

  /* Reveal-on-scroll content is guaranteed visible no matter what: it's only
     hidden under html.js, and if anything below throws before the observer is
     wired up, this catch reveals everything immediately. */
  function revealAll(){
    var r = document.querySelectorAll('.reveal:not(.in)');
    for (var i = 0; i < r.length; i++) r[i].classList.add('in');
    var hero = document.querySelector('.hero');
    if (hero) hero.classList.add('is-in');   /* homepage hero entrance state */
  }

  /* Stamp the current year into any .cyr element (footer copyright) so it never
     goes stale; the hard-coded value in the HTML is the no-JS fallback. */
  try {
    var y = String(new Date().getFullYear());
    var yr = document.querySelectorAll('.cyr');
    for (var yi = 0; yi < yr.length; yi++) yr[yi].textContent = y;
  } catch(e){}

  try {

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var panel = document.querySelector('.mobile-panel');

  /* Full nav vs. hamburger — decided by whether the whole bar actually fits
     on one line, re-checked on every resize, rather than at a fixed width.
     The class is removed first so the measurement reads the full nav's real
     width; if the header content is then wider than the header, collapse.
     Runs inside a rAF on resize, so the intermediate state is never painted. */
  function measureNav(){
    if(!header) return;
    header.classList.remove('nav-collapsed');
    if(header.scrollWidth > header.clientWidth + 1){
      header.classList.add('nav-collapsed');
    } else if(panel && panel.classList.contains('open')){
      /* the full bar fits again (e.g. a tablet rotated to landscape) — don't
         leave the mobile overlay stuck open with no visible way back */
      panel.classList.remove('open');
      if(toggle){ toggle.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); }
      document.body.style.overflow = '';
    }
    header.classList.add('nav-ready');
  }

  /* Header solid-on-scroll */
  var lastSolid = null;
  function onScroll(){
    if(!header) return;
    var solid = window.scrollY > 10;
    if(solid === lastSolid) return;
    lastSolid = solid;
    header.classList.toggle('solid', solid);
  }
  document.addEventListener('scroll', onScroll, {passive:true});

  onScroll();
  measureNav();

  var navRaf = null;
  window.addEventListener('resize', function(){
    if(navRaf) cancelAnimationFrame(navRaf);
    navRaf = requestAnimationFrame(measureNav);
  }, {passive:true});
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(measureNav);
  }

  /* Mobile menu */
  if(toggle && panel){
    var firstPanelLink = panel.querySelector('a');
    function closePanel(returnFocus){
      panel.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
      document.body.style.overflow='';
      if(returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', function(){
      var open = panel.classList.toggle('open');
      toggle.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      toggle.setAttribute('aria-expanded', open ? 'true':'false');
      if(open && firstPanelLink) firstPanelLink.focus();
    });
    panel.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ closePanel(false); });
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && panel.classList.contains('open')) closePanel(true);
    });
  }

  /* Reveal on scroll. The negative bottom margin holds the reveal until the
     element is a little way into the viewport, so the fade/rise is actually
     seen playing rather than finishing off-screen. Items that share a row
     (grid/flex siblings) get a short stagger so they cascade in.

     On the homepage the reveal REPLAYS: when an element scrolls fully out of
     view it resets to hidden, so it animates again on the way back (up or
     down). Elsewhere it plays once and is left alone. */
  var reveals = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window && reveals.length){
    /* IN: add .in once the element is a little way into view. Grouped
       siblings get a stagger; the stagger delay is dropped ~1s later so it
       can't slow any later transition on the same element. */
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var el = en.target;
        var parent = el.parentNode;
        if(parent){
          var sibs = parent.querySelectorAll(':scope > .reveal');
          var idx = Array.prototype.indexOf.call(sibs, el);
          if(idx > 0 && sibs.length > 1){
            el.style.transitionDelay = (Math.min(idx, 4) * 75) + 'ms';
            setTimeout(function(node){ return function(){ node.style.transitionDelay = ''; }; }(el), 1000);
          }
        }
        el.classList.add('in');
      });
    }, {threshold:0.05, rootMargin:'0px 0px -80px 0px'});
    reveals.forEach(function(el){ io.observe(el); });

    /* OUT: a second observer with no margin — when it reports the element is
       0% visible it is genuinely off-screen, so reset it to hidden and it
       animates again the next time it scrolls into view, up or down. */
    var ioOut = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting) return;
        en.target.classList.remove('in');
        en.target.style.transitionDelay = '';
      });
    }, {threshold:0});
    reveals.forEach(function(el){ ioOut.observe(el); });
  } else {
    reveals.forEach(function(el){ el.classList.add('in'); });
  }

  /* Homepage hero — replay its entrance every time it comes back into view
     (i.e. also when you scroll back up to the top), via `.is-in` on .hero.
     Arms when the hero is meaningfully visible; only disarms once it's
     completely gone, so the exit is never seen mid-scroll. */
  if(document.body.classList.contains('home-snap')){
    var heroEl = document.querySelector('.hero');
    if(heroEl && 'IntersectionObserver' in window){
      new IntersectionObserver(function(es){
        es.forEach(function(e){
          if(e.intersectionRatio >= 0.12) heroEl.classList.add('is-in');
          else if(e.intersectionRatio <= 0.001) heroEl.classList.remove('is-in');
        });
      }, {threshold:[0, 0.12, 0.4]}).observe(heroEl);
    } else if(heroEl){
      heroEl.classList.add('is-in');
    }
  }

  /* Homepage "Selected Works" — arrow controls + edge fade for the card strip.
     Injected here (not in the HTML) so it only exists where JS runs and only
     on the snap homepage; phones just swipe, the buttons show from 900px up. */
  if (document.body.classList.contains('home-snap')) {
    var strip = document.querySelector('.proj-grid');
    var stripHead = document.querySelector('.section-head');
    if (strip && stripHead) {
      var nav = document.createElement('div');
      nav.className = 'strip-nav';
      nav.innerHTML =
        '<button type="button" class="strip-btn" data-dir="prev" aria-label="Previous projects">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
        '<button type="button" class="strip-btn" data-dir="next" aria-label="Next projects">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>';
      stripHead.appendChild(nav);

      var stripRtl = getComputedStyle(strip).direction === 'rtl';
      var prevBtn = nav.querySelector('[data-dir="prev"]');
      var nextBtn = nav.querySelector('[data-dir="next"]');

      var stripStep = function(){
        var card = strip.querySelector('.proj-card');
        var w = (card ? card.getBoundingClientRect().width : 306) + 14;
        /* ~1.6 cards per click: enough to feel like real progress, small
           enough that it always takes a few clicks to reach the end */
        return Math.round(w * 1.6);
      };
      var syncStrip = function(){
        var max = strip.scrollWidth - strip.clientWidth - 1;
        var sl = Math.abs(strip.scrollLeft);
        var atStart = sl <= 1, atEnd = sl >= max;
        strip.classList.toggle('at-start', atStart);
        strip.classList.toggle('at-end', atEnd);
        prevBtn.disabled = atStart;
        nextBtn.disabled = atEnd;
      };

      nav.addEventListener('click', function(e){
        var b = e.target.closest('.strip-btn');
        if (!b) return;
        var amt = stripStep() * (b.getAttribute('data-dir') === 'next' ? 1 : -1) * (stripRtl ? -1 : 1);
        strip.scrollBy({ left: amt, behavior: 'smooth' });
        setTimeout(syncStrip, 60);     // in case the smooth scroll is instant / throttled
        setTimeout(syncStrip, 550);    // after it settles
      });

      var stripRaf = null;
      var queueSync = function(){
        if (stripRaf) return;
        stripRaf = requestAnimationFrame(function(){ stripRaf = null; syncStrip(); });
      };
      strip.addEventListener('scroll', queueSync, { passive: true });
      window.addEventListener('resize', queueSync, { passive: true });
      syncStrip();
    }
  }

  /* Animated counters */
  var counters = document.querySelectorAll('[data-count]');
  function animateCount(el){
    var raw = el.getAttribute('data-count');
    var target = parseFloat(raw);
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1400, start = null;
    var isInt = Number.isInteger(target);
    function step(ts){
      if(!start) start = ts;
      var p = Math.min((ts-start)/dur, 1);
      var eased = 1 - Math.pow(1-p, 3);
      var val = target*eased;
      el.textContent = (isInt ? Math.round(val) : val.toFixed(1)) + suffix;
      if(p < 1) requestAnimationFrame(step);
      else el.textContent = raw + suffix;
    }
    requestAnimationFrame(step);
  }
  if('IntersectionObserver' in window && counters.length){
    var cio = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ animateCount(en.target); cio.unobserve(en.target); }
      });
    }, {threshold:0.5});
    counters.forEach(function(el){ cio.observe(el); });
  } else {
    counters.forEach(function(el){ el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix')||''); });
  }

  /* ------------------------------------------------------------------
     Contact form. Validates every required field client-side, then POSTs
     to contact-handler.php, which sends the inquiry over authenticated
     SMTP to info@tohfetalbenaa.ae (visitor address goes in Reply-To).
     The server re-validates everything and is the source of truth; this
     is just fast feedback + a nicer UX. WhatsApp elsewhere on the page is
     a separate, always-available path that never depends on this form.
  ------------------------------------------------------------------ */
  var form = document.getElementById('inquiry-form');
  if(form){
    var PHONE_RE = /^[+]?[\d\s().-]{7,20}$/;
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /* Stamp the moment the form became ready. The handler rejects
       submissions that arrive implausibly fast (bots). */
    var tsField = form.querySelector('input[name="ts"]');
    if(tsField) tsField.value = String(Math.floor(Date.now() / 1000));

    function setError(field, msg){
      var wrap = field.closest('.field');
      if(!wrap) return;
      wrap.classList.add('has-error');
      var err = wrap.querySelector('.field-error');
      if(err) err.textContent = msg;
      field.setAttribute('aria-invalid', 'true');
    }
    function clearError(field){
      var wrap = field.closest('.field');
      if(!wrap) return;
      wrap.classList.remove('has-error');
      field.removeAttribute('aria-invalid');
    }
    function validateField(field){
      var val = (field.value || '').trim();
      var required = field.hasAttribute('required');
      var ds = field.dataset;
      if(required && !val){
        setError(field, ds.errRequired || 'This field is required.');
        return false;
      }
      if(field.type === 'email' && val && !EMAIL_RE.test(val)){
        setError(field, ds.errFormat || 'Please enter a valid email address.');
        return false;
      }
      if(field.type === 'tel' && val && !PHONE_RE.test(val)){
        setError(field, ds.errFormat || 'Please enter a valid phone number.');
        return false;
      }
      clearError(field);
      return true;
    }

    var validated = form.querySelectorAll('input[required], textarea[required], input[type="email"], input[type="tel"]');
    validated.forEach(function(f){
      f.addEventListener('blur', function(){ validateField(f); });
      f.addEventListener('input', function(){ if(f.closest('.field').classList.contains('has-error')) validateField(f); });
    });

    var submitBtn = form.querySelector('button[type="submit"]');
    var btnHTML   = submitBtn ? submitBtn.innerHTML : '';   // keeps the arrow icon
    var sending   = false;   // request in flight
    var done      = false;   // a submission already succeeded on this page view

    function showStatus(kind, msg){
      var status = document.getElementById('form-status');
      if(!status) return;
      status.textContent = msg;
      status.classList.remove('error','success');
      status.classList.add('show', kind === 'ok' ? 'success' : 'error');
    }
    function setBusy(on){
      sending = on;
      if(submitBtn) submitBtn.disabled = on || done;
    }
    function setButton(text){        // text = string -> plain label; null -> restore original
      if(!submitBtn) return;
      if(text == null) submitBtn.innerHTML = btnHTML;
      else submitBtn.textContent = text;
    }

    form.addEventListener('submit', function(e){
      e.preventDefault();

      // Prevent duplicate submissions: already sent, or one is in flight.
      if(done || sending) return;

      var firstInvalid = null;
      validated.forEach(function(f){
        if(!validateField(f) && !firstInvalid) firstInvalid = f;
      });
      if(firstInvalid){
        showStatus('error', form.getAttribute('data-i18n-invalid') || 'Please complete the highlighted fields and try again.');
        firstInvalid.focus();
        return;
      }

      var endpoint = form.getAttribute('action') || 'contact-handler.php';
      var okMsg    = form.getAttribute('data-i18n-success') || 'Thank you \u2014 your inquiry has been sent.';
      var errMsg   = form.getAttribute('data-i18n-error')   || 'Something went wrong. Please try again.';

      var sendingMsg = form.getAttribute('data-i18n-sending') || 'Sending\u2026';
      setBusy(true);
      setButton(sendingMsg);
      showStatus('ok', sendingMsg);

      fetch(endpoint, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        credentials: 'same-origin'
      })
      .then(function(res){
        return res.text().then(function(text){
          var data = null;
          try { data = JSON.parse(text); } catch(_){}
          return { status: res.status, ok: res.ok, data: data };
        });
      })
      .then(function(r){
        if(r.data && r.data.ok){
          done = true;
          showStatus('ok', r.data.message || okMsg);
          setBusy(false);
          setButton(form.getAttribute('data-i18n-sent') || 'Sent \u2713');
          form.reset();
          validated.forEach(clearError);
          if(tsField) tsField.value = String(Math.floor(Date.now() / 1000));
          return;
        }

        // Per-field errors from the server.
        if(r.data && r.data.errors && r.data.errors.length){
          r.data.errors.forEach(function(nameAttr){
            var fld = form.querySelector('[name="' + nameAttr + '"]');
            if(fld) setError(fld, (fld.dataset && fld.dataset.errFormat) || 'Please check this field.');
          });
        }

        if(r.data === null){
          // Not JSON \u2014 almost always local preview (no PHP) or a server error page.
          var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
          showStatus('error', local
            ? 'The form needs the PHP handler, which doesn\u2019t run in local preview. It will work once the site is on Hostinger.'
            : errMsg);
        } else {
          showStatus('error', r.data.message || errMsg);
        }
        setBusy(false);
        setButton(null);
      })
      .catch(function(){
        showStatus('error', errMsg);
        setBusy(false);
        setButton(null);
      });
    });
  }

  } catch(err){
    /* Something above broke — make sure no content is left hidden. */
    revealAll();
    if (window.console && console.error) console.error('main.js:', err);
  }
})();
