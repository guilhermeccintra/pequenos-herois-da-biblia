import test from 'node:test';
import assert from 'node:assert/strict';
import { library } from '../src/library.js';
import { reader } from '../src/reader.js';

const entry = (id, testament) => ({id, testament, title:`História ${id}`, description:'Uma descrição.', reference:'Referência', cover:`/images/covers/${id}.webp`, subtitle:'Subtítulo', parts:[1,2,3].map(n=>({heading:`Parte ${n}`,paragraphs:['Texto.'],image:`${id}/part${n}.webp`,alt:'Uma cena.'}))});

test('biblioteca deriva totais do catálogo e limita o primeiro carregamento',()=>{
 const catalog=Array.from({length:365},(_,i)=>entry(i+1,i%3===0?'antigo':'novo'));
 const html=library({catalog,progress:{1:{completed:true},365:{completed:true},999:{completed:true}},hasAccess:true});
 assert.match(html,/<strong>2<span> \/ 365<\/span>/);
 assert.match(html,/Antigo Testamento <span>122<\/span>/);
 assert.match(html,/Novo Testamento <span>243<\/span>/);
 assert.equal((html.match(/<article class="story-card">/g)||[]).length,24);
 assert.match(html,/id="library-more" >/);
 assert.ok(!html.includes('href="/historia/25"'));
});

test('leitor usa testamento explícito para histórias novas',()=>{
 const state={part:0,progress:{},night:false};
 assert.match(reader(entry(106,'antigo'),state),/class="pill">Antigo Testamento/);
 assert.match(reader(entry(365,'novo'),state),/class="pill">Novo Testamento/);
});
