<!-- העברת פרמטרי קמפיין (utm_*, gclid, fbclid וכו') לכל קישור פנימי — כולל הפופאפ.
     להדביק ב-Elementor Pro → הגדרות אתר → Custom Code → מיקום </body> (או להחליף את ווידג'ט ה-HTML בדף). -->
<script>
(function () {
  var KEY = 'bcure_lp_params';
  var HOST = location.hostname;

  // 1. פרמטרים מהכתובת הנוכחית. אם אין, מה שנשמר מהנחיתה (עובד גם אחרי ריענון או ניווט פנימי).
  var current = location.search.length > 1 ? location.search.slice(1) : '';
  var stored = '';
  try { stored = sessionStorage.getItem(KEY) || ''; } catch (e) {}
  if (current) { try { sessionStorage.setItem(KEY, current); } catch (e) {} }
  var qs = current || stored;
  if (!qs) return;
  var params = new URLSearchParams(qs);

  function decorate(a) {
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(tel:|mailto:|javascript:|whatsapp:)/i.test(href)) return;
    var url;
    try { url = new URL(href, location.href); } catch (e) { return; }
    if (url.hostname !== HOST) return;                 // רק קישורים פנימיים (השאלון, דף תודה וכו')
    var changed = false;
    params.forEach(function (v, k) {
      if (!url.searchParams.has(k)) { url.searchParams.append(k, v); changed = true; }
    });
    if (changed) a.setAttribute('href', url.toString());
  }

  function decorateAll(root) { (root || document).querySelectorAll('a[href]').forEach(decorate); }

  // 2. בטעינה, אחרי פתיחת פופאפ של אלמנטור, וגם ברגע הלחיצה (רשת ביטחון לקישורים שנוספו מאוחר)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { decorateAll(); });
  else decorateAll();
  if (window.jQuery) jQuery(document).on('elementor/popup/show', function (e, id, popup) { decorateAll(popup && popup.$element && popup.$element[0]); });
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) decorate(a);
  }, true);
})();
</script>
