(function(){
  "use strict";

  /* Header solid-on-scroll */
  var header = document.querySelector('.site-header');
  function onScroll(){
    if(!header) return;
    if(window.scrollY > 10){ header.classList.add('solid'); }
    else { header.classList.remove('solid'); }
  }
  document.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  /* Mobile menu */
  var toggle = document.querySelector('.nav-toggle');
  var panel = document.querySelector('.mobile-panel');
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
     Contact form: validates every required field, then hands the
     inquiry off to the visitor's email client (no backend exists to
     receive it server-side). WhatsApp is a completely separate, always
     -available link elsewhere on the page — it never depends on this
     form being valid or even touched.
  ------------------------------------------------------------------ */
  var form = document.getElementById('inquiry-form');
  if(form){
    var PHONE_RE = /^[+]?[\d\s().-]{7,20}$/;
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    form.addEventListener('submit', function(e){
      e.preventDefault();
      var status = document.getElementById('form-status');
      var ok = true;
      var firstInvalid = null;
      validated.forEach(function(f){
        var fieldOk = validateField(f);
        if(!fieldOk){ ok = false; if(!firstInvalid) firstInvalid = f; }
      });

      if(!ok){
        if(status){
          status.textContent = form.getAttribute('data-i18n-error');
          status.classList.add('show','error');
        }
        if(firstInvalid) firstInvalid.focus();
        return;
      }

      var data = new FormData(form);
      var get = function(k){ return (data.get(k)||'').toString().trim(); };
      var type = get('project_type') || '-';
      var name = get('name'), phone = get('phone'), email = get('email'), loc = get('location'), msg = get('message');

      var subject = (form.getAttribute('data-i18n-subject') || 'New Project Inquiry') + ' \u2014 ' + name;
      var bodyLines = [
        form.getAttribute('data-i18n-project') + ': ' + type,
        form.getAttribute('data-i18n-name') + ': ' + name,
        form.getAttribute('data-i18n-phone') + ': ' + phone,
        form.getAttribute('data-i18n-email') + ': ' + email,
        form.getAttribute('data-i18n-location') + ': ' + (loc || '-'),
        '',
        form.getAttribute('data-i18n-message') + ':',
        msg
      ];
      var mailto = 'mailto:' + form.getAttribute('data-email')
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(bodyLines.join('\n'));

      if(status){
        status.textContent = form.getAttribute('data-i18n-success');
        status.classList.remove('error');
        status.classList.add('show');
      }
      window.location.href = mailto;
      form.reset();
      validated.forEach(clearError);
    });
  }
})();
