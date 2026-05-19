import React from "react";
import { Img, staticFile } from "remotion";

interface RocketSymbolProps {
  variant?: "white" | "red";
  size?: number;
}

export const RocketSymbol: React.FC<RocketSymbolProps> = ({
  variant = "white",
  size = 64,
}) => {
  // rocket-red.png usado para ambas as variantes.
  // brightness(0) invert(1) converte vermelho → branco sem tocar na transparência.
  const filter =
    variant === "white" ? "brightness(0) invert(1)" : undefined;

  return (
    <Img
      src={staticFile("rocket-red.png")}
      style={{ width: size, height: size, objectFit: "contain", filter }}
    />
  );
};
