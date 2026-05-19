import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

export const { fontFamily: oswald } = loadOswald("normal", {
  weights: ["700"],
});
export const { fontFamily: montserrat } = loadMontserrat("normal", {
  weights: ["500"],
});

export const COLORS = {
  vermelho: "#B70C00",
  vermelhoEscuro: "#8A0900",
  preto: "#0D0D0D",
  branco: "#FFFFFF",
  offWhite: "#E9E6E0",
  lightLeak: "rgba(183, 12, 0, 0.55)",
} as const;

export const SPRING_CONFIG = { damping: 200, stiffness: 100 };
