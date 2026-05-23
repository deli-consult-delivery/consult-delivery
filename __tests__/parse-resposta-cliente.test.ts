import { describe, it, expect } from "vitest";
import { parseRespostaCliente } from "../trigger/_shared/parse-resposta-cliente";

describe("parseRespostaCliente", () => {
  // ── Aprovações numéricas ──────────────────────────────────────────────────

  it("OK 5 → aprovacoes=[5]", () => {
    const r = parseRespostaCliente("OK 5");
    expect(r.aprovacoes).toEqual([5]);
    expect(r.ambiguo).toBe(false);
  });

  it("ok 1,3,5 → aprovacoes=[1,3,5]", () => {
    const r = parseRespostaCliente("ok 1,3,5");
    expect(r.aprovacoes).toEqual([1, 3, 5]);
    expect(r.ambiguo).toBe(false);
  });

  it("ok 1, 3, 5 (com espaço) → aprovacoes=[1,3,5]", () => {
    const r = parseRespostaCliente("ok 1, 3, 5");
    expect(r.aprovacoes).toEqual([1, 3, 5]);
  });

  it("Aprovado 2 → aprovacoes=[2]", () => {
    const r = parseRespostaCliente("Aprovado 2");
    expect(r.aprovacoes).toEqual([2]);
    expect(r.ambiguo).toBe(false);
  });

  // ── Aprovações de bloco ───────────────────────────────────────────────────

  it("OK bloco 1 → bloco_aprovacoes=['1']", () => {
    const r = parseRespostaCliente("OK bloco 1");
    expect(r.bloco_aprovacoes).toContain("1");
    expect(r.aprovacoes).toEqual([]);
    expect(r.ambiguo).toBe(false);
  });

  it("OK tudo → aprovar_tudo=true, aprovacoes=[], bloco_aprovacoes=[]", () => {
    const r = parseRespostaCliente("OK tudo");
    expect(r.aprovar_tudo).toBe(true);
    expect(r.aprovacoes).toEqual([]);
    expect(r.bloco_aprovacoes).toEqual([]);
    expect(r.ambiguo).toBe(false);
  });

  it("ok TUDO (maiúsculas) → aprovar_tudo=true", () => {
    const r = parseRespostaCliente("ok TUDO");
    expect(r.aprovar_tudo).toBe(true);
  });

  it("OK cardapio → bloco_aprovacoes=['cardapio']", () => {
    const r = parseRespostaCliente("OK cardapio");
    expect(r.bloco_aprovacoes).toContain("cardapio");
    expect(r.aprovacoes).toEqual([]);
  });

  it("OK cardápio (com acento) → bloco_aprovacoes=['cardapio']", () => {
    const r = parseRespostaCliente("OK cardápio");
    expect(r.bloco_aprovacoes).toContain("cardapio");
  });

  // ── Rejeições ─────────────────────────────────────────────────────────────

  it("NAO 3 → rejeicoes=[3]", () => {
    const r = parseRespostaCliente("NAO 3");
    expect(r.rejeicoes).toEqual([3]);
    expect(r.ambiguo).toBe(false);
  });

  it("Não 3 (com acento) → rejeicoes=[3]", () => {
    const r = parseRespostaCliente("Não 3");
    expect(r.rejeicoes).toEqual([3]);
  });

  it("Rejeito 4 → rejeicoes=[4]", () => {
    const r = parseRespostaCliente("Rejeito 4");
    expect(r.rejeicoes).toEqual([4]);
    expect(r.ambiguo).toBe(false);
  });

  // ── Dúvidas ───────────────────────────────────────────────────────────────

  it("DUVIDA 5: como vai ficar a cor? → duvidas=[{tarefa:5, pergunta:'como vai ficar a cor?'}]", () => {
    const r = parseRespostaCliente("DUVIDA 5: como vai ficar a cor?");
    expect(r.duvidas).toHaveLength(1);
    expect(r.duvidas[0].tarefa).toBe(5);
    expect(r.duvidas[0].pergunta).toBe("como vai ficar a cor?");
    expect(r.ambiguo).toBe(false);
  });

  it("Tenho duvida na 3 → duvidas=[{tarefa:3, pergunta:''}]", () => {
    const r = parseRespostaCliente("Tenho duvida na 3");
    expect(r.duvidas).toHaveLength(1);
    expect(r.duvidas[0].tarefa).toBe(3);
    expect(r.duvidas[0].pergunta).toBe("");
    expect(r.ambiguo).toBe(false);
  });

  // ── Ambíguo ───────────────────────────────────────────────────────────────

  it("texto sem match → ambiguo=true", () => {
    const r = parseRespostaCliente("Oi, tudo bem!");
    expect(r.ambiguo).toBe(true);
    expect(r.aprovacoes).toEqual([]);
    expect(r.rejeicoes).toEqual([]);
  });

  it("string vazia → ambiguo=true", () => {
    const r = parseRespostaCliente("");
    expect(r.ambiguo).toBe(true);
  });

  // ── Multi-ação ────────────────────────────────────────────────────────────

  it("'OK 1, 2, 3 e NAO 4' → aprovacoes=[1,2,3], rejeicoes=[4]", () => {
    const r = parseRespostaCliente("OK 1, 2, 3 e NAO 4");
    expect(r.aprovacoes).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(r.rejeicoes).toContain(4);
    expect(r.ambiguo).toBe(false);
  });

  // ── conteudo_original ─────────────────────────────────────────────────────

  it("preserva conteudo_original exatamente", () => {
    const texto = "  OK 7  ";
    const r = parseRespostaCliente(texto);
    expect(r.conteudo_original).toBe(texto);
  });
});
