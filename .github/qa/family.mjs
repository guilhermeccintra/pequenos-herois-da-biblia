import { chromium } from 'playwright-core';
import binary from '@sparticuz/chromium';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath: await binary.executablePath(), args:binary.args});
try {
  const page = await browser.newPage();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width,height:900});
    await page.route(/facebook|google-analytics|googletagmanager/, r => r.abort());
    await page.goto('http://127.0.0.1:4173');
    await page.locator('.age-note').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.age-note').innerText(), 'Histórias bíblicas para viver em família');
    const h1 = await page.locator('h1').innerText();
    assert.equal(h1.replace(/\s+/g,' '), 'Histórias que ficam. Fé que cresce.');
    const selectors=['.age-note','.hero-copy h1','.hero-description','.hero-actions .button','.faq-list'];
    for (const selector of selectors){
      const box = await page.locator(selector).first().boundingBox();
      assert.ok(box && box.width>0 && box.x >= -1 && box.x+box.width<=width+1, selector + ' at '+width+' '+JSON.stringify(box));
    }
    const art=page.locator('.illustration-book');
    const after=await art.boundingBox();
    const pairs=[["Para pequenos de 6 a 12 anos","Histórias bíblicas para viver em família"],["Alguns minutos. Uma grande história. Um momento que é só de vocês.","Transforme alguns minutos do dia em momentos especiais de fé, aprendizado e conexão com seus filhos."],["Descubra 365 histórias bíblicas ilustradas: uma para cada dia do ano. Um convite para despertar a imaginação, conversar sobre valores e cultivar a fé com seu filho.","Escolha uma das 365 histórias bíblicas ilustradas e leia com seus filhos no aplicativo. Cada história traz uma reflexão para conversar e uma oração para fazer juntos."]];
    await page.evaluate(pairs=>{for (const [old,next] of pairs){const walker=document.createTreeWalker(document.querySelector('.hero-copy'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())if(n.textContent===next)n.textContent=old}},pairs);
    const before=await art.boundingBox();
    assert.ok(Math.abs(before.x-after.x)<1 && Math.abs(before.width-after.width)<1, 'hero art horizontal bounds changed at '+width);
    await page.reload();
    const summary=page.getByText('Para qual idade as histórias foram feitas?', {exact:true});
    await summary.click();
    assert.ok(await page.locator('details[open] p').isVisible());
    assert.match(await page.locator('details[open] p').innerText(), /5 a 10 anos/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.hero-actions .button').click();
    assert.equal(new URL(page.url()).hash,'#planos');

    console.log('Responsive layout, hero CTA and FAQ passed at '+width+' px');
  }
} finally {await browser.close();}