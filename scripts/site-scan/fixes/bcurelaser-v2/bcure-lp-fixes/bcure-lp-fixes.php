<?php
/**
 * Plugin Name: B-Cure LP Fixes (bcurelaser-v2)
 * Description: תיקוני QA לדף הנחיתה bcurelaser-v2 — title/description/OG, באנר עוגיות בעברית, פופאפ מול באנר, נגישות ומובייל. פועל רק על הדפים שב-BCURE_LP_PAGE_IDS.
 * Version: 1.0.0
 * Author: vitas-reports / site-scan
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ───────────────────────── הגדרות — למלא כאן ───────────────────────── */

/** מזהי הדפים שהתוסף פועל עליהם (page-id מה-body class). */
const BCURE_LP_PAGE_IDS = array( 15964 );

/** בנוסף: כל דף שה-slug שלו מתחיל באחת מהתחיליות האלה (מכסה עותקים כמו bcurelaser-v2-copy / bcurelaser-v3). */
const BCURE_LP_SLUG_PREFIXES = array( 'bcurelaser-v' );

/** טלפון לחיוג בפס הדביק במובייל. ריק = לא מוסיפים כפתור. דוגמה: '03-1234567' */
const BCURE_LP_PHONE = '';

/** מספר וואטסאפ בפורמט בינלאומי בלי + ובלי רווחים. ריק = לא מוסיפים כפתור. דוגמה: '972501234567' */
const BCURE_LP_WHATSAPP = '';

/** טקסט פתיחה להודעת וואטסאפ. */
const BCURE_LP_WHATSAPP_TEXT = 'היי, הגעתי מדף הנחיתה של בי-קיור לייזר ואשמח לפרטים';

/** SEO / שיתוף */
const BCURE_LP_TITLE       = 'בי-קיור לייזר | 30 ימי התנסות בהחזר כספי מלא';
const BCURE_LP_DESCRIPTION = 'מכשיר לייזר קר ביתי לטיפול בכאבים, דלקות והחלמה מהירה. פטנט ישראלי, מאושר משרד הבריאות, יותר מ-350,000 מכשירים נמכרו. 30 ימי התנסות בהחזר כספי מלא.';
/** תמונת שיתוף 1200×630. ריק = משתמשים בתמונה המומלצת של הדף אם קיימת. */
const BCURE_LP_OG_IMAGE = '';

/** H1 מוסתר-ויזואלית עם טקסט ה-hero — נוסף רק אם בדף אין H1 בכלל (הגרסה המתוקנת של הדף כבר כוללת H1 אמיתי). '' = לא מוסיפים. */
const BCURE_LP_SR_H1 = 'הטכנולוגיה החדשנית לטיפול בכאבים — B-Cure Laser Pro, 30 ימי התנסות בהחזר כספי מלא';

/** להסתיר את באנר העוגיות כל עוד הפופאפ פתוח (כדי שהבאנר לא יכסה את טופס הפופאפ במובייל). */
const BCURE_LP_HIDE_COOKIE_WHILE_POPUP = true;

/* ───────────────────────── מכאן לא צריך לגעת ───────────────────────── */

function bcure_lp_is_lp() {
	if ( ! is_page() ) {
		return false;
	}
	if ( is_page( BCURE_LP_PAGE_IDS ) ) {
		return true;
	}
	$slug = (string) get_post_field( 'post_name', get_queried_object_id() );
	foreach ( BCURE_LP_SLUG_PREFIXES as $prefix ) {
		if ( $prefix && 0 === strpos( $slug, $prefix ) ) {
			return true;
		}
	}
	return false;
}

/** מספר טלפון ישראלי → tel:+972… */
function bcure_lp_tel_href( $phone ) {
	$digits = preg_replace( '/\D+/', '', $phone );
	if ( '' === $digits ) {
		return '';
	}
	if ( 0 === strpos( $digits, '972' ) ) {
		return 'tel:+' . $digits;
	}
	return 'tel:+972' . ltrim( $digits, '0' );
}

/* 1. title */
add_filter( 'pre_get_document_title', function ( $title ) {
	return bcure_lp_is_lp() && BCURE_LP_TITLE ? BCURE_LP_TITLE : $title;
}, 99 );

/* 2. meta description + Open Graph + Twitter card */
add_action( 'wp_head', function () {
	if ( ! bcure_lp_is_lp() ) {
		return;
	}
	$url   = get_permalink();
	$image = BCURE_LP_OG_IMAGE ?: ( get_the_post_thumbnail_url( null, 'full' ) ?: '' );
	echo "\n<!-- bcure-lp-fixes -->\n";
	if ( BCURE_LP_DESCRIPTION ) {
		printf( '<meta name="description" content="%s">' . "\n", esc_attr( BCURE_LP_DESCRIPTION ) );
	}
	printf( '<meta property="og:type" content="website">' . "\n" );
	printf( '<meta property="og:locale" content="he_IL">' . "\n" );
	printf( '<meta property="og:site_name" content="%s">' . "\n", esc_attr( get_bloginfo( 'name' ) ) );
	printf( '<meta property="og:title" content="%s">' . "\n", esc_attr( BCURE_LP_TITLE ) );
	printf( '<meta property="og:description" content="%s">' . "\n", esc_attr( BCURE_LP_DESCRIPTION ) );
	printf( '<meta property="og:url" content="%s">' . "\n", esc_url( $url ) );
	printf( '<meta name="twitter:card" content="%s">' . "\n", $image ? 'summary_large_image' : 'summary' );
	printf( '<meta name="twitter:title" content="%s">' . "\n", esc_attr( BCURE_LP_TITLE ) );
	printf( '<meta name="twitter:description" content="%s">' . "\n", esc_attr( BCURE_LP_DESCRIPTION ) );
	if ( $image ) {
		printf( '<meta property="og:image" content="%s">' . "\n", esc_url( $image ) );
		printf( '<meta name="twitter:image" content="%s">' . "\n", esc_url( $image ) );
	}
	echo "<!-- /bcure-lp-fixes -->\n";
}, 1 );

/* 3. alt לתמונות בלי alt — משתמשים בכותרת/כיתוב של הקובץ במדיה */
add_filter( 'wp_get_attachment_image_attributes', function ( $attr, $attachment ) {
	if ( bcure_lp_is_lp() && empty( $attr['alt'] ) && $attachment instanceof WP_Post ) {
		$alt = $attachment->post_excerpt ?: $attachment->post_title;
		$alt = trim( preg_replace( '/[-_]+|\.(png|jpe?g|webp|svg)$/i', ' ', (string) $alt ) );
		if ( $alt ) {
			$attr['alt'] = $alt;
		}
	}
	return $attr;
}, 10, 2 );


/* 5. CSS + JS בצד הלקוח */
add_action( 'wp_enqueue_scripts', function () {
	if ( ! bcure_lp_is_lp() ) {
		return;
	}
	wp_register_style( 'bcure-lp-fixes', false, array(), '1.0.0' );
	wp_enqueue_style( 'bcure-lp-fixes' );
	wp_add_inline_style( 'bcure-lp-fixes', bcure_lp_css() );

	wp_register_script( 'bcure-lp-fixes', false, array( 'jquery' ), '1.0.0', true );
	wp_enqueue_script( 'bcure-lp-fixes' );
	wp_add_inline_script( 'bcure-lp-fixes', 'window.BCURE_LP=' . wp_json_encode( array(
		'tel'             => bcure_lp_tel_href( BCURE_LP_PHONE ),
		'telLabel'        => BCURE_LP_PHONE,
		'wa'              => BCURE_LP_WHATSAPP ? 'https://wa.me/' . preg_replace( '/\D+/', '', BCURE_LP_WHATSAPP ) . '?text=' . rawurlencode( BCURE_LP_WHATSAPP_TEXT ) : '',
		'hideCookieWhilePopup' => BCURE_LP_HIDE_COOKIE_WHILE_POPUP,
		'srH1'            => BCURE_LP_SR_H1,
	) ) . ';', 'before' );
	wp_add_inline_script( 'bcure-lp-fixes', bcure_lp_js() );
}, 100 );

function bcure_lp_css() {
	return <<<'CSS'
/* bcure-lp-fixes */
.bcure-sr-only{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* באנר עוגיות (Zoho): RTL, קומפקטי, כפתורים בגובה 44px */
#zcb-banner{direction:rtl!important;text-align:right!important;font-family:"Assistant","Heebo",Arial,sans-serif!important;font-size:15px!important;line-height:1.45!important;padding:12px 16px!important}
#zcb-banner a,#zcb-banner button{min-height:44px!important;padding:10px 18px!important;font-size:15px!important;border-radius:8px!important}
#zcb-banner a[href]:not(.zcb-button){min-height:0!important;padding:0!important;text-decoration:underline!important}
body.bcure-popup-open #zcb-banner{display:none!important}

/* הפופאפ מעל הבאנר */
.elementor-popup-modal{z-index:2147483000!important}

/* מובייל: בלי כפתור "למעלה" (הפס הדביק כבר קיים) + מקום לפס הדביק בתחתית */
@media (max-width:767px){
  #wpfront-scroll-top-container{display:none!important}
  body{padding-bottom:72px!important}
}

/* חצי סליידר — אזור לחיצה 44px */
.elementor-swiper-button{min-width:44px!important;min-height:44px!important;display:flex!important;align-items:center!important;justify-content:center!important}

/* צ'קבוקס הסכמה גדול יותר, בשורה אחת עם הטקסט */
.elementor-field-type-acceptance .elementor-field-option{display:flex!important;align-items:flex-start!important;gap:10px!important;padding:4px 0}
.elementor-acceptance-field{width:22px!important;height:22px!important;flex:0 0 22px!important;margin:2px 0 0!important}
.elementor-field-type-acceptance label{cursor:pointer}
.elementor-field-type-acceptance a{padding:6px 2px;display:inline-block}

/* מובייל: באנר העוגיות יושב מעל הפס הדביק ולא עליו */
@media (max-width:767px){
  #zcb-banner.zcb-banner-bottom{bottom:80px!important}
}

/* פס דביק במובייל עם טלפון/וואטסאפ */
.bcure-sticky .elementor-button-wrapper{display:flex!important;gap:8px!important;align-items:stretch!important}
.bcure-sticky .elementor-button-wrapper>a{margin:0!important}
.bcure-sticky .elementor-button.bcure-cta-main{flex:1 1 auto!important;padding-inline:10px!important;font-size:16px!important;line-height:1.2!important}
.bcure-sticky .elementor-button.bcure-cta-icon{flex:0 0 56px!important;width:56px!important;min-width:0!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:999px!important;color:#fff!important}
.bcure-sticky .bcure-cta-icon svg{width:26px;height:26px;fill:currentColor;display:block}
.bcure-sticky .bcure-cta-tel{background:#3F4557!important}
.bcure-sticky .bcure-cta-wa{background:#25D366!important}
CSS;
}

function bcure_lp_js() {
	return <<<'JS'
(function(){
  var cfg = window.BCURE_LP || {};

  /* --- H1 מוסתר רק אם אין H1 אמיתי בדף (הדף הישן) --- */
  if (cfg.srH1 && !document.querySelector('h1')) {
    var h = document.createElement('h1'); h.className = 'bcure-sr-only'; h.textContent = cfg.srH1;
    document.body.insertBefore(h, document.body.firstChild);
  }

  /* --- autocomplete בטפסים --- */
  document.querySelectorAll('input[name="form_fields[name]"]').forEach(function(i){ i.setAttribute('autocomplete','name'); });
  document.querySelectorAll('input[name="form_fields[phone]"]').forEach(function(i){ i.setAttribute('autocomplete','tel'); i.setAttribute('inputmode','tel'); });

  /* --- פס דביק במובייל: טלפון + וואטסאפ --- */
  var stickyWrap = document.querySelector('.elementor-element-82bb3c7 .elementor-button-wrapper');
  if (stickyWrap && (cfg.tel || cfg.wa)) {
    var main = stickyWrap.querySelector('a.elementor-button');
    if (main) main.classList.add('bcure-cta-main');
    stickyWrap.closest('.elementor-element').classList.add('bcure-sticky');
    if (cfg.tel) {
      var t = document.createElement('a');
      t.href = cfg.tel; t.className = 'elementor-button bcure-cta-icon bcure-cta-tel'; t.setAttribute('aria-label','התקשרו אלינו ' + (cfg.telLabel||''));
      t.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z"/></svg><span class="bcure-sr-only">התקשרו</span>';
      stickyWrap.insertBefore(t, stickyWrap.firstChild);
    }
    if (cfg.wa) {
      var w = document.createElement('a');
      w.href = cfg.wa; w.target = '_blank'; w.rel = 'noopener'; w.className = 'elementor-button bcure-cta-icon bcure-cta-wa'; w.setAttribute('aria-label','שלחו לנו וואטסאפ');
      w.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3.1 4.4c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.5-.4-.5-.6-.5h-.5z"/></svg><span class="bcure-sr-only">וואטסאפ</span>';
      stickyWrap.insertBefore(w, stickyWrap.firstChild);
    }
  }

  /* --- באנר עוגיות של Zoho: תרגום לעברית ברגע שהוא מוזרק --- */
  function translateCookieBanner(banner){
    if (!banner || banner.dataset.bcureDone) return;
    banner.dataset.bcureDone = '1';
    banner.setAttribute('dir','rtl');
    var accept = banner.querySelector('#zc-manage'), deny = banner.querySelector('#zc-decline');
    if (accept) accept.textContent = 'אישור';
    if (deny) deny.textContent = 'דחייה';
    // הפסקה: האלמנט שמכיל את "cookies" ואינו כפתור
    var walker = document.createTreeWalker(banner, NodeFilter.SHOW_TEXT), node, para = null;
    while ((node = walker.nextNode())) {
      if (/cookies/i.test(node.textContent)) { para = node.parentElement; break; }
    }
    if (para) {
      var link = para.querySelector('a[href]');
      var href = link ? link.getAttribute('href') : '';
      para.innerHTML = 'האתר משתמש בעוגיות לשיפור חוויית הגלישה, בהתאם ל' +
        (href ? '<a href="' + href + '" target="_blank" rel="noopener">מדיניות הפרטיות</a>' : 'מדיניות הפרטיות') + '.';
    }
  }
  var existing = document.getElementById('zcb-banner');
  if (existing) translateCookieBanner(existing);
  var mo = new MutationObserver(function(){
    var b = document.getElementById('zcb-banner');
    if (b) { translateCookieBanner(b); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function(){ mo.disconnect(); }, 30000);

  /* --- פופאפ פתוח ⇒ מסתירים את באנר העוגיות --- */
  if (cfg.hideCookieWhilePopup && window.jQuery) {
    jQuery(document).on('elementor/popup/show', function(){ document.body.classList.add('bcure-popup-open'); });
    jQuery(document).on('elementor/popup/hide', function(){ document.body.classList.remove('bcure-popup-open'); });
  }
})();
JS;
}
