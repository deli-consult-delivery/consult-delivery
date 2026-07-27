/**
 * Teste de encontrarCobrancasOrfas — garante que só cobranças cujo
 * asaas_charge_id não existe mais em nenhuma página do Asaas são marcadas
 * como órfãs (candidatas a status=canceled), sem tocar as demais.
 */

import { describe, it, expect } from "vitest";
import { encontrarCobrancasOrfas, encontrarDraftsObsoletos } from "./sync-financeiro";

describe("encontrarCobrancasOrfas", () => {
  it("marca como órfã só a cobrança cujo charge sumiu do Asaas", () => {
    const locais = [
      { id: "c1", asaas_charge_id: "pay_1", status: "overdue" },
      { id: "c2", asaas_charge_id: "pay_2", status: "pending" },
      { id: "c3", asaas_charge_id: "pay_3_deletado", status: "overdue" },
    ];
    const asaasIds = new Set(["pay_1", "pay_2"]);

    const orfas = encontrarCobrancasOrfas(locais, asaasIds);

    expect(orfas).toHaveLength(1);
    expect(orfas[0].id).toBe("c3");
  });

  it("nenhuma órfã quando todos os charges locais ainda existem no Asaas", () => {
    const locais = [
      { id: "c1", asaas_charge_id: "pay_1", status: "overdue" },
      { id: "c2", asaas_charge_id: "pay_2", status: "pending" },
    ];
    const asaasIds = new Set(["pay_1", "pay_2", "pay_3_de_outro_cliente"]);

    expect(encontrarCobrancasOrfas(locais, asaasIds)).toHaveLength(0);
  });

  it("lista vazia de locais: retorna vazio", () => {
    expect(encontrarCobrancasOrfas([], new Set(["pay_1"]))).toHaveLength(0);
  });

  it("asaasIds vazio: não marca nada como órfã (recusa 'cancelar tudo' por resposta suspeita)", () => {
    const locais = [
      { id: "c1", asaas_charge_id: "pay_1", status: "overdue" },
      { id: "c2", asaas_charge_id: "pay_2", status: "pending" },
    ];

    expect(encontrarCobrancasOrfas(locais, new Set())).toHaveLength(0);
  });
});

describe("encontrarDraftsObsoletos", () => {
  it("marca como obsoleto o draft cuja cobrança já foi paga/removida/ignorada", () => {
    const drafts = [
      { id: "d1", metadata: { cobranca_v2_id: "c1" } }, // ainda overdue — elegível
      { id: "d2", metadata: { cobranca_v2_id: "c2" } }, // virou received — obsoleto
      { id: "d3", metadata: { cobranca_v2_id: "c3" } }, // virou canceled (órfã) — obsoleto
      { id: "d4", metadata: { cobranca_v2_id: "c4" } }, // marcada ignorar_cobranca — obsoleto
    ];
    const cobrancasRef = [
      { id: "c1", status: "overdue", ignorar_cobranca: false },
      { id: "c2", status: "received", ignorar_cobranca: false },
      { id: "c3", status: "canceled", ignorar_cobranca: false },
      { id: "c4", status: "pending", ignorar_cobranca: true },
    ];

    const obsoletos = encontrarDraftsObsoletos(drafts, cobrancasRef).map((d) => d.id);

    expect(obsoletos.sort()).toEqual(["d2", "d3", "d4"]);
  });

  it("draft sem cobranca_v2_id no metadata (fora do fluxo V2) é ignorado", () => {
    const drafts = [{ id: "d1", metadata: {} }, { id: "d2", metadata: null }];
    expect(encontrarDraftsObsoletos(drafts, [])).toHaveLength(0);
  });

  it("draft cuja cobrança referenciada não existe mais na tabela: também obsoleto", () => {
    const drafts = [{ id: "d1", metadata: { cobranca_v2_id: "c-deletada" } }];
    expect(encontrarDraftsObsoletos(drafts, [])).toHaveLength(1);
  });
});
