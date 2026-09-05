# -*- coding: utf-8 -*-
"""
בונה גרסה מתוקנת של תבנית הדף bcurelaser-v2 (ייצוא אלמנטור) לפי ממצאי הסריקה:
  * hero חדש מטקסט אמיתי (H1) + תמונת מוצר, במקום תמונה עם טקסט צרוב
  * הסרת ווידג'ט תמונה ריק במובייל
  * גדלי תמונות: לוגואי ספקים medium, תמונת מוצר medium_large
  * custom CSS של הדף עם selector במקום מזהה קשיח (.elementor-15964)
הרצה: python3 transform.py <source.json> <output.json>
"""
import json, secrets, sys, copy

src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))

def uid():
    return secrets.token_hex(4)[:7]

idx = {}
def walk(els, parent=None):
    for e in els:
        idx[e['id']] = (e, parent)
        walk(e.get('elements', []), els)
walk(d['content'])

def settings(e):
    if not isinstance(e.get('settings'), dict):
        e['settings'] = {}
    return e['settings']

ORANGE = '#F78E1E'
SLATE = '#3F4557'
FONT = 'Assistant'

def heading(title, tag, size, size_m, weight, color, extra=None):
    s = {
        'title': title, 'header_size': tag, 'align': 'start', 'align_mobile': 'center',
        'title_color': color,
        'typography_typography': 'custom', 'typography_font_family': FONT,
        'typography_font_size': {'unit': 'px', 'size': size, 'sizes': []},
        'typography_font_size_tablet': {'unit': 'px', 'size': round(size * 0.8), 'sizes': []},
        'typography_font_size_mobile': {'unit': 'px', 'size': size_m, 'sizes': []},
        'typography_font_weight': weight,
        'typography_line_height': {'unit': 'em', 'size': 1.15, 'sizes': []},
        '_margin': {'unit': 'px', 'top': '0', 'right': '0', 'bottom': '0', 'left': '0', 'isLinked': True},
    }
    if extra: s.update(extra)
    return {'id': uid(), 'elType': 'widget', 'widgetType': 'heading', 'settings': s, 'elements': [], 'isInner': False}

def text(html, size, size_m, color, extra=None):
    s = {
        'editor': html, 'align': 'start', 'align_mobile': 'center', 'text_color': color,
        'typography_typography': 'custom', 'typography_font_family': FONT,
        'typography_font_size': {'unit': 'px', 'size': size, 'sizes': []},
        'typography_font_size_mobile': {'unit': 'px', 'size': size_m, 'sizes': []},
        'typography_line_height': {'unit': 'em', 'size': 1.4, 'sizes': []},
        '_margin': {'unit': 'px', 'top': '0', 'right': '0', 'bottom': '0', 'left': '0', 'isLinked': True},
    }
    if extra: s.update(extra)
    return {'id': uid(), 'elType': 'widget', 'widgetType': 'text-editor', 'settings': s, 'elements': [], 'isInner': False}

# ───────────── 1. hero חדש ─────────────
old_hero = idx['92d163e'][0]
product = {'url': 'https://lp.bcurelaser.co.il/wp-content/uploads/2025/12/Good-Energies-B-Cure-Laser-Pro-110-1-e1765115803342.png', 'id': 15987, 'size': '', 'alt': 'מכשיר B-Cure Laser Pro', 'source': 'library'}

badge = text(
    '<div class="bcure-badge"><span class="bcure-badge-n">30</span><span class="bcure-badge-t">ימי התנסות</span><span class="bcure-badge-t">בהחזר כספי מלא</span></div>',
    16, 15, '#FFFFFF',
    {'custom_css': (
        'selector .bcure-badge{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;'
        'width:160px;height:160px;border-radius:50%;background:' + ORANGE + ';color:#fff;line-height:1.05;text-align:center;'
        'box-shadow:0 10px 28px rgba(247,142,30,.35)}'
        'selector .bcure-badge-n{font-size:66px;font-weight:800;line-height:1}'
        'selector .bcure-badge-t{font-size:15px;font-weight:600}'
        '@media(max-width:767px){selector .bcure-badge{width:130px;height:130px}selector .bcure-badge-n{font-size:52px}selector .bcure-badge-t{font-size:13px}}'
    ), '_margin': {'unit': 'px', 'top': '28', 'right': '0', 'bottom': '0', 'left': '0', 'isLinked': False},
       '_margin_mobile': {'unit': 'px', 'top': '18', 'right': '0', 'bottom': '0', 'left': '0', 'isLinked': False}}
)

text_col = {
    'id': uid(), 'elType': 'column', 'isInner': False,
    'settings': {'_column_size': 50, '_inline_size': 55, '_inline_size_tablet': 100, 'content_position': 'center',
                 'space_between_widgets': 12, 'space_between_widgets_mobile': 10,
                 'padding': {'unit': 'px', 'top': '24', 'right': '16', 'bottom': '24', 'left': '16', 'isLinked': False},
                 'padding_mobile': {'unit': 'px', 'top': '8', 'right': '12', 'bottom': '0', 'left': '12', 'isLinked': False}},
    'elements': [
        heading('הטכנולוגיה החדשנית לטיפול בכאבים', 'h1', 54, 34, '800', ORANGE),
        heading('עכשיו בידיים שלך', 'h2', 32, 24, '400', SLATE),
        text('<p><strong>B-Cure Laser Pro</strong><br>לוקחים את טכנולוגיית ה-LLLT המתקדמת שלנו לרמה הבאה.<br><span style="color:' + ORANGE + ';font-weight:600">טכנולוגיה מתקדמת להאצת תהליכי החלמה</span></p>', 21, 18, SLATE,
             {'_margin': {'unit': 'px', 'top': '14', 'right': '0', 'bottom': '0', 'left': '0', 'isLinked': False}}),
        badge,
    ],
}
img_col = {
    'id': uid(), 'elType': 'column', 'isInner': False,
    'settings': {'_column_size': 50, '_inline_size': 45, '_inline_size_tablet': 100, 'content_position': 'center', 'align': 'center',
                 'padding': {'unit': 'px', 'top': '16', 'right': '16', 'bottom': '16', 'left': '16', 'isLinked': True},
                 'padding_mobile': {'unit': 'px', 'top': '0', 'right': '0', 'bottom': '0', 'left': '0', 'isLinked': True}},
    'elements': [{
        'id': uid(), 'elType': 'widget', 'widgetType': 'image', 'isInner': False, 'elements': [],
        'settings': {'image': product, 'image_size': 'medium_large', 'align': 'center',
                     'width': {'unit': '%', 'size': 62, 'sizes': []}, 'width_tablet': {'unit': '%', 'size': 45, 'sizes': []}, 'width_mobile': {'unit': '%', 'size': 58, 'sizes': []},
                     'custom_css': 'selector img{filter:drop-shadow(0 30px 40px rgba(63,69,87,.28))}'},
    }],
}
new_hero = {
    'id': uid(), 'elType': 'section', 'isInner': False,
    'settings': {
        'layout': 'boxed', 'content_width': {'unit': 'px', 'size': 1240, 'sizes': []}, 'gap': 'no',
        'height': 'min-height', 'custom_height': {'unit': 'px', 'size': 600, 'sizes': []}, 'custom_height_mobile': {'unit': 'px', 'size': 0, 'sizes': []},
        'column_position': 'middle',
        'background_background': 'classic', 'background_color': '#E4EDF5',
        'margin': {'unit': 'px', 'top': '0', 'right': 0, 'bottom': '0', 'left': 0, 'isLinked': False},
        'padding': {'unit': 'px', 'top': '48', 'right': '24', 'bottom': '48', 'left': '24', 'isLinked': False},
        'padding_mobile': {'unit': 'px', 'top': '28', 'right': '8', 'bottom': '28', 'left': '8', 'isLinked': False},
        'custom_css': (
            'selector{background:'
            'radial-gradient(circle at 12% 78%, rgba(255,255,255,.95) 0 95px, transparent 96px),'
            'radial-gradient(circle at 90% 18%, rgba(255,255,255,.9) 0 70px, transparent 71px),'
            'radial-gradient(circle at 96% 62%, rgba(255,255,255,.7) 0 40px, transparent 41px),'
            'linear-gradient(180deg,#EEF4F9 0%,#D8E4EE 100%)!important;overflow:hidden}'
            '@media(max-width:767px){selector{background:radial-gradient(circle at 8% 90%, rgba(255,255,255,.9) 0 60px, transparent 61px),radial-gradient(circle at 94% 28%, rgba(255,255,255,.85) 0 44px, transparent 45px),linear-gradient(180deg,#EEF4F9 0%,#D8E4EE 100%)!important}}'
        ),
    },
    'elements': [text_col, img_col],
}
pos = d['content'].index(old_hero)
d['content'][pos] = new_hero

# ───────────── 2. גדלי תמונות ─────────────
settings(idx['7b38faa'][0])['thumbnail_size'] = 'medium'       # לוגואי ספקים
settings(idx['460cd6cb'][0])['image_size'] = 'medium_large'    # תמונת מוצר בסקשן "לא בטוחים"
settings(idx['460cd6cb'][0])['image']['alt'] = 'מכשיר B-Cure Laser Pro'
settings(idx['6293109d'][0])['image']['alt'] = 'מכשיר B-Cure Laser Pro'

# ───────────── 3. CSS של הדף לא תלוי במזהה ─────────────
css = d.get('page_settings', {}).get('custom_css', '') or ''
css = css.replace('.elementor-15964', 'selector')
if 'overflow-x' not in css:
    css += '\nselector{overflow-x:hidden}'
d.setdefault('page_settings', {})['custom_css'] = css

# ───────────── 4. כותרת התבנית ─────────────
d['title'] = 'ביקיור לייזר v2 — מתוקן'

# בדיקות שפיות
ids = []
def collect(els):
    for e in els:
        ids.append(e['id']); collect(e.get('elements', []))
collect(d['content'])
assert len(ids) == len(set(ids)), 'duplicate element ids'
h1 = [e for e, _ in idx.values() if e.get('widgetType') == 'heading' and e['settings'].get('header_size') == 'h1']
json.dump(d, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'OK: {len(ids)} elements, hero replaced at index {pos}, h1 in new hero: 1, written {dst}')
