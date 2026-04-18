import re

HOMOGLYPHS = {
    'a': 'а', 'c': 'с', 'e': 'е', 'o': 'о', 'p': 'р', 'x': 'х',
    'y': 'у', 'k': 'к', 'm': 'м', 't': 'т', 'h': 'н', 'b': 'в',
    'i': 'і', 'j': 'ј', 's': 'ѕ', 'w': 'ѡ',
}
HOMOGLYPHS_REV = {v: k for k, v in HOMOGLYPHS.items()}

def _normalize(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch in HOMOGLYPHS:
            out.append(HOMOGLYPHS[ch])
        elif ch in HOMOGLYPHS_REV:
            out.append(ch)
        elif ch in '.,;:!?-_ ':
            out.append('')
        elif ch == '0':
            out.append('о')
        elif ch == '1':
            out.append('и')
        elif ch == '3':
            out.append('з')
        elif ch == '4':
            out.append('ч')
        elif ch == '6':
            out.append('б')
        elif ch == '8':
            out.append('в')
        else:
            out.append(ch)
    return ''.join(out)

URL_WHITELIST = {
    'springmanga.duckdns.org', 'youtube.com', 'youtu.be',
    'imgur.com', 'i.imgur.com', 'github.com',
}

URL_PATTERN = re.compile(
    r'(?:https?://|www\.)?[a-z0-9а-яё_\-\+]+(?:\.[a-z0-9а-яё_\-\+]+)+',
    re.IGNORECASE
)

CATEGORY_LINKS = {
    'severity': 'warn',
    'reason': 'Запрещённая ссылка',
    'patterns': [
        re.compile(r'\bbit\.ly\b', re.I),
        re.compile(r'\bvk\.cc\b', re.I),
        re.compile(r'\bt\.me\b', re.I),
        re.compile(r'\bclck\.ru\b', re.I),
        re.compile(r'\bgoo\.gl\b', re.I),
        re.compile(r'\btinyurl\b', re.I),
        re.compile(r'\bis\.gd\b', re.I),
        re.compile(r'\bcutt\.ly\b', re.I),
        re.compile(r'\bdiscord\.gg\b', re.I),
        re.compile(r'\bbusty\b', re.I),
        re.compile(r'\bboosty\b', re.I),
        re.compile(r'\bdonationalerts\b', re.I),
    ],
    'normalized': [
        'впрофиле', 'переходипо', 'ссылкавбио', 'подпишисьнамой',
        'вшапкепрофиля', 'тгканал', 'tgканал', 'телеграмканал',
        'вкгруппа', 'ссылканамой',
        'переходимвмойпрофиль', 'переходивпрофиль',
        'ссылкавпрофиле', 'ссылканабусти',
        'подпишись', 'подписывайся',
        'бусти', 'busty', 'boosty',
    ],
}

CATEGORY_SCAM = {
    'severity': 'warn',
    'reason': 'Реклама/мошенничество',
    'patterns': [],
    'normalized': [
        'казино', 'casino', 'рулетка', 'ставки', '1xbet', 'melbet',
        'вулкан', 'vulkan', 'фриспины', 'слоты', 'азино', 'букмекер',
        'заработок', 'безвложений', 'крипта', 'биткоин', 'bitcoin',
        'binance', 'пассивныйдоход', 'трейдинг', 'заработатьонлайн',
        'инвестиции', 'накрутка', 'подписчики', 'лайки',
        'промокод', 'скидка', 'халява', 'купить', 'продаю',
        'onlyfans', 'сливы',
    ],
}

CATEGORY_DANGEROUS = {
    'severity': 'freeze',
    'reason': 'Опасный контент',
    'patterns': [],
    'normalized': [
        'мефедрон', 'соль', 'спайс', 'закладка', 'шишки', 'гашыш',
        'экстази', 'марки', 'кладмен', 'травка', 'суицид',
        'вскрытьвены', 'расчлененка', 'цп', 'даркнет', 'сваттинг',
        'доксинг', 'снафф', 'снаф', 'педофил', 'childporn',
        'детскаяпорнография',
    ],
}

CATEGORY_PROFANITY = {
    'severity': 'shadow',
    'reason': 'Нецензурная лексика',
    'patterns': [],
    'normalized': [
        'хуй', 'хуе', 'хуя', 'хую', 'пизда', 'пизде', 'пизды', 'пизду',
        'ебать', 'ебан', 'ебуч', 'ебал', 'ебли', 'ёбан', 'блядь', 'бля',
        'шлюха', 'шлюх', 'мудак', 'мудак', 'ублюдок', 'сука', 'сук',
        'пидор', 'пидар', 'гандон', 'гондон', 'чмо', 'шмара', 'залупа',
        'хер', 'ху', 'пзд', 'блть', 'ебт', 'аху', 'оху', 'хуе', 'хуи',
        'пезд', 'ебик', 'ебну', 'ебан', 'ёб', 'ебл', 'пидр', 'пидр',
        'уёб', 'уеб', 'хуё', 'хуе', 'заеб', 'заёб', 'отъеб', 'отъеб',
        'нигер', 'nigger', 'негр', 'хохол', 'русня', 'жид', 'даун',
        'аутист', 'инвалид', 'мамку', 'мамаша', 'сынш',
    ],
}

SHADOW_REPLACEMENTS = [
    '[ДАННЫЕ УДАЛЕНЫ ФАЗБЕР ЭНТЕРТЕЙНМЕНТ]',
    '[ОШИБКА СИСТЕМЫ: НАРУШЕНИЕ ПРОТОКОЛА]',
    '[СПРИНГЛОК-ФИЛЬТР: КОНТЕНТ ЗАБЛОКИРОВАН]',
    '[ACCESS DENIED: SPRINGOS SECURITY]',
    '[УДАЛЕНО АВТОМАТИЧЕСКОЙ СИСТЕМОЙ]',
    '[ПРОВАЛ ВЕНТИЛЯЦИИ: КОНТЕНТ НЕ ОБНАРУЖЕН]',
]

ALL_CATEGORIES = [CATEGORY_LINKS, CATEGORY_SCAM, CATEGORY_DANGEROUS, CATEGORY_PROFANITY]

CATEGORY_SETTING_KEY = {
    'links': 'badwords_warn_links',
    'scam': 'badwords_warn_scam',
    'freeze': 'badwords_freeze',
    'shadow': 'badwords_shadow',
}


def _build_categories(word_overrides: dict | None = None) -> list[dict]:
    if not word_overrides:
        return ALL_CATEGORIES
    cats = []
    for cat in ALL_CATEGORIES:
        c = dict(cat)
        key = CATEGORY_SETTING_KEY.get(
            'links' if cat is CATEGORY_LINKS
            else 'scam' if cat is CATEGORY_SCAM
            else 'freeze' if cat is CATEGORY_DANGEROUS
            else 'shadow'
        )
        if key and key in word_overrides and word_overrides[key].strip():
            words = [w.strip() for w in word_overrides[key].split(",") if w.strip()]
            if words:
                c['normalized'] = words
        c['_base'] = cat
        cats.append(c)
    return cats


def _check_url_whitelist(match: str) -> bool:
    lower = match.lower()
    for domain in URL_WHITELIST:
        if domain in lower:
            return True
    return False


def check_comment(text: str, extra_banned: list[str] | None = None, word_overrides: dict | None = None) -> dict | None:
    norm = _normalize(text)
    original_lower = text.lower()

    cats = _build_categories(word_overrides)

    url_matches = URL_PATTERN.findall(text)
    for url_match in url_matches:
        if not _check_url_whitelist(url_match):
            return {'severity': 'warn', 'reason': 'Запрещённая ссылка', 'matched': url_match, 'category': 'links'}

    for cat in cats:
        for pat in cat.get('patterns', []):
            m = pat.search(text)
            if m:
                return {'severity': cat['severity'], 'reason': cat['reason'], 'matched': m.group(), 'category': 'links' if cat.get('_base') is CATEGORY_LINKS else 'other'}
        for word in cat.get('normalized', []):
            if word in norm:
                base = cat.get('_base', cat)
                return {'severity': cat['severity'], 'reason': cat['reason'], 'matched': word, 'category': 'links' if base is CATEGORY_LINKS else 'other'}

    if extra_banned:
        for word in extra_banned:
            if not word:
                continue
            norm_word = _normalize(word)
            if norm_word and norm_word in norm:
                return {'severity': 'warn', 'reason': 'Запрещённое слово', 'matched': word, 'category': 'custom'}

    return None


def _build_norm_map(text: str) -> tuple[str, list[int]]:
    norm_chars = []
    positions = []
    for i, ch in enumerate(text):
        n = _normalize(ch.lower())
        if n:
            norm_chars.append(n)
            positions.append(i)
    return ''.join(norm_chars), positions


def shadow_replace(text: str, word_overrides: dict | None = None) -> str:
    import random
    cats = _build_categories(word_overrides)
    profanity_cat = None
    for c in cats:
        if c.get('_base') is CATEGORY_PROFANITY or c.get('severity') == 'shadow':
            profanity_cat = c
            break
    if not profanity_cat:
        profanity_cat = CATEGORY_PROFANITY

    norm, positions = _build_norm_map(text)
    if not positions:
        return text

    replacements = []
    matched = set()

    for word in profanity_cat.get('normalized', []):
        wlen = len(word)
        idx = 0
        while idx <= len(norm) - wlen:
            if norm[idx:idx + wlen] == word:
                rng = set(range(idx, idx + wlen))
                if not rng & matched:
                    orig_start = positions[idx]
                    orig_end = positions[idx + wlen - 1] + 1
                    replacement = random.choice(SHADOW_REPLACEMENTS)
                    replacements.append((orig_start, orig_end, replacement))
                    matched |= rng
                idx += wlen
            else:
                idx += 1

    replacements.sort(key=lambda r: r[0], reverse=True)
    result = text
    for start, end, repl in replacements:
        result = result[:start] + repl + result[end:]
    return result
