'use client'

// LAGUNA טבריה — דף נחיתה לפרויקט מגורים.
// מבוסס על מוקאפ העיצוב (hero גלריה בצד אחד, פאנל תוכן + טופס לידים בצד השני).
// כל הסגנון מבודד ב-laguna.module.css כדי לא להתנגש ב-globals.css של מערכת הדוחות.

import { useCallback, useEffect, useRef, useState } from 'react';
import s from './laguna.module.css';

const SLIDES = [
  { src: '/laguna/slide-1.jpg', thumb: '/laguna/thumb-1.jpg', alt: 'מרפסת עם נוף פתוח לכנרת בשעת שקיעה' },
  { src: '/laguna/slide-2.jpg', thumb: '/laguna/thumb-2.jpg', alt: 'חזית הבניין — אדריכלות מודרנית' },
  { src: '/laguna/slide-3.jpg', thumb: '/laguna/thumb-3.jpg', alt: 'סלון מעוצב עם חלונות פנורמיים' },
  { src: '/laguna/slide-4.jpg', thumb: '/laguna/thumb-4.jpg', alt: 'בריכת השחייה של הפרויקט' },
  { src: '/laguna/slide-5.jpg', thumb: '/laguna/thumb-5.jpg', alt: 'מבט נוסף על הבניין מהגן' },
];

const AUTOPLAY_MS = 6000;

/* ---------- אייקונים (SVG inline, קו זהב) ---------- */
const Icon = {
  waves: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" {...p}>
      <path d="M2 7c2.4 0 2.4 2 4.8 2S9.2 7 11.6 7 14 9 16.4 9 18.8 7 21.2 7" />
      <path d="M2 12c2.4 0 2.4 2 4.8 2s2.4-2 4.8-2 2.4 2 4.8 2 2.4-2 4.8-2" />
      <path d="M2 17c2.4 0 2.4 2 4.8 2s2.4-2 4.8-2 2.4 2 4.8 2 2.4-2 4.8-2" />
    </svg>
  ),
  tree: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21v-6.5" />
      <path d="M9.5 20.5h5" />
      <path d="M12 14.5c-3.6 0-6.5-2.6-6.5-5.9C5.5 5.4 8.4 3 12 3s6.5 2.4 6.5 5.6c0 3.3-2.9 5.9-6.5 5.9Z" />
      <path d="M12 14.5V9m0 1.6 2.6-2.3M12 12l-2.6-2.3" />
    </svg>
  ),
  plan: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M3.5 12h8.5M12 3.5V20.5M12 8h8.5" />
    </svg>
  ),
  gem: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" {...p}>
      <path d="M6 3h12l4 6-10 12L2 9l4-6Z" />
      <path d="M2 9h20M9 3l-2 6 5 12 5-12-2-6" />
    </svg>
  ),
  user: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.3-3.8 4.1-5.6 7.5-5.6s6.2 1.8 7.5 5.6" />
    </svg>
  ),
  phone: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6.3 3.5h3l1.6 4-2 1.4a12 12 0 0 0 6.2 6.2l1.4-2 4 1.6v3c0 1-.8 1.8-1.8 1.7C10.9 20.9 3.1 13.1 2.6 5.3c-.1-1 .7-1.8 1.7-1.8h2Z" />
    </svg>
  ),
  mail: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 6.5 9 6 9-6" />
    </svg>
  ),
  lock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...p}>
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  ),
  clock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  shield: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3l7 2.8v5.4c0 4.2-2.9 7.7-7 9.3-4.1-1.6-7-5.1-7-9.3V5.8L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  ),
  pin: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" {...p}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  ),
  chevron: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  ),
};

const FEATURES = [
  { icon: Icon.waves, lines: ['נוף ישיר', 'לכנרת'] },
  { icon: Icon.tree, lines: ['סביבה ירוקה', 'קהילה איכותית'] },
  { icon: Icon.plan, lines: ['דירות 3-5 חדרים', 'ופנטהאוזים'] },
  { icon: Icon.gem, lines: ['סטנדרט בנייה', 'גבוה במיוחד'] },
];

export default function LagunaLanding() {
  return (
    <main className={s.page} dir="rtl">
      <Gallery />
      <Panel />
    </main>
  );
}

/* ============================ גלריה ============================ */

function Gallery() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((next) => {
    setIndex((cur) => (next + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const t = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  // בדפדפן RTL: חץ ימינה = השקופית הקודמת
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') go(index + 1);
    if (e.key === 'ArrowRight') go(index - 1);
  };

  return (
    <section
      className={s.gallery}
      aria-roledescription="carousel"
      aria-label="גלריית הפרויקט"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          className={`${s.slide} ${i === index ? s.slideActive : ''}`}
          loading={i === 0 ? 'eager' : 'lazy'}
          fetchPriority={i === 0 ? 'high' : 'auto'}
          aria-hidden={i !== index}
        />
      ))}
      <div className={s.slideShade} aria-hidden="true" />

      <p className={s.heroScript} aria-hidden="true">
        <span>הנוף הזה</span>
        <span>יכול להיות שלכם</span>
        <svg className={s.heroScriptSwash} viewBox="0 0 260 26" fill="none" aria-hidden="true">
          <path d="M2 24C60 8 150 2 258 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </p>

      <ul className={s.rail}>
        {SLIDES.map((slide, i) => (
          <li key={slide.thumb}>
            <button
              type="button"
              className={`${s.railItem} ${i === index ? s.railItemActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`תמונה ${i + 1}: ${slide.alt}`}
              aria-current={i === index}
            >
              <img src={slide.thumb} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>

      <div className={s.location}>
        <Icon.pin className={s.locationIcon} />
        <span>
          <b>טבריה</b>
          שכונת המושבה
        </span>
      </div>

      <div className={s.controls}>
        <button type="button" className={s.arrow} onClick={() => go(index - 1)} aria-label="התמונה הקודמת">
          <Icon.chevron className={s.arrowIconPrev} />
        </button>
        <div className={s.dots}>
          {SLIDES.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              className={`${s.dot} ${i === index ? s.dotActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`מעבר לתמונה ${i + 1}`}
              aria-current={i === index}
            />
          ))}
        </div>
        <button type="button" className={s.arrow} onClick={() => go(index + 1)} aria-label="התמונה הבאה">
          <Icon.chevron className={s.arrowIconNext} />
        </button>
      </div>
    </section>
  );
}

/* ============================ פאנל תוכן ============================ */

function Panel() {
  return (
    <aside className={s.panel}>
      {/* הקשת האורגנית שחותכת את התמונה */}
      <svg className={s.curve} viewBox="0 0 120 1000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {/* אותו מדרג כמו רקע הפאנל, כדי שהקשת תימשך ברצף */}
          <linearGradient id="lagunaCurve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lg-cream-top)" />
            <stop offset="100%" stopColor="var(--lg-cream)" />
          </linearGradient>
        </defs>
        <path d="M120 0H74C40 150 6 300 12 470c6 170 52 300 34 530h74V0Z" fill="url(#lagunaCurve)" />
      </svg>

      <div className={s.panelInner}>
        <Logo />

        <h1 className={s.title}>דירות חדשות בטבריה</h1>
        <p className={s.subtitle}>השקעה שמרגישה כמו בית</p>
        <p className={s.lead}>
          פרויקט מגורים יוקרתי בשכונת המושבה, עם נוף עוצר נשימה לכנרת, תכנון מוקפד ואיכות חיים ברמה אחרת.
        </p>

        <ul className={s.features}>
          {FEATURES.map(({ icon: Glyph, lines }) => (
            <li key={lines.join(' ')} className={s.feature}>
              <Glyph className={s.featureIcon} />
              <p>
                {lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            </li>
          ))}
        </ul>

        <LeadForm />
      </div>

      <p className={s.cornerScript} aria-hidden="true">
        <span>טבריה</span>
        <span>מקום של חיים</span>
      </p>
      <svg className={s.cornerWaves} viewBox="0 0 320 140" fill="none" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M0 ${64 + i * 13}C70 ${28 + i * 13} 190 ${18 + i * 11} 320 ${44 + i * 10}`}
            stroke="var(--lg-gold)"
            strokeOpacity={0.28}
            strokeWidth="1"
          />
        ))}
      </svg>
    </aside>
  );
}

function Logo() {
  return (
    <div className={s.logo}>
      <svg className={s.logoMark} viewBox="0 0 120 64" fill="none" aria-hidden="true">
        <g stroke="var(--lg-gold)" strokeWidth="2" strokeLinejoin="round">
          <path d="M50 40V13h9v27" />
          <path d="M61 40V6h10v34" />
          <path d="M73 40V19h9v21" />
          <path d="M52.5 19h4M52.5 26h4M63.5 12h5M63.5 19h5M63.5 26h5M75.5 25h4M75.5 32h4" strokeWidth="1.2" />
        </g>
        <path d="M18 52c14-16 26-24 42-24s28 8 42 24" stroke="var(--lg-gold)" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 59c18-6 34-9 52-9s34 3 52 9" stroke="var(--lg-gold)" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      </svg>
      <p className={s.logoWord}>LAGUNA</p>
      <p className={s.logoTag}>טבריה · לחיות בין נוף לאיכות חיים</p>
    </div>
  );
}

/* ============================ טופס לידים ============================ */

const PHONE_RE = /^0(?:5\d|7\d|[2-489])\d{7}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LeadForm() {
  const [values, setValues] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const firstErrorRef = useRef(null);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((err) => (err[field] ? { ...err, [field]: undefined } : err));
  };

  const validate = () => {
    const next = {};
    if (values.name.trim().length < 2) next.name = 'נא למלא שם מלא';
    if (!PHONE_RE.test(values.phone.replace(/[\s-]/g, ''))) next.phone = 'נא למלא מספר טלפון תקין';
    if (values.email && !EMAIL_RE.test(values.email.trim())) next.email = 'כתובת המייל אינה תקינה';
    return next;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      firstErrorRef.current?.focus();
      return;
    }

    setState('sending');
    try {
      const res = await fetch('/api/laguna/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone.trim(),
          email: values.email.trim() || null,
          source: typeof window !== 'undefined' ? window.location.href : null,
        }),
      });
      if (!res.ok) throw new Error('request failed');
      setState('sent');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <div className={`${s.card} ${s.cardSuccess}`} role="status">
        <Icon.shield className={s.successIcon} />
        <h2 className={s.cardTitleText}>תודה, הפרטים התקבלו</h2>
        <p className={s.cardSub}>נציג הפרויקט יחזור אליכם בהקדם.</p>
      </div>
    );
  }

  return (
    <form className={s.card} onSubmit={onSubmit} noValidate>
      <h2 className={s.cardTitle}>
        <span>מעוניינים בפרטים נוספים?</span>
      </h2>
      <p className={s.cardSub}>מלאו פרטים ונחזור אליכם בהקדם:</p>

      <Field
        icon={Icon.user}
        id="laguna-name"
        label="שם מלא"
        value={values.name}
        onChange={set('name')}
        error={errors.name}
        autoComplete="name"
        inputRef={errors.name ? firstErrorRef : undefined}
      />
      <Field
        icon={Icon.phone}
        id="laguna-phone"
        label="טלפון"
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={set('phone')}
        error={errors.phone}
        autoComplete="tel"
        inputRef={!errors.name && errors.phone ? firstErrorRef : undefined}
      />
      <Field
        icon={Icon.mail}
        id="laguna-email"
        label="מייל (אופציונלי)"
        type="email"
        inputMode="email"
        value={values.email}
        onChange={set('email')}
        error={errors.email}
        autoComplete="email"
      />

      <button type="submit" className={s.cta} disabled={state === 'sending'}>
        {state === 'sending' ? 'שולח…' : 'רוצה לקבל פרטים'}
        <Icon.chevron className={s.ctaChevron} />
      </button>

      {state === 'error' && (
        <p className={s.formError} role="alert">
          השליחה נכשלה. אפשר לנסות שוב או להתקשר אלינו.
        </p>
      )}

      <ul className={s.trust}>
        <li><Icon.lock className={s.trustIcon} />הפרטים שלכם מוגנים</li>
        <li><Icon.clock className={s.trustIcon} />מענה מהיר</li>
        <li><Icon.shield className={s.trustIcon} />ללא התחייבות</li>
      </ul>
    </form>
  );
}

function Field({ icon: Glyph, id, label, error, inputRef, ...rest }) {
  return (
    <p className={s.field}>
      <label className={s.srOnly} htmlFor={id}>{label}</label>
      <Glyph className={s.fieldIcon} />
      <input
        id={id}
        ref={inputRef}
        className={`${s.input} ${error ? s.inputError : ''}`}
        placeholder={label}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
      {error && <span id={`${id}-error`} className={s.fieldError}>{error}</span>}
    </p>
  );
}
