import { icon } from "./icons.js";
import { escapeHtml as e } from "./core.js";
export function authView(mode, plan) {
  const signup = mode === "cadastro",
    recover = mode === "recuperar",
    reset = mode === "definir-senha";
  const title = signup
    ? "Um novo capítulo<br>começa aqui."
    : recover
      ? "Vamos recuperar<br>seu acesso."
      : reset
        ? "Uma nova senha.<br>As mesmas histórias."
        : "Que bom ter<br>você de volta.";
  return `<main id="main" tabindex="-1" class="auth-page container"><div class="auth-art"><img src="/images/hero.webp" alt="Jesus e crianças em um cenário da coleção." width="1200" height="800"><div><h2>Pequenos momentos.<br>Grandes lembranças.</h2><p>Uma biblioteca inteira para descobrir em família.</p></div></div><div class="auth-panel"><a href="/" data-link class="text-link">${icon("back")}Voltar ao início</a><h1>${title}</h1><p>${signup ? "Crie a conta do adulto responsável para começar." : recover ? "Enviaremos um link para o e-mail da sua conta." : reset ? "Escolha uma senha com pelo menos 8 caracteres." : "Entre para continuar suas histórias favoritas."}</p>${plan ? `<div class="chosen-plan">Plano ${plan === "annual" ? "anual: R$ 197/ano" : "mensal: R$ 37,90/mês"}. ${signup ? "O pagamento acontece na próxima etapa." : ""}</div>` : ""}<form id="auth-form" data-mode="${mode}">${!reset ? '<label>E-mail do responsável<input type="email" name="email" required autocomplete="email" placeholder="seuemail@exemplo.com"></label>' : ""}${!recover ? `<label>${reset ? "Nova senha" : "Senha"}<input type="password" name="password" required minlength="8" autocomplete="${signup || reset ? "new-password" : "current-password"}" placeholder="Pelo menos 8 caracteres"></label>` : ""}${signup ? '<label class="checkbox-label"><input type="checkbox" name="adult" required><span>Sou adulto responsável e li os <a href="/termos" data-link>Termos de uso</a> e a <a href="/privacidade" data-link>Política de privacidade</a>.</span></label>' : ""}<p class="form-message" id="auth-message" role="status" aria-live="polite"></p><button type="submit" class="button primary full">${signup ? "Criar minha conta" : recover ? "Enviar link de recuperação" : reset ? "Salvar nova senha" : "Entrar"} ${icon("arrow")}</button></form>${!recover && !reset ? `<div class="auth-links">${signup ? `Já tem uma conta? <a href="/entrar${plan ? "?plano=" + plan : ""}" data-link>Entrar</a>` : `<a href="/recuperar" data-link>Esqueci minha senha</a><span>Primeira visita? <a href="/cadastro${plan ? "?plano=" + plan : ""}" data-link>Criar conta</a></span>`}</div>` : '<a class="text-link" href="/entrar" data-link>Voltar para entrar</a>'}</div></main>`;
}
export function accountView(state) {
  const sub = state.subscription;
  const paid = state.hasAccess;
  const status = {
    active: "Ativa",
    canceled: "Cancelada",
    past_due: "Pagamento pendente",
    unpaid: "Pagamento pendente",
    incomplete: "Aguardando pagamento",
    incomplete_expired: "Pagamento expirado",
    trialing: "Em avaliação",
    paused: "Pausada",
  };
  const end = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("pt-BR")
    : null;
  return `<main id="main" tabindex="-1" class="account-page container"><div class="section-heading"><p class="small-note">O espaço do responsável</p><h1>Minha conta</h1><p>${e(state.session?.user?.email || "Prévia local")}</p></div>${new URLSearchParams(location.search).has("pagamento") ? '<div class="notice">Seu pagamento está sendo confirmado. A liberação pode levar alguns instantes. <button class="text-link" id="refresh-payment">Atualizar acesso</button></div>' : ""}<div class="account-grid"><section class="account-card"><h2>${icon("book")}Sua assinatura</h2><span class="pill ${paid ? "success" : ""}">${paid ? "Acesso à coleção completa" : sub ? e(status[sub.status] || "Acesso indisponível") : "Sem assinatura ativa"}</span><p>${state.complimentaryAccess ? "Acesso completo gratuito, sem assinatura ou cobrança." : sub ? `Plano ${sub.plan === "annual" ? "anual" : "mensal"}. ${end ? (sub.cancel_at_period_end ? "Acesso contratado até " : "Fim do período atual: ") + end + "." : ""}` : "Escolha um plano para abrir todas as histórias."}</p>${sub?.cancel_at_period_end ? "<p>A renovação está cancelada para o fim do período atual.</p>" : ""}<div class="account-actions">${state.complimentaryAccess ? '<a class="button primary" href="/biblioteca" data-link>Abrir biblioteca</a>' : sub ? '<button class="button primary" id="billing-portal">Gerenciar assinatura</button>' : '<a class="button primary" href="/planos" data-link>Escolher meu plano</a>'}<button class="button outline" id="refresh-account">Atualizar acesso</button></div></section><section class="account-card"><h2>${icon("heart")}A jornada de vocês</h2><div class="account-stats"><div><strong>${Object.values(state.progress).filter((p) => p.completed).length}</strong><span>histórias concluídas</span></div><div><strong>${Object.values(state.progress).filter((p) => p.favorite).length}</strong><span>favoritas</span></div></div><a class="text-link" href="/biblioteca" data-link>Continuar na biblioteca ${icon("arrow")}</a></section></div><button class="button outline" id="logout">${icon("logout")}Sair da conta</button></main>`;
}
