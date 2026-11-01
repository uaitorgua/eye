<?php
/**
 * Спрощувач сторінок для підсистеми «Браузер».
 *
 *   GET browser.php?url=https://uk.m.wikipedia.org/wiki/...
 *   → JSON { ok, url, title, blocks: [ { t: 'h'|'p', text, links: [ { text, href, allowed } ] } ] }
 *   GET browser.php?sites  → JSON { sites: [ { title, url, icon } ] }
 *
 * Сторінка керованого очима браузера не може працювати з чужим сайтом напряму (cross-origin),
 * тому сервер завантажує сторінку, витягує текст і посилання й віддає їх як дані.
 *
 * Безпека — це не відкритий проксі:
 *   - лише домени зі списку browser-sites.json (сайт і його піддомени);
 *   - лише http/https, порти 80/443, без логіна в URL;
 *   - IP після DNS має бути публічним, з'єднання прив'язується саме до перевіреної IP (без DNS rebinding);
 *   - редиректи вручну, кожен перевіряється заново;
 *   - обмеження розміру, часу й частоти; жодного HTML на вихід — лише текст.
 */

declare(strict_types=1);
ini_set('display_errors', '0');

const SITES_FILE   = __DIR__ . '/browser-sites.json';
const MAX_BYTES    = 2_000_000;
const TIMEOUT_SEC  = 10;
const MAX_REDIRECT = 4;
const MAX_BLOCKS   = 600;
const RATE_LIMIT   = 120;   // запитів ...
const RATE_WINDOW  = 600;   // ... за 10 хвилин з однієї IP
define('PRIVATE_DIR', dirname(__DIR__) . '/private');

// Хостинг працює на PHP 7.4: без ?->, str_starts_with/str_ends_with та інших можливостей PHP 8.
function endsWith(string $s, string $end): bool { return $end === '' || substr($s, -strlen($end)) === $end; }
function startsWith(string $s, string $start): bool { return strncmp($s, $start, strlen($start)) === 0; }

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sites(): array
{
    $data = json_decode((string)@file_get_contents(SITES_FILE), true);
    return is_array($data['sites'] ?? null) ? $data['sites'] : [];
}

function allowedHosts(): array
{
    $hosts = [];
    foreach (sites() as $s) {
        $h = strtolower((string)parse_url((string)($s['url'] ?? ''), PHP_URL_HOST));
        if ($h !== '') $hosts[] = preg_replace('/^(www|m)\./', '', $h);
    }
    $data = json_decode((string)@file_get_contents(SITES_FILE), true);
    foreach (($data['extraHosts'] ?? []) as $h) $hosts[] = strtolower((string)$h);
    return array_values(array_unique($hosts));
}

function hostAllowed(string $host): bool
{
    $host = strtolower(rtrim($host, '.'));
    foreach (allowedHosts() as $a) {
        if ($host === $a || endsWith($host, '.' . $a)) return true;
    }
    return false;
}

/** Кодує не-ASCII символи (кирилиця в шляху) і пробіли, не чіпаючи вже закодованих %XX. */
function normalizeUrl(string $url): string
{
    // Побайтово, без прапорця /u: з ним некоректні байти в заголовку Location дають null замість рядка.
    $out = preg_replace_callback('~[^\x21-\x7E]~', function ($m) { return rawurlencode($m[0]); }, trim($url));
    return $out === null ? '' : $out;
}

/** Перевіряє URL; повертає [url, host, port, ip] або рядок-помилку. */
function validate(string $url)
{
    $url = normalizeUrl($url);
    $p = parse_url($url);
    if (!$p || !isset($p['scheme'], $p['host'])) return 'Некоректна адреса';
    $scheme = strtolower($p['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) return 'Дозволено лише http і https';
    if (isset($p['user']) || isset($p['pass'])) return 'Адреси з логіном не підтримуються';
    $port = $p['port'] ?? ($scheme === 'https' ? 443 : 80);
    if (!in_array($port, [80, 443], true)) return 'Нестандартний порт заборонено';
    $host = strtolower($p['host']);
    if (!hostAllowed($host)) return 'Цього сайту немає в списку дозволених';
    $ips = @gethostbynamel($host) ?: [];
    if (!$ips) return 'Сайт не знайдено';
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return 'Адреса веде у внутрішню мережу — заборонено';
        }
    }
    return [$url, $host, $port, $ips[0]];
}

function rateLimited(): bool
{
    if (!is_dir(PRIVATE_DIR)) @mkdir(PRIVATE_DIR, 0700, true);
    $file = PRIVATE_DIR . '/browser_rate_' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '') . '.json';
    $now = time();
    $hits = array_values(array_filter(json_decode((string)@file_get_contents($file), true) ?: [], fn($t) => $t > $now - RATE_WINDOW));
    if (count($hits) >= RATE_LIMIT) return true;
    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return false;
}

/** Завантажує сторінку з ручними редиректами. Повертає [finalUrl, body, contentType] або рядок-помилку. */
function fetchPage(string $url)
{
    for ($i = 0; $i <= MAX_REDIRECT; $i++) {
        $v = validate($url);
        if (is_string($v)) return $v;
        [$url, $host, $port, $ip] = $v;

        $body = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RESOLVE        => ["$host:$port:$ip"],   // з'єднуємося саме з перевіреною IP
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_TIMEOUT        => TIMEOUT_SEC,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; UAIT-Eye-Browser/1.0; +https://eye.uait.org.ua)',
            CURLOPT_HTTPHEADER     => ['Accept: text/html,application/xhtml+xml', 'Accept-Language: uk,en;q=0.5'],
            CURLOPT_ENCODING       => '',
            CURLOPT_HEADER         => false,
            CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use (&$body) {
                $body .= $chunk;
                return strlen($body) > MAX_BYTES ? 0 : strlen($chunk);   // 0 — обірвати завантаження
            },
        ]);
        curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $location = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        $err = curl_errno($ch);
        curl_close($ch);

        if ($err && strlen($body) <= MAX_BYTES) return 'Сайт не відповідає';
        if ($status >= 300 && $status < 400 && $location !== '') { $url = $location; continue; }
        if ($status >= 400) return "Сайт повернув помилку $status";
        if (!preg_match('~text/html|application/xhtml~i', $type)) return 'Це не вебсторінка (можливо, файл)';
        return [$url, $body, $type];
    }
    return 'Забагато переадресацій';
}

function absoluteUrl(string $href, string $base): ?string
{
    $href = trim($href);
    if ($href === '' || $href[0] === '#' || preg_match('~^(javascript|mailto|tel|data):~i', $href)) return null;
    if (preg_match('~^https?://~i', $href)) return $href;
    $b = parse_url($base);
    $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
    if (startsWith($href, '//')) return $b['scheme'] . ':' . $href;
    if ($href[0] === '/') return $origin . $href;
    $dir = preg_replace('~/[^/]*$~', '/', $b['path'] ?? '/');
    return $origin . $dir . $href;
}

function cleanText(string $s): string
{
    return trim(preg_replace('/\s+/u', ' ', html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
}

function parsePage(string $html, string $url, string $type): array
{
    // Кодування: заголовок → meta → припускаємо UTF-8.
    $charset = preg_match('~charset=([\w-]+)~i', $type, $m) ? $m[1]
        : (preg_match('~<meta[^>]+charset=["\']?([\w-]+)~i', $html, $m) ? $m[1] : 'UTF-8');
    if (strcasecmp($charset, 'UTF-8') !== 0) $html = @mb_convert_encoding($html, 'UTF-8', $charset) ?: $html;

    libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
    $xp = new DOMXPath($doc);

    foreach ($xp->query('//script|//style|//noscript|//iframe|//svg|//form|//nav|//header|//footer|//aside|//button|//*[@aria-hidden="true"]') as $n) {
        if ($n->parentNode) $n->parentNode->removeChild($n);
    }

    $titleNode = $xp->query('//title')->item(0);
    $title = cleanText($titleNode ? $titleNode->textContent : '');
    // Основний контейнер: найбільший за текстом серед article/main/вмісту Вікіпедії.
    // Якщо він містить менше чверті тексту сторінки (напр., <article> — лише одна картка) — беремо весь body.
    $body = $xp->query('//body')->item(0);
    if (!$body) return [$title, []];
    $root = null;
    foreach ($xp->query('//article|//main|//*[@id="mw-content-text"]') as $cand) {
        if (!$root || mb_strlen($cand->textContent) > mb_strlen($root->textContent)) $root = $cand;
    }
    if (!$root || mb_strlen($root->textContent) < 0.25 * mb_strlen($body->textContent)) $root = $body;

    $blocks = [];
    foreach ($xp->query('.//h1|.//h2|.//h3|.//h4|.//p|.//li|.//blockquote|.//dd', $root) as $el) {
        if (count($blocks) >= MAX_BLOCKS) break;
        // Пропускаємо вкладені: <li> усередині іншого <li>/<p> уже враховано батьком.
        if ($xp->query('ancestor::p|ancestor::li|ancestor::blockquote', $el)->length) continue;
        $text = cleanText($el->textContent);
        if (mb_strlen($text) < 2) continue;
        $links = [];
        foreach ($xp->query('.//a[@href]', $el) as $a) {
            $abs = absoluteUrl($a->getAttribute('href'), $url);
            $label = cleanText($a->textContent);
            if (!$abs || $label === '' || count($links) >= 60) continue;
            $host = (string)parse_url($abs, PHP_URL_HOST);
            $links[] = ['text' => mb_substr($label, 0, 80), 'href' => $abs, 'allowed' => hostAllowed($host)];
        }
        $blocks[] = ['t' => preg_match('/^h\d$/', $el->nodeName) ? 'h' : 'p', 'text' => mb_substr($text, 0, 4000), 'links' => $links];
    }
    // Сайти, що верстають текст у <div> замість <p>: беремо «листкові» блоки з помітним текстом.
    if (count($blocks) < 15) {
        foreach ($xp->query('.//div[not(.//div|.//p|.//li|.//h1|.//h2|.//h3|.//h4)]', $root) as $el) {
            if (count($blocks) >= MAX_BLOCKS) break;
            $text = cleanText($el->textContent);
            if (mb_strlen($text) < 20) continue;
            $links = [];
            foreach ($xp->query('.//a[@href]', $el) as $a) {
                $abs = absoluteUrl($a->getAttribute('href'), $url);
                $label = cleanText($a->textContent);
                if (!$abs || $label === '' || count($links) >= 60) continue;
                $links[] = ['text' => mb_substr($label, 0, 80), 'href' => $abs, 'allowed' => hostAllowed((string)parse_url($abs, PHP_URL_HOST))];
            }
            $blocks[] = ['t' => 'p', 'text' => mb_substr($text, 0, 4000), 'links' => $links];
        }
    }
    if ($title === '' && $blocks) $title = $blocks[0]['text'];
    return [mb_substr($title, 0, 200), $blocks];
}

if (isset($_GET['sites'])) {
    out(200, ['ok' => true, 'sites' => sites()]);
}

$url = trim((string)($_GET['url'] ?? ''));
if ($url === '') out(400, ['ok' => false, 'error' => 'Не вказано адресу']);
if (!preg_match('~^https?://~i', $url)) $url = 'https://' . $url;
if (rateLimited()) out(429, ['ok' => false, 'error' => 'Забагато запитів. Зачекайте кілька хвилин']);

$page = fetchPage($url);
if (is_string($page)) out(422, ['ok' => false, 'error' => $page]);
[$final, $body, $type] = $page;
[$title, $blocks] = parsePage($body, $final, $type);
if (!$blocks) out(422, ['ok' => false, 'error' => 'На сторінці не знайдено тексту — можливо, сайт працює лише через JavaScript']);

out(200, ['ok' => true, 'url' => $final, 'title' => $title, 'blocks' => $blocks]);
