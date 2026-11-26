import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const MISSKEY_URL = (process.env.MISSKEY_URL || 'http://misskey:3000').replace(/\/$/, '');
const EXPECTED_VERSION = process.env.EXPECTED_VERSION || '';
const ARTIFACTS_DIR = path.join(process.cwd(), 'artifacts');
const ADMIN_USER = 'e2eadmin';
const ADMIN_PASS = 'e2epassword123!';
const EXIF_CAPTION = 'mewl-e2e-exif-caption-test';
const SEARCH_TOKEN = 'めうる検索テスト';
const NOTE_TEXT = `${SEARCH_TOKEN} mewl-e2e-search-token`;

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const logs = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logs.push(line);
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function api(endpoint, body = {}) {
  const res = await fetch(`${MISSKEY_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore non-JSON body
  }
  return { status: res.status, ok: res.ok, json, text };
}

/**
 * 最小の有効な 1x1 JPEG に APP1 Exif (ImageDescription) を埋め込んで返す
 */
function createExifJpeg(description) {
  const minimalJpegBodyBase64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const fullMinimalJpeg = Buffer.from(minimalJpegBodyBase64, 'base64');
  const bodyAfterSoi = fullMinimalJpeg.subarray(2);

  const asciiBytes = Buffer.from(`${description}\0`, 'ascii');
  const tiffHeader = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
  const ifdEntryCount = Buffer.from([0x00, 0x01]);
  const valueOffset = 8 + 2 + 12 + 4; // 26
  const ifdEntry = Buffer.alloc(12);
  ifdEntry.writeUInt16BE(0x010e, 0); // Tag: ImageDescription
  ifdEntry.writeUInt16BE(0x0002, 2); // Type: ASCII
  ifdEntry.writeUInt32BE(asciiBytes.length, 4); // Count
  ifdEntry.writeUInt32BE(valueOffset, 8); // Offset
  const nextIfd = Buffer.from([0x00, 0x00, 0x00, 0x00]);

  const exifPayload = Buffer.concat([
    Buffer.from('Exif\0\0', 'ascii'),
    tiffHeader,
    ifdEntryCount,
    ifdEntry,
    nextIfd,
    asciiBytes,
  ]);

  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(exifPayload.length + 2, 0);
  const app1Segment = Buffer.concat([Buffer.from([0xff, 0xe1]), app1Length, exifPayload]);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1Segment, bodyAfterSoi]);
}

async function run() {
  let browser;
  let page;

  try {
    // 1. /api/meta バージョン一致確認
    log('1. Checking /api/meta...');
    const meta = await api('meta', { detail: false });
    assert(meta.status === 200, `/api/meta returned ${meta.status}: ${meta.text}`);
    log(`   /api/meta version = ${meta.json?.version}`);
    if (EXPECTED_VERSION) {
      assert(
        meta.json?.version === EXPECTED_VERSION,
        `Expected version ${EXPECTED_VERSION}, got ${meta.json?.version}`,
      );
    }

    // 2. 初期管理者アカウント作成
    log('2. Creating initial admin account...');
    const created = await api('admin/accounts/create', {
      username: ADMIN_USER,
      password: ADMIN_PASS,
    });
    assert(created.status === 200 && created.json?.token, `admin/accounts/create failed: ${created.status} ${created.text}`);
    const token = created.json.token;
    log(`   Created admin user ${ADMIN_USER} (id=${created.json.id})`);

    // 3. Playwright 起動 & WebUI ログイン
    log('3. Launching Chromium and logging in via WebUI...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();

    const failedResponses = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        log(`[browser console.error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      log(`[browser pageerror] ${err.message}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(MISSKEY_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator('button').first().waitFor({ state: 'visible', timeout: 30000 });

    await page.getByTestId('signin').click();
    await page.getByTestId('signin-page-input').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="signin-username"] input').fill(ADMIN_USER);
    await page.keyboard.press('Enter');

    await page.getByTestId('signin-page-password').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="signin-password"] input').fill(ADMIN_PASS);
    // SigninApiService has minInterval: 1000ms per IP between signin-flow requests
    await page.waitForTimeout(1500);
    const signinResponsePromise = page.waitForResponse(
      (res) => res.url().endsWith('/api/signin-flow') && res.request().method() === 'POST',
      { timeout: 30000 },
    );
    await page.keyboard.press('Enter');
    await signinResponsePromise;

    // 初回ログイン時のユーザーセットアップダイアログ（表示に時間がかかるため 30 秒待つ）を閉じる
    const setupCloseBtn = page.locator('[data-testid="user-setup-dialog"] [data-testid="modal-window-close"]');
    const setupVisible = await setupCloseBtn.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
    if (setupVisible) {
      await setupCloseBtn.click();
      await page.getByTestId('modal-dialog-ok').click();
      await page.getByTestId('user-setup-dialog').waitFor({ state: 'hidden', timeout: 10000 });
    }

    await page.getByTestId('open-post-form').waitFor({ state: 'visible', timeout: 30000 });
    log('   WebUI login succeeded.');

    // 4. Blobmoji / 静的アセット 404 チェック
    log('4. Checking emoji / static asset responses...');
    const emoji404 = failedResponses.filter((r) => r.includes('emoji') || r.includes('fluent') || r.includes('blob'));
    assert(emoji404.length === 0, `Emoji asset errors detected: ${emoji404.join(', ')}`);
    const emojisRes = await api('emojis', {});
    assert(emojisRes.status === 200, `/api/emojis returned ${emojisRes.status}`);
    log('   Emoji asset checks passed.');

    // 5. Exif 付きテスト画像生成 & ノート投稿
    log('5. Creating Exif test JPEG and posting note via WebUI...');
    const exifJpegPath = '/tmp/e2e-exif.jpg';
    fs.writeFileSync(exifJpegPath, createExifJpeg(EXIF_CAPTION));

    await page.getByTestId('open-post-form').click();
    await page.getByTestId('post-form-text').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('post-form-text').fill(NOTE_TEXT);

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      page.locator('button:has(i.ti-photo-plus)').first().click(),
    ]);
    await fileChooser.setFiles(exifJpegPath);

    // Wait briefly for client-side Exif ImageDescription extraction in use-uploader
    await page.waitForTimeout(1500);

    const [uploadRes, noteCreateRes] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/api/drive/files/create') && res.request().method() === 'POST',
        { timeout: 30000 },
      ),
      page.waitForResponse(
        (res) => res.url().endsWith('/api/notes/create') && res.request().method() === 'POST',
        { timeout: 30000 },
      ),
      page.getByTestId('post-form-submit').click(),
    ]);
    assert(uploadRes.status() === 200, `drive/files/create failed with status ${uploadRes.status()}`);
    assert(noteCreateRes.status() === 200, `notes/create failed with status ${noteCreateRes.status()}`);

    let createdNote = null;
    for (let i = 0; i < 15; i++) {
      const tl = await api('notes/local-timeline', { i: token, limit: 5 });
      if (tl.status === 200 && Array.isArray(tl.json)) {
        createdNote = tl.json.find((n) => typeof n.text === 'string' && n.text.includes('mewl-e2e-search-token'));
        if (createdNote) break;
      }
      await page.waitForTimeout(1000);
    }
    assert(createdNote, 'Posted note was not found on local timeline');
    assert(Array.isArray(createdNote.files) && createdNote.files.length >= 1, 'Posted note has no attached files');
    log(`   Posted note id=${createdNote.id}, file.comment=${JSON.stringify(createdNote.files[0].comment)}`);
    assert(
      typeof createdNote.files[0].comment === 'string' && createdNote.files[0].comment.includes(EXIF_CAPTION),
      `Expected Exif ImageDescription "${EXIF_CAPTION}" in file.comment, got ${JSON.stringify(createdNote.files[0].comment)}`,
    );

    // 6. 星リアクション送信確認
    log('6. Sending star reaction and verifying...');
    const reactRes = await api('notes/reactions/create', {
      i: token,
      noteId: createdNote.id,
      reaction: '⭐',
    });
    assert(reactRes.status === 204 || reactRes.status === 200, `notes/reactions/create failed: ${reactRes.status} ${reactRes.text}`);

    const shown = await api('notes/show', { i: token, noteId: createdNote.id });
    assert(shown.status === 200, `notes/show failed: ${shown.status}`);
    assert(shown.json?.reactions && shown.json.reactions['⭐'] >= 1, `Star reaction missing: ${JSON.stringify(shown.json?.reactions)}`);
    log(`   Star reaction verified: ${JSON.stringify(shown.json.reactions)}`);

    // 7. PGroonga ノート検索確認
    log('7. Verifying PGroonga note search...');
    const policyRes = await api('admin/roles/update-default-policies', {
      i: token,
      policies: { canSearchNotes: true },
    });
    assert(policyRes.status === 204 || policyRes.status === 200, `admin/roles/update-default-policies failed: ${policyRes.status} ${policyRes.text}`);

    const searchRes = await api('notes/search', {
      i: token,
      query: SEARCH_TOKEN,
    });
    assert(searchRes.status === 200 && Array.isArray(searchRes.json), `notes/search failed: ${searchRes.status} ${searchRes.text}`);
    const found = searchRes.json.some((n) => n.id === createdNote.id);
    assert(found, `Note ${createdNote.id} not found in PGroonga search results for "${SEARCH_TOKEN}"`);
    log('   PGroonga search verified.');

    log('ALL E2E CHECKS PASSED!');
  } catch (err) {
    log(`ERROR: ${err.stack || err.message}`);
    if (page) {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'failure.png'), fullPage: true }).catch(() => {});
    }
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'console.log'), logs.join('\n') + '\n');
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

run();
