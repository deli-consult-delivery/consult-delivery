#!/usr/bin/env python3
"""
apply_logo.py — Aplica overlay do logo Consult Delivery no canto inferior direito.

Uso:
    python apply_logo.py \\
        --input gerada.png \\
        --logo assets/logo-consultdelivery.png \\
        --output final.png \\
        --position bottom-right \\
        --padding-pct 5 \\
        --logo-width-pct 14

Requisitos:
    pip install pillow
"""

import argparse
import sys
from pathlib import Path
from PIL import Image


def apply_logo(
    input_path: str,
    logo_path: str,
    output_path: str,
    position: str = "bottom-right",
    padding_pct: float = 5.0,
    logo_width_pct: float = 14.0,
) -> None:
    """
    Sobrepõe o logo numa imagem base.

    Args:
        input_path: imagem gerada pelo Recraft
        logo_path: PNG do logo com transparência
        output_path: caminho de saída
        position: bottom-right | bottom-left | top-right | top-left
        padding_pct: margem em % da largura/altura da imagem base
        logo_width_pct: largura do logo em % da largura da imagem base
    """
    base = Image.open(input_path).convert("RGBA")
    logo = Image.open(logo_path).convert("RGBA")

    base_w, base_h = base.size

    # Redimensiona o logo proporcionalmente
    target_logo_w = int(base_w * logo_width_pct / 100)
    aspect = logo.height / logo.width
    target_logo_h = int(target_logo_w * aspect)
    logo_resized = logo.resize((target_logo_w, target_logo_h), Image.LANCZOS)

    # Calcula padding em pixels (usa o menor lado como referência)
    pad_x = int(base_w * padding_pct / 100)
    pad_y = int(base_h * padding_pct / 100)

    # Calcula posição
    positions = {
        "bottom-right": (base_w - target_logo_w - pad_x, base_h - target_logo_h - pad_y),
        "bottom-left": (pad_x, base_h - target_logo_h - pad_y),
        "top-right": (base_w - target_logo_w - pad_x, pad_y),
        "top-left": (pad_x, pad_y),
    }

    if position not in positions:
        raise ValueError(f"Posição inválida: {position}. Use uma de {list(positions.keys())}")

    pos = positions[position]

    # Compõe a imagem usando o canal alfa do logo
    base.paste(logo_resized, pos, logo_resized)

    # Salva como PNG (preserva transparência) ou JPG dependendo da extensão
    output = Path(output_path)
    if output.suffix.lower() in (".jpg", ".jpeg"):
        base.convert("RGB").save(output, quality=95, optimize=True)
    else:
        base.save(output, optimize=True)

    print(f"✓ Logo aplicado. Salvo em: {output_path}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Aplica overlay do logo Consult Delivery em uma imagem.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--input", required=True, help="Imagem base (gerada pelo Recraft)")
    parser.add_argument("--logo", required=True, help="PNG do logo com transparência")
    parser.add_argument("--output", required=True, help="Caminho da imagem final")
    parser.add_argument(
        "--position",
        default="bottom-right",
        choices=["bottom-right", "bottom-left", "top-right", "top-left"],
        help="Posição do logo",
    )
    parser.add_argument(
        "--padding-pct",
        type=float,
        default=5.0,
        help="Margem em %% da imagem base",
    )
    parser.add_argument(
        "--logo-width-pct",
        type=float,
        default=14.0,
        help="Largura do logo em %% da largura da imagem (use 14 para feed, 18 para story)",
    )

    args = parser.parse_args()

    try:
        apply_logo(
            input_path=args.input,
            logo_path=args.logo,
            output_path=args.output,
            position=args.position,
            padding_pct=args.padding_pct,
            logo_width_pct=args.logo_width_pct,
        )
    except Exception as e:
        print(f"✗ Erro: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
