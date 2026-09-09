(function(){
  "use strict";

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
    toggle.addEventListener('click', function(){
      var open = panel.classList.toggle('open');
      toggle.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      toggle.setAttribute('aria-expanded', open ? 'true':'false');
    });
    panel.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        panel.classList.remove('open');
        toggle.classList.remove('open');
        document.body.style.overflow='';
      });
    });
  }

  /* Reveal on scroll */
  var reveals = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window && reveals.length){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, {threshold:0.02, rootMargin:'0px 0px -10px 0px'});
    reveals.forEach(function(el){ io.observe(el); });
  } else {
    reveals.forEach(function(el){ el.classList.add('in'); });
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
})();
