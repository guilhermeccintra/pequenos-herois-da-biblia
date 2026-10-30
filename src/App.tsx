import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Compass,
  Gamepad2,
  Trophy,
  Home as HomeIcon,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Menu,
  X,
  UserRound,
  Crown,
  RotateCcw,
  Sparkles,
  Play,
  ShieldCheck
} from 'lucide-react';
import { stories, badges, type Story } from './data';
import { hasSupabase } from './supabase';

type Page =
  | 'home'
  | 'stories'
  | 'map'
  | 'games'
  | 'badges'
  | 'profile'
  | 'plans'
  | 'story'
  | 'quiz'
  | 'memory'
  | 'word';

interface ProgressState {
  completed: string[];
  xp: number;
  correct: number;
  challenge: boolean;
}

const empty: ProgressState = {
  completed: [],
  xp: 0,
  correct: 0,
  challenge: false
};

const load = (): ProgressState => {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem('phb-progress') || '{}') };
  } catch {
    return empty;
  }
};

export default function App() {
  const [page, S] = useState<Page>('home');
  const [progress, P] = useState<ProgressState>(load);
  const [active, A] = useState<Story>(stories[1]);
  const [chapter, C] = useState(0);
  const [answer, Q] = useState<number | null>(null);
  const [qi, QI] = useState(0);
  const [feedback, F] = useState('');
  const [menu, M] = useState(false);
  const [name, N] = useState(localStorage.getItem('phb-name') || 'Lucas');
  const [flips, FL] = useState<number[]>([]);
  const [matched, MA] = useState<number[]>([]);
  const [found, FO] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('phb-progress', JSON.stringify(progress));
    localStorage.setItem('phb-name', name);
  }, [progress, name]);

  const done = progress.completed.length;
  const percent = Math.round((done / stories.length) * 100);
  const go = (p: Page) => {
    S(p);
    M(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const open = (s: Story) => {
    A(s);
    C(0);
    go('story');
  };

  const finish = () => {
    P((p: ProgressState) => ({
      ...p,
      completed: p.completed.includes(active.id) ? p.completed : [...p.completed, active.id],
      xp: p.xp + 30
    }));
    QI(0);
    Q(null);
    F('');
    go('quiz');
  };

  const current = active.quiz[qi];
  const submit = () => {
    if (answer === null) return;
    const ok = answer === current.answer;
    F((ok ? '🎉 Muito bem! ' : 'Vamos aprender juntos! ') + current.explanation);
    if (ok) {
      P((p: ProgressState) => ({ ...p, xp: p.xp + 10, correct: p.correct + 1 }));
    }
  };

  const next = () => {
    if (qi < active.quiz.length - 1) {
      QI((q: number) => q + 1);
      Q(null);
      F('');
    } else {
      P((p: ProgressState) => ({ ...p, xp: p.xp + 20 }));
      go('home');
    }
  };

  const cards = useMemo(
    () =>
      ['🦁', '👑', '🛶', '⭐', '🕊️', '🐑']
        .flatMap((v, i) => [
          { id: i * 2, v },
          { id: i * 2 + 1, v }
        ])
        .sort((a, b) => ((a.id * 17 + 7) % 13) - ((b.id * 17 + 7) % 13)),
    []
  );

  const flip = (id: number) => {
    if (flips.length === 2 || flips.includes(id) || matched.includes(id)) return;
    const f = [...flips, id];
    FL(f);
    if (f.length === 2) {
      if (cards.find((c) => c.id === f[0])?.v === cards.find((c) => c.id === f[1])?.v) {
        MA((m) => [...m, ...f]);
        P((p: ProgressState) => ({ ...p, xp: p.xp + 5 }));
      }
      setTimeout(() => FL([]), 700);
    }
  };

  const nav = [
    ['home', 'Início', HomeIcon],
    ['stories', 'Aventuras', BookOpen],
    ['map', 'Mapa bíblico', Compass],
    ['games', 'Jogos', Gamepad2],
    ['badges', 'Conquistas', Trophy],
    ['profile', 'Meu perfil', UserRound]
  ] as const;

  const Side = () => (
    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <div className="brand">
        <span>👑</span>
        <div>
          Pequenos <b>Heróis</b>
          <small>da Bíblia</small>
        </div>
      </div>
      <button className="close-menu" onClick={() => M(false)}>
        <X />
      </button>
      <label>SUA JORNADA</label>
      {nav.map(([id, t, Icon]) => (
        <button
          className={'nav ' + (page === id ? 'sel' : '')}
          onClick={() => go(id as Page)}
          key={id}
        >
          <Icon size={18} />
          {t}
        </button>
      ))}
      <div className="side-bottom">
        <div className="verse">
          “Seja forte e corajoso!”<small>Josué 1:9</small>
        </div>
        <button className="nav" onClick={() => go('plans')}>
          <Crown size={18} /> Planos da família
        </button>
        <small>{hasSupabase ? 'Supabase configurado' : 'Modo demonstração local'}</small>
      </div>
    </aside>
  );

  const Header = () => (
    <header className="topbar">
      <button className="hamb" onClick={() => M(true)}>
        <Menu />
      </button>
      <span>
        Minha jornada <b>/</b> {nav.find((n) => n[0] === page)?.[1] || 'Aventura'}
      </span>
      <div className="top-actions">
        <span className="xp">⭐ {progress.xp} XP</span>
        <button className="user-dot" onClick={() => go('profile')}>
          🧒
        </button>
      </div>
    </header>
  );

  const Card = ({ s }: { s: Story }) => (
    <button className="story-card" onClick={() => open(s)}>
      <div className="story-art">
        <img src={s.art} alt={'Ilustração ' + s.title} />
        {progress.completed.includes(s.id) && <span className="stamp">✓ Concluída</span>}
      </div>
      <div className="story-info">
        <small>
          {s.theme} · {s.ref}
        </small>
        <h3>{s.title}</h3>
        <p>{s.tagline}</p>
        <div className="card-foot">
          <span>★★★★★</span>
          <b>
            Explorar <ArrowRight size={14} />
          </b>
        </div>
      </div>
    </button>
  );

  const Intro = ({ tag, title, desc }: { tag: string; title: string; desc: string }) => (
    <div className="intro">
      <small>{tag}</small>
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
  );

  const HomePage = () => (
    <>
      <section className="hero">
        <div className="hero-text">
          <span className="chip">
            <Sparkles size={14} /> SUA AVENTURA CONTINUA
          </span>
          <h1>
            Olá, pequeno herói,
            <br />
            <em>{name}!</em>
          </h1>
          <p>
            Há uma história incrível esperando por você. Vamos aprender, brincar e descobrir o que a
            Bíblia nos ensina?
          </p>
          <button
            className="btn yellow"
            onClick={() => open(stories.find((s) => !progress.completed.includes(s.id)) || stories[0])}
          >
            <Play size={16} fill="currentColor" /> Continuar aventura
          </button>
        </div>
        <img src="/illustrations/hero-family.svg" alt="Jesus e crianças" />
      </section>
      <section className="stats">
        <div className="stat mint">
          <span>📚</span>
          <div>
            <small>Histórias concluídas</small>
            <b>
              {done} <i>/ {stories.length}</i>
            </b>
            <div className="bar">
              <span style={{ width: percent + '%' }} />
            </div>
          </div>
        </div>
        <div className="stat lilac">
          <span>⭐</span>
          <div>
            <small>Seus pontos</small>
            <b>
              {progress.xp} <i>XP</i>
            </b>
            <small>Continue brilhando!</small>
          </div>
        </div>
        <div className="stat peach">
          <span>🎯</span>
          <div>
            <small>Missão de hoje</small>
            <b>Faça o bem</b>
            <small>Ajude alguém da família</small>
          </div>
        </div>
      </section>
      <div className="section-title">
        <div>
          <small>ESCOLHA SEU PRÓXIMO CAPÍTULO</small>
          <h2>Grandes aventuras bíblicas</h2>
          <p>Conheça personagens incríveis e descubra suas histórias.</p>
        </div>
        <button className="link-btn" onClick={() => go('stories')}>
          Ver todas <ArrowRight size={15} />
        </button>
      </div>
      <div className="story-grid">
        {stories.slice(0, 4).map((s) => (
          <Card key={s.id} s={s} />
        ))}
      </div>
      <section className="daily">
        <span>💛</span>
        <div>
          <small>PEQUENA MISSÃO, GRANDE CORAÇÃO</small>
          <h3>Espalhe bondade hoje!</h3>
          <p>Faça algo gentil por alguém: ajude, compartilhe ou ofereça um abraço.</p>
        </div>
        <button
          className={'btn ' + (progress.challenge ? 'green' : 'navy')}
          onClick={() =>
            P((p: ProgressState) => ({
              ...p,
              challenge: true,
              xp: p.xp + (p.challenge ? 0 : 15)
            }))
          }
        >
          {progress.challenge ? 'Missão concluída ✓' : 'Aceitar missão'}
        </button>
      </section>
    </>
  );

  const StoryPage = () => (
    <>
      <button className="back" onClick={() => go('stories')}>
        <ArrowLeft size={16} /> Voltar às aventuras
      </button>
      <div className="reader">
        <div className="reader-image">
          <img src={active.art} alt={active.title} />
        </div>
        <div className="reader-copy">
          <small>
            {active.theme.toUpperCase()} · {active.ref}
          </small>
          <h1>{active.title}</h1>
          <h3>{active.chapters[chapter].title}</h3>
          <p>{active.chapters[chapter].text}</p>
          <blockquote>📖 {active.chapters[chapter].verse}</blockquote>
          <div className="reflection">
            <b>💡 Pense nisso</b>
            <p>{active.chapters[chapter].reflection}</p>
          </div>
          <div className="chapter-progress">
            Capítulo {chapter + 1} de {active.chapters.length}
            <div className="bar">
              <span style={{ width: ((chapter + 1) / active.chapters.length) * 100 + '%' }} />
            </div>
          </div>
          <div className="reader-actions">
            <button
              className="btn outline"
              disabled={!chapter}
              onClick={() => C((c: number) => c - 1)}
            >
              Anterior
            </button>
            {chapter < active.chapters.length - 1 ? (
              <button className="btn yellow" onClick={() => C((c: number) => c + 1)}>
                Próximo capítulo <ArrowRight size={16} />
              </button>
            ) : (
              <button className="btn green" onClick={finish}>
                Concluir história <CheckCircle2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const Quiz = () => (
    <div className="quiz-wrap">
      <div className="quiz-card">
        <small>
          🏆 DESAFIO BÍBLICO · PERGUNTA {qi + 1} DE {active.quiz.length}
        </small>
        <img src={active.art} alt="" />
        <h1>{current.question}</h1>
        <div className="answers">
          {current.options.map((o, i) => (
            <button
              key={i}
              className={(answer === i ? 'chosen ' : '') + (feedback && i === current.answer ? ' correct' : '')}
              onClick={() => !feedback && Q(i)}
            >
              {String.fromCharCode(65 + i)}. {o}
            </button>
          ))}
        </div>
        {feedback && <div className="feedback">{feedback}</div>}
        {!feedback ? (
          <button className="btn yellow full" disabled={answer === null} onClick={submit}>
            Conferir resposta
          </button>
        ) : (
          <button className="btn green full" onClick={next}>
            {qi === active.quiz.length - 1 ? 'Finalizar desafio' : 'Próxima pergunta'}{' '}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );

  const Memory = () => (
    <>
      <Intro
        tag="ATENÇÃO E MEMÓRIA"
        title="Jogo da memória"
        desc="Encontre os pares de figuras bíblicas. Vire duas cartas por vez!"
      />
      <div className="memory-panel">
        <b>Pares encontrados: {matched.length / 2} de 6</b>
        <div className="memory-grid">
          {cards.map((c) => (
            <button
              key={c.id}
              className={'memory-card ' + (flips.includes(c.id) || matched.includes(c.id) ? 'revealed' : '')}
              onClick={() => flip(c.id)}
            >
              {flips.includes(c.id) || matched.includes(c.id) ? c.v : '?'}
            </button>
          ))}
        </div>
        {matched.length === 12 && <div className="feedback">🏅 Você encontrou todos os pares!</div>}
        <button
          className="btn outline"
          onClick={() => {
            FL([]);
            MA([]);
          }}
        >
          <RotateCcw size={15} /> Reiniciar jogo
        </button>
      </div>
    </>
  );

  const Word = () => {
    const words = ['AMOR', 'FÉ', 'PAZ', 'NOÉ', 'DAVI'];
    const grid = [
      'A M O R P A',
      'F É D A V I',
      'P A Z N O É',
      'D A V I F É',
      'N O É A M O',
      'P A Z F É D'
    ];
    return (
      <>
        <Intro
          tag="PALAVRAS BÍBLICAS"
          title="Caça-palavras"
          desc="Encontre cinco palavras escondidas na grade e toque nelas na lista!"
        />
        <div className="word-panel">
          <div className="word-list">
            {words.map((w) => (
              <button
                key={w}
                className={found.includes(w) ? 'word-done' : ''}
                onClick={() => FO((f) => (f.includes(w) ? f : [...f, w]))}
              >
                {found.includes(w) ? '✓ ' : ''}
                {w}
              </button>
            ))}
          </div>
          <div className="word-grid">
            {grid.map((row, ri) =>
              row.split(' ').map((l, ci) => <span key={`${ri}-${ci}`}>{l}</span>)
            )}
          </div>
          <p>Palavras encontradas: {found.length}/5</p>
          {found.length === 5 && (
            <div className="feedback">🎉 Muito bem! Você encontrou todas as palavras.</div>
          )}
        </div>
      </>
    );
  };

  const Badges = () => (
    <>
      <Intro
        tag="SUAS CONQUISTAS"
        title="Medalhas de herói"
        desc="Cada passo de aprendizado merece ser comemorado!"
      />
      <div className="badge-grid">
        {badges.map((b, i) => {
          const earned =
            (i === 0 && done > 0) ||
            (i === 1 && done >= 3) ||
            (i === 2 && progress.correct >= 5) ||
            (i === 3 && progress.completed.includes('davi')) ||
            (i === 4 && progress.challenge) ||
            (i === 5 && matched.length === 12);
          return (
            <article key={b.id} className={'badge-card ' + (earned ? 'earned' : '')}>
              <div>{earned ? b.emoji : '🔒'}</div>
              <h3>{b.name}</h3>
              <p>{b.desc}</p>
              <small>{earned ? 'Conquistada!' : 'Ainda não conquistada'}</small>
            </article>
          );
        })}
      </div>
    </>
  );

  const Profile = () => (
    <>
      <Intro
        tag="ÁREA DO PEQUENO HERÓI"
        title="Meu perfil"
        desc="Veja como sua aventura está crescendo."
      />
      <div className="profile">
        <article className="profile-card">
          <div>🧒</div>
          <small>AVENTUREIRO(A)</small>
          <input value={name} maxLength={20} onChange={(e) => N(e.target.value)} />
          <b>⭐ Nível {Math.floor(progress.xp / 100) + 1}</b>
          <p>Modo demonstração: seu nome e progresso ficam salvos neste dispositivo.</p>
        </article>
        <div className="profile-stats">
          <article>
            ⭐ <small>Pontos conquistados</small>
            <b>{progress.xp} XP</b>
          </article>
          <article>
            📖 <small>Histórias concluídas</small>
            <b>
              {done} de {stories.length}
            </b>
          </article>
          <article>
            🎯 <small>Respostas corretas</small>
            <b>{progress.correct}</b>
          </article>
          <button
            className="reset"
            onClick={() => {
              if (confirm('Reiniciar o progresso deste dispositivo?')) {
                P(empty);
                N('Lucas');
              }
            }}
          >
            <RotateCcw size={15} /> Reiniciar demonstração
          </button>
        </div>
      </div>
    </>
  );

  const Plans = () => (
    <>
      <Intro
        tag="CRESCENDO EM FAMÍLIA"
        title="Uma aventura para cada coração"
        desc="Conheça as opções de acesso. A cobrança ainda não está ativada nesta versão."
      />
      <div className="plans">
        <article>
          <small>PARA COMEÇAR</small>
          <h2>Gratuito</h2>
          <strong>
            R$ 0 <i>/ sempre</i>
          </strong>
          <ul>
            <li>✓ Histórias selecionadas</li>
            <li>✓ Jogos básicos</li>
            <li>✓ Progresso local</li>
          </ul>
          <button className="btn outline full" onClick={() => go('home')}>
            Continuar explorando
          </button>
        </article>
        <article className="featured">
          <label>MAIS COMPLETO</label>
          <small>PARA TODA A FAMÍLIA</small>
          <h2>Família</h2>
          <strong>
            R$ 19,90 <i>/ mês*</i>
          </strong>
          <ul>
            <li>✓ Todas as histórias</li>
            <li>✓ Novos jogos e desafios</li>
            <li>✓ Até 4 perfis infantis</li>
            <li>✓ Acompanhamento familiar</li>
            <li>✓ Atividades para imprimir</li>
          </ul>
          <button
            className="btn yellow full"
            onClick={() => alert('A assinatura será ativada após configurar o provedor de pagamentos.')}
          >
            Quero conhecer
          </button>
          <p className="fine">*Preço ilustrativo, sujeito a definição.</p>
        </article>
      </div>
      <div className="parent-note">
        <ShieldCheck />{' '}
        <p>
          <b>Feito para famílias.</b> Sem chat aberto, publicidade infantil ou contato entre crianças nesta versão.
        </p>
      </div>
    </>
  );

  const Map = () => (
    <>
      <Intro
        tag="EXPLORE A PALAVRA"
        title="Mapa das aventuras"
        desc="Cada parada é uma história. Complete uma aventura para avançar pelo caminho!"
      />
      <div className="map-board">
        <div className="map-deco">☀️ 🌳 🏡 🌴</div>
        <div className="map-stops">
          {stories.map((s, i) => (
            <button key={s.id} onClick={() => open(s)} className={'map-stop m' + i}>
              <span>{progress.completed.includes(s.id) ? '✓' : s.emoji}</span>
              <b>
                {i + 1}. {s.title}
              </b>
              <small>{s.theme}</small>
            </button>
          ))}
        </div>
        <p>🌿 Sua jornada está só começando. Continue explorando!</p>
      </div>
    </>
  );

  const Games = () => (
    <>
      <Intro
        tag="APRENDER BRINCANDO"
        title="Hora de jogar!"
        desc="Desafie sua memória e descubra palavras especiais."
      />
      <div className="games-grid">
        <article>
          <div>🧠🃏</div>
          <small>ATENÇÃO E MEMÓRIA</small>
          <h2>Jogo da memória</h2>
          <p>Encontre os pares de figuras bíblicas.</p>
          <button
            className="btn navy"
            onClick={() => {
              FL([]);
              MA([]);
              go('memory');
            }}
          >
            Jogar agora <ArrowRight size={15} />
          </button>
        </article>
        <article>
          <div>🔤✨</div>
          <small>PALAVRAS BÍBLICAS</small>
          <h2>Caça-palavras</h2>
          <p>Encontre palavras importantes escondidas.</p>
          <button
            className="btn navy"
            onClick={() => {
              FO([]);
              go('word');
            }}
          >
            Jogar agora <ArrowRight size={15} />
          </button>
        </article>
        <article>
          <div>🏆❓</div>
          <small>TESTE SEU CONHECIMENTO</small>
          <h2>Desafio bíblico</h2>
          <p>Responda perguntas sobre as histórias.</p>
          <button
            className="btn navy"
            onClick={() => {
              A(stories[1]);
              QI(0);
              Q(null);
              F('');
              go('quiz');
            }}
          >
            Começar <ArrowRight size={15} />
          </button>
        </article>
      </div>
    </>
  );

  const content =
    page === 'home' ? (
      <HomePage />
    ) : page === 'stories' ? (
      <>
        <Intro
          tag="BIBLIOTECA DE AVENTURAS"
          title="Histórias que ensinam"
          desc="Cada aventura traz uma lição especial para levar no coração."
        />
        <div className="story-grid">
          {stories.map((s) => (
            <Card key={s.id} s={s} />
          ))}
        </div>
      </>
    ) : page === 'story' ? (
      <StoryPage />
    ) : page === 'quiz' ? (
      <Quiz />
    ) : page === 'map' ? (
      <Map />
    ) : page === 'games' ? (
      <Games />
    ) : page === 'memory' ? (
      <Memory />
    ) : page === 'word' ? (
      <Word />
    ) : page === 'badges' ? (
      <Badges />
    ) : page === 'profile' ? (
      <Profile />
    ) : (
      <Plans />
    );

  return (
    <div className="app-shell">
      <Side />
      <div className="main">
        <Header />
        <main>{content}</main>
        <footer>
          Pequenos Heróis da Bíblia <span>Feito com carinho para aprender em família 💛</span>
        </footer>
      </div>
      {menu && <button className="scrim" onClick={() => M(false)} aria-label="Fechar menu" />}
    </div>
  );
}
