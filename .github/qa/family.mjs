import { chromium } from 'playwright-core';
import binary from '@sparticuz/chromium';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath: await binary.executablePath(), args:binary.args});
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.route(/facebook|google-analytics|googletagmanager/, r => r.abort());
    await page.goto('http://127.0.0.1:4173');
    await page.locator('.age-note').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.age-note').innerText(), 'Histórias bíblicas para viver em família');
    const h1 = await page.locator('h1').innerText();
    assert.equal(h1.replace(/\s+/g,' '), 'Histórias que ficam. Fé que cresce.');
    const selectors=['.age-note','.hero-copy h1','.hero-description','.hero-actions .button','.illustration-book','.faq-list'];
    for (const selector of selectors){
      const box = await page.locator(selector).first().boundingBox();
      assert.ok(box && box.width>0 && box.x >= -1 && box.x+box.width<=width+1, selector + ' at '+width+' '+JSON.stringify(box));
    }
    const summary=page.getByText('Para qual idade as histórias foram feitas?', {exact:true});
    await summary.click();
    assert.ok(await page.locator('details[open] p').isVisible());
    assert.match(await page.locator('details[open] p').innerText(), /5 a 10 anos/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.hero-actions .button').click();
    assert.equal(new URL(page.url()).hash,'#planos');
    await page.close();
    console.log('Responsive layout, hero CTA and FAQ passed at '+width+' px');
  }
} finally {await browser.close();}