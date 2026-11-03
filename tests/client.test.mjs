import test from 'node:test';
import assert from 'node:assert/strict';
import { filterStories, cleanProgress, mergeProgress } from '../src/core.js';
import { landing } from '../src/landing.js';
const stories=[{id:1,title:'A Criação do Mundo',reference:'Gênesis 1–2',description:'A beleza da vida.',testament:'antigo'},{id:30,title:'Jesus e as Crianças',reference:'Marcos 10',description:'Jesus acolhe.',testament:'novo'}];
test('busca encontra títulos com ou sem acentos e combina testamento',()=>{
 assert.deepEqual(filterStories(stories,{query:'criacao',testament:'todos'}).map(s=>s.id),[1]);
 assert.deepEqual(filterStories(stories,{query:'jesus',testament:'antigo'}),[]);
 assert.equal(filterStories(stories,{query:'marcos',testament:'novo'}).length,1);
});
test('favoritos não inclui os livros apenas concluídos',()=>{
 const progress={1:{favorite:false,completed:true},30:{favorite:true}};
 assert.deepEqual(filterStories(stories,{favorites:true,progress}).map(s=>s.id),[30]);
});
test('progresso descarta IDs desconhecidos e valores inválidos de armazenamento',()=>{
 assert.deepEqual(cleanProgress({1:{part:999,completed:'false',favorite:true},366:{part:1},2:null}),{1:{story_id:1,part:3,completed:false,favorite:true}});
});
test('progresso remoto mais recente substitui o estado local da mesma conta',()=>{
 assert.equal(mergeProgress({1:{part:2,favorite:true}},[{story_id:1,part:0,favorite:false,completed:false}])[1].favorite,false);
});

test('progresso preserva os novos IDs inclusive 100 e 365',()=>{
 const result=cleanProgress({41:{part:1},100:{favorite:true},365:{part:3,completed:true},366:{part:1}});
 assert.deepEqual(Object.keys(result),['41','100','365']);
 assert.equal(result[365].completed,true);
 assert.equal(result[100].favorite,true);
});


test('mensalidade e economia anual exibidas na landing e no FAQ estão atualizadas', () => {
 const html = landing([]);
 assert.match(html, /<strong>37<\/strong><span>,90 \/ mês<\/span>/);
 assert.match(html, /Economize R\$ 257,80 em relação a 12 mensalidades\./);
 assert.match(html, /O mensal custa R\$ 37,90 por mês\./);
 assert.doesNotMatch(html, /29,90|161,80/);
});
