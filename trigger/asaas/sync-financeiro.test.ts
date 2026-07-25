/**
 * Teste de encontrarCobrancasOrfas — garante que só cobranças cujo
 * asaas_charge_id não existe mais em nenhuma página do Asaas são marcadas
 * como órfãs (candidatas a status=canceled), sem tocar as demais.
 */

import { describe, it, expect } from "vitest";
import { encontrarCobrancasOrfas } from "./sync-financeiro";

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
