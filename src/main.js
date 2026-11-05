import { LIBRARY_PAGE_SIZE } from "../shared/collection.mjs";
import "./styles.css";
import { createAccountRefresher } from "./account-state.js";
import { icon, brand } from "./icons.js";
import { escapeHtml as e, filterStories } from "./core.js";
import { landing } from "./landing.js";
import { library, storyCard, paywall } from "./library.js";
import { reader } from "./reader.js";
import { captureReaderAudio, restoreReaderAudio } from "./reader-audio.js";
import { authView, accountView } from "./auth.js";
import { legalPage } from "./legal.js";
import { createMetaPixelTracker } from "./meta-pixel.js";
import { createGa4Tracker } from "./analytics.js";
import {
  demo,
  configured,
  getClient,
  api,
  getStory,
  loadProgress,
  saveLocal,
  saveProgress,
  waitForProgress,
} from "./services.js";
const app = document.querySelector("#app");
const metaPixel = createMetaPixelTracker({ win: window, doc: document });
const ga4 = createGa4Tracker({ win: window, doc: document });
metaPixel.syncRoute();
const readSetting = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const setSetting = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const state = {
  catalog: [],
  session: null,
  subscription: null,
  hasAccess: demo,
  progress: loadProgress(),
  story: null,
  part: 0,
  night: readSetting("ph:night", "false") === "true",
  font: Math.max(17, Math.min(27, Number(readSetting("ph:font", "20")) || 20)),
};
let renderVersion = 0,
  toastTimer,
  authBusy = false,
  visibleStories = LIBRARY_PAGE_SIZE,
  filters = { query: "", testament: "todos", favorites: false };
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 4800);
}
function header() {
  const route = location.pathname;
  return `<header class="site-header"><div class="container header-inner"><a href="/" data-link class="brand" aria-label="Pequenos Heróis, início">${brand()}</a><button class="icon-button menu-toggle" id="menu-toggle" aria-controls="site-nav" aria-expanded="false" aria-label="Abrir menu">${icon("menu")}</button><nav id="site-nav" aria-label="Navegação principal"><a href="/biblioteca" data-link ${route === "/biblioteca" ? 'aria-current="page"' : ""}>As histórias</a><a href="/#como-funciona" data-link>Como funciona</a><a href="/planos" data-link>Planos</a><a href="/${state.session ? "conta" : "entrar"}" data-link class="nav-login">${icon("user")}${state.session ? "Minha conta" : "Entrar"}</a>${!state.hasAccess ? '<a href="/planos" data-link class="button primary small">Começar a aventura</a>' : ""}</nav></div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="container"><div class="footer-main"><a href="/" data-link class="brand">${brand()}</a><p>Grandes histórias.<br>Pequenos momentos de fé.</p><div><a href="/biblioteca" data-link>Biblioteca</a><a href="/planos" data-link>Planos</a><a href="/entrar" data-link>Área da família</a></div><div><a href="/termos" data-link>Termos de uso</a><a href="/privacidade" data-link>Privacidade</a>${import.meta.env.VITE_SUPPORT_EMAIL ? `<a href="mailto:${e(import.meta.env.VITE_SUPPORT_EMAIL)}">Fale com a gente</a>` : ""}</div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Pequenos Heróis</span><span>Feito para ler, conversar e orar em família.</span></div></div></footer>`;
}
function shell(content) {
  app.innerHTML =
    header() +
    content +
    footer() +
    (demo
      ? `<div class="demo-bar">Prévia local · ${state.catalog.length} histórias abertas para testar · Nenhuma cobrança real</div>`
      : "");
}
function navigate(url) {
  history.pushState({}, "", url);
  render();
}
const refreshAccount = createAccountRefresher(state, {
  request: async (userId) => {
    await waitForProgress(userId);
    return api("account");
  },
  readLocal: loadProgress,
  writeLocal: saveLocal,
  notify: toast,
  demo,
});
async function render() {
  metaPixel.syncRoute();
  const version = ++renderVersion;
  const route = location.pathname.replace(/\/$/, "") || "/";
  state.story = null;
  document.body.dataset.readerNight = "false";
  document.documentElement.style.setProperty(
    "--reading-size",
    `${state.font}px`,
  );
  let content;
  if (route === "/" || route === "/planos") {
    content = landing(state.catalog);
    document.title = "Pequenos Heróis — Histórias que ficam. Fé que cresce.";
  } else if (route === "/biblioteca") {
    filters = { query: "", testament: "todos", favorites: false };
    visibleStories = LIBRARY_PAGE_SIZE;
    content = library(state);
    document.title = "Biblioteca de histórias — Pequenos Heróis";
  } else if (/^\/historia\/\d+$/.test(route)) {
    const id = Number(route.split("/").pop()),
      meta = state.catalog.find((s) => s.id === id);
    if (!meta) content = notFound();
    else if (id !== 1 && !state.session && !demo) content = paywall(meta);
    else {
      shell(
        '<main id="main" class="loading-state" tabindex="-1"><span class="loading-dot"></span><p>Abrindo sua história…</p></main>',
      );
      try {
        const story = await getStory(id, { member: state.hasAccess });
        if (version !== renderVersion) return;
        state.story = story;
        state.part = state.progress[id]?.completed
          ? 0
          : state.progress[id]?.part || 0;
        content = reader(story, state);
        document.body.dataset.readerNight = String(state.night);
        document.title = `${story.title} — Pequenos Heróis`;
      } catch (err) {
        if (version !== renderVersion) return;
        content = [401, 403].includes(err.status)
          ? paywall(meta)
          : `<main class="error-page container" id="main"><h1>Esta história não abriu.</h1><p>${e(err.message)}</p><button class="button primary" id="retry-route">Tentar novamente</button><a class="text-link" href="/biblioteca" data-link>Voltar à biblioteca</a></main>`;
      }
    }
  } else if (
    ["/entrar", "/cadastro", "/recuperar", "/definir-senha"].includes(route)
  ) {
    const plan = new URLSearchParams(location.search).get("plano");
    content = authView(
      route.slice(1),
      ["annual", "monthly"].includes(plan) ? plan : null,
    );
    document.title = "Sua conta — Pequenos Heróis";
  } else if (route === "/conta") {
    content = state.session ? accountView(state) : authView("entrar", null);
    document.title = "Minha conta — Pequenos Heróis";
  } else if (["/privacidade", "/termos"].includes(route)) {
    content = legalPage(route.slice(1));
    document.title = `${route === "/termos" ? "Termos de uso" : "Privacidade"} — Pequenos Heróis`;
  } else content = notFound();
  if (version !== renderVersion) return;
  shell(content);
  ga4.trackRoute();
  bindPage();
  document.querySelector("#main")?.focus({ preventScroll: true });
  const hash = route === "/planos" ? "planos" : location.hash.slice(1);
  if (hash)
    setTimeout(
      () =>
        document
          .getElementById(hash)
          ?.scrollIntoView({ behavior: "instant", block: "start" }),
      20,
    );
  else window.scrollTo({ top: 0, behavior: "instant" });
}
function notFound() {
  return '<main id="main" class="error-page container" tabindex="-1"><h1>Essa página saiu para uma aventura.</h1><p>Encontre sua próxima história na biblioteca.</p><a class="button primary" href="/biblioteca" data-link>Abrir biblioteca</a></main>';
}
function updateGrid({ reset = true } = {}) {
  if (reset) visibleStories = LIBRARY_PAGE_SIZE;
  const stories = filterStories(state.catalog, {
    ...filters,
    progress: state.progress,
  });
  document.querySelector("#results-count").textContent =
    `${stories.length} ${stories.length === 1 ? "história encontrada" : "histórias encontradas"}`;
  document.querySelector("#story-grid").innerHTML = stories.length
    ? stories.slice(0, visibleStories).map((s) => storyCard(s, state)).join("")
    : `<div class="empty-state">${icon(filters.favorites ? "heart" : "search")}<h2>${filters.favorites ? "Suas favoritas vão morar aqui." : "Nenhuma história encontrada."}</h2><p>${filters.favorites ? "Toque no coração de uma história para guardar para depois." : "Tente outro nome ou remova os filtros."}</p><button id="clear-filters" class="button outline">Ver todas as histórias</button></div>`;
  const more = document.querySelector("#library-more");
  if (more) more.hidden = stories.length <= visibleStories;
}
async function persist(storyId) {
  try {
    await saveProgress(state.progress, storyId, state.session?.user.id);
  } catch (err) {
    toast(err.message);
  }
}
async function favorite(id) {
  const p = state.progress[id] || {
    story_id: id,
    part: 0,
    completed: false,
    favorite: false,
  };
  state.progress[id] = { ...p, favorite: !p.favorite };
  document.querySelectorAll(`[data-favorite="${id}"]`).forEach((btn) => {
    const yes = state.progress[id].favorite;
    btn.classList.toggle("is-favorite", yes);
    btn.setAttribute("aria-pressed", yes);
    btn.setAttribute(
      "aria-label",
      yes ? "Remover dos favoritos" : "Adicionar aos favoritos",
    );
  });
  if (filters.favorites && document.querySelector("#story-grid")) updateGrid();
  toast(
    state.progress[id].favorite
      ? "História guardada nos favoritos."
      : "História removida dos favoritos.",
  );
  await persist(id);
}
function redrawReader() {
  if (!state.story) return;
  const audioState = captureReaderAudio(document.querySelector("audio"));
  const root = document.querySelector(".reader-page");
  root.outerHTML = reader(state.story, state);
  bindReader();
  restoreReaderAudio(
    document.querySelector("audio"),
    audioState,
    document.querySelector("#audio-speed"),
  );
  document
    .querySelector("#reading-content")
    ?.scrollIntoView({ behavior: "instant", block: "start" });
}
async function movePart(part) {
  if (!state.story || part < 0 || part > 3) return;
  state.part = part;
  const id = state.story.id;
  state.progress[id] = {
    story_id: id,
    completed: false,
    favorite: false,
    ...state.progress[id],
    part,
  };
  redrawReader();
  await persist(id);
}
async function finish() {
  const id = state.story.id;
  if (state.progress[id]?.completed) {
    navigate("/biblioteca");
    return;
  }
  state.progress[id] = {
    story_id: id,
    favorite: false,
    ...state.progress[id],
    part: 3,
    completed: true,
  };
  redrawReader();
  toast("Uma história vivida juntos. Leitura concluída!");
  await persist(id);
}
function bindReader() {
  document
    .querySelector("#font-smaller")
    ?.addEventListener("click", () => font(-1));
  document
    .querySelector("#font-larger")
    ?.addEventListener("click", () => font(1));
  document.querySelector("#reader-theme")?.addEventListener("click", () => {
    state.night = !state.night;
    setSetting("ph:night", state.night);
    document.body.dataset.readerNight = String(state.night);
    const btn = document.querySelector("#reader-theme");
    btn.innerHTML = icon(state.night ? "sun" : "moon");
    btn.setAttribute("aria-pressed", state.night);
    btn.setAttribute(
      "aria-label",
      state.night ? "Usar tema claro" : "Usar modo noturno",
    );
  });
  document
    .querySelector("#audio-speed")
    ?.addEventListener("change", (event) => {
      document.querySelector("audio").playbackRate = Number(event.target.value);
    });
  document.querySelector("audio")?.addEventListener("error", () => {
    document.querySelector(".audio-error").hidden = false;
  });
}
function font(delta) {
  state.font = Math.max(17, Math.min(27, state.font + delta));
  setSetting("ph:font", state.font);
  document.documentElement.style.setProperty(
    "--reading-size",
    `${state.font}px`,
  );
  toast(`Tamanho do texto: ${state.font}`);
}
function bindPage() {
  document
    .querySelector("#story-search")
    ?.addEventListener("input", (event) => {
      filters.query = event.target.value;
      updateGrid();
    });
  document.querySelector("#auth-form")?.addEventListener("submit", submitAuth);
  bindReader();
}
async function openStripeCheckout(plan) {
  const analytics = await ga4.checkoutAttribution();
  const { url } = await api("checkout", {
    method: "POST",
    body: { plan, ...(analytics ? { analytics } : {}) },
  });
  await ga4.beginCheckout(plan);
  safeRedirect(url);
}
async function startCheckout(plan, button) {
  if (!["annual", "monthly"].includes(plan) || button?.disabled) return;
  metaPixel.initiateCheckout(plan);
  if (!state.session) {
    navigate(`/cadastro?plano=${plan}`);
    return;
  }
  if (demo) {
    toast("Prévia local: nenhum pagamento será iniciado.");
    return;
  }
  await busy(button, async () => {
    await openStripeCheckout(plan);
  });
}
function safeRedirect(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(parsed.hostname)
  )
    throw new Error("O endereço de pagamento não é válido.");
  location.assign(parsed.href);
}
async function busy(button, fn) {
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    await fn();
  } catch (err) {
    toast(err.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}
async function submitAuth(event) {
  event.preventDefault();
  const form = event.target,
    mode = form.dataset.mode,
    button = form.querySelector("button[type=submit]"),
    msg = document.querySelector("#auth-message");
  const plan = new URLSearchParams(location.search).get("plano");
  if (!configured) {
    msg.textContent = demo
      ? "Esta é uma prévia local. Cadastro e pagamento estarão disponíveis ao conectar os serviços descritos no guia."
      : "O acesso à conta está temporariamente indisponível. Tente novamente mais tarde.";
    return;
  }
  authBusy = true;
  button.disabled = true;
  msg.textContent = "Só um instante…";
  try {
    const client = await getClient(),
      data = new FormData(form),
      email = String(data.get("email") || "").trim(),
      password = String(data.get("password") || "");
    let result;
    if (mode === "recuperar") {
      result = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/definir-senha`,
      });
      if (result.error) throw result.error;
      msg.textContent =
        "Se houver uma conta com esse e-mail, você receberá um link para redefinir sua senha. Confira também o spam.";
      return;
    }
    if (mode === "definir-senha") {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session)
        throw new Error(
          "Abra o link de recuperação enviado por e-mail antes de definir uma senha.",
        );
      result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
      toast("Senha atualizada. Seu acesso foi recuperado.");
      state.session = sessionData.session;
      await refreshAccount();
      navigate("/conta");
      return;
    }
    if (mode === "cadastro") {
      result = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/conta` },
      });
      if (result.error) throw result.error;
      if (!result.data.session) {
        msg.textContent =
          "Confira seu e-mail e confirme o cadastro. Depois, entre na conta para escolher seu plano.";
        form.querySelector("[name=password]").value = "";
        return;
      }
    } else result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    state.session = result.data.session;
    await refreshAccount();
    if (["annual", "monthly"].includes(plan) && !state.hasAccess && !demo) {
      await openStripeCheckout(plan);
    } else navigate("/biblioteca");
  } catch (err) {
    const known = {
      "Invalid login credentials":
        "E-mail ou senha incorretos. Confira seus dados.",
      "Email not confirmed": "Confirme seu e-mail antes de entrar.",
      "User already registered":
        "Este e-mail já está cadastrado. Entre ou recupere a senha.",
      "Password should be at least 8 characters.":
        "Use uma senha com pelo menos 8 caracteres.",
    };
    msg.textContent =
      known[err.message] ||
      (/fetch|network/i.test(err.message)
        ? "Não foi possível conectar. Confira sua internet e tente novamente."
        : err.message || "Não foi possível concluir. Tente novamente.");
  } finally {
    button.disabled = false;
    authBusy = false;
  }
}
document.addEventListener("click", async (event) => {
  const anchor = event.target.closest("a[data-link]");
  if (
    anchor &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.button === 0
  ) {
    event.preventDefault();
    navigate(anchor.getAttribute("href"));
    return;
  }
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.dataset.plan) return startCheckout(button.dataset.plan, button);
  if (button.dataset.favorite) return favorite(Number(button.dataset.favorite));
  if (button.dataset.part !== undefined)
    return movePart(Number(button.dataset.part));
  if (button.dataset.testament) {
    filters.testament = button.dataset.testament;
    document.querySelectorAll("[data-testament]").forEach((b) => {
      const active = b === button;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    return updateGrid();
  }
  switch (button.id) {
    case "load-more-stories": {
      const firstNew = visibleStories;
      visibleStories += LIBRARY_PAGE_SIZE;
      updateGrid({ reset: false });
      document.querySelectorAll("#story-grid .story-image")[firstNew]?.focus({ preventScroll: true });
      break;
    }
    case "reload-app":
      location.reload();
      break;
    case "menu-toggle": {
      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", expanded);
      document.querySelector("#site-nav").classList.toggle("is-open", expanded);
      break;
    }
    case "favorite-filter":
      filters.favorites = !filters.favorites;
      button.setAttribute("aria-pressed", filters.favorites);
      button.classList.toggle("active", filters.favorites);
      updateGrid();
      break;
    case "clear-filters":
      navigate("/biblioteca");
      break;
    case "finish-story":
      finish();
      break;
    case "retry-route":
    case "reload-audio":
      render();
      break;
    case "refresh-payment":
    case "refresh-account":
      await busy(button, async () => {
        await refreshAccount();
        render();
        toast(
          state.hasAccess
            ? "Acesso confirmado. Boa leitura!"
            : "Acesso atualizado.",
        );
      });
      break;
    case "billing-portal":
      await busy(button, async () => {
        if (demo)
          throw new Error(
            "A gestão de assinatura não está ativa na prévia local.",
          );
        const { url } = await api("portal", { method: "POST" });
        safeRedirect(url);
      });
      break;
    case "logout":
      await busy(button, async () => {
        const client = await getClient();
        if (client) {
          const { error } = await client.auth.signOut();
          if (error) throw error;
        }
        state.session = null;
        await refreshAccount();
        navigate("/");
      });
      break;
  }
});
window.addEventListener("popstate", render);
async function init() {
  try {
    const response = await fetch("/catalog.json");
    if (!response.ok) throw new Error("A biblioteca não pôde ser carregada.");
    const data = await response.json();
    state.catalog = Array.isArray(data) ? data : data.stories;
    const client = await getClient();
    if (client) {
      const {
        data: { session },
      } = await client.auth.getSession();
      state.session = session;
      await refreshAccount();
      client.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION" || authBusy) return;
        setTimeout(async () => {
          const accountChanged = state.session?.user.id !== session?.user.id;
          state.session = session;
          if (accountChanged) {
            ++renderVersion;
            state.story = null;
            shell(
              '<main id="main" class="loading-state"><p>Atualizando sua conta…</p></main>',
            );
          }
          await refreshAccount();
          if (event === "PASSWORD_RECOVERY") navigate("/definir-senha");
          else if (["SIGNED_IN", "SIGNED_OUT"].includes(event)) render();
        }, 0);
      });
    }
    await render();
  } catch (err) {
    shell(
      `<main id="main" class="error-page container"><h1>Vamos tentar mais uma vez?</h1><p>${e(err.message)}</p><button class="button primary" id="reload-app">Recarregar</button></main>`,
    );
  }
}
init();
