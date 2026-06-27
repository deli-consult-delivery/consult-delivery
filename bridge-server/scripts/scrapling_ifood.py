#!/usr/bin/env python3
"""
Scraper de restaurante iFood usando Scrapling.
Uso: python3 scrapling_ifood.py <url_ifood>
Saída: JSON para stdout com { nome, url, categorias: [{ nome, itens: [{ nome, preco, descricao }] }] }
"""

import sys
import json
import re
from scrapling import Fetcher

def parse_preco(texto):
    """Extrai valor float de string de preço como 'R$ 12,90'."""
    if not texto:
        return None
    m = re.search(r'[\d]+[,.][\d]+', texto.replace('.', '').replace(',', '.'))
    return float(m.group()) if m else None

def scrape_ifood(url):
    fetcher = Fetcher()
    page = fetcher.get(url, stealthy_headers=True, timeout=25)

    resultado = { "url": url, "nome": None, "categorias": [] }

    # Nome do restaurante
    nome_el = (
        page.find("h1")
        or page.find("[class*='restaurant-name']")
        or page.find("[class*='restaurantName']")
        or page.find("[data-test-id='restaurant-header-name']")
    )
    if nome_el:
        resultado["nome"] = nome_el.text.strip()

    # Categorias e itens do cardápio
    # iFood renderiza via JS — tentamos pelos seletores mais comuns de SSR/cache
    categorias_els = (
        page.find_all("[class*='categoryName']")
        or page.find_all("[class*='category-name']")
        or page.find_all("h2, h3")
    )

    itens_els = page.find_all("[class*='menuItem'], [class*='menu-item'], [class*='dish']")

    if itens_els:
        # Agrupa itens por categoria mais próxima
        cat_atual = "Cardápio"
        categorias = {}
        for item in itens_els:
            nome_item = (
                item.find("[class*='itemName'], [class*='item-name'], [class*='dishName']")
                or item.find("h3, h4, span")
            )
            preco_el = item.find("[class*='price'], [class*='preco']")
            desc_el = item.find("[class*='description'], [class*='descricao']")

            if not nome_item:
                continue

            if cat_atual not in categorias:
                categorias[cat_atual] = []

            categorias[cat_atual].append({
                "nome": nome_item.text.strip(),
                "preco": parse_preco(preco_el.text if preco_el else None),
                "descricao": desc_el.text.strip() if desc_el else None,
            })

        resultado["categorias"] = [
            {"nome": cat, "itens": itens}
            for cat, itens in categorias.items()
        ]
    elif categorias_els:
        # Fallback: retorna só nomes de categorias que encontrou
        resultado["categorias"] = [
            {"nome": el.text.strip(), "itens": []}
            for el in categorias_els
            if el.text.strip()
        ]

    # Metadados extras que o iFood expõe em JSON-LD
    json_ld = page.find("script[type='application/ld+json']")
    if json_ld:
        try:
            ld = json.loads(json_ld.text)
            if isinstance(ld, dict):
                resultado["nome"] = resultado["nome"] or ld.get("name")
                if "hasMenu" in ld:
                    menu = ld["hasMenu"]
                    if isinstance(menu, dict) and "hasMenuSection" in menu:
                        resultado["categorias"] = [
                            {
                                "nome": sec.get("name", ""),
                                "itens": [
                                    {
                                        "nome": it.get("name", ""),
                                        "preco": parse_preco(
                                            str(it.get("offers", {}).get("price", ""))
                                        ),
                                        "descricao": it.get("description"),
                                    }
                                    for it in sec.get("hasMenuItem", [])
                                ],
                            }
                            for sec in menu["hasMenuSection"]
                        ]
        except Exception:
            pass

    return resultado

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"erro": "url obrigatória"}))
        sys.exit(1)

    url = sys.argv[1]
    if "ifood.com.br" not in url:
        print(json.dumps({"erro": "apenas URLs do iFood são suportadas"}))
        sys.exit(1)

    try:
        dados = scrape_ifood(url)
        print(json.dumps(dados, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"erro": str(e)}))
        sys.exit(1)
