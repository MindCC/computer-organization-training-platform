import { useEffect, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useQuestMotion(scopeRef, animationFactory, dependencies = []) {
  const reducedMotion = useReducedMotion();

  useGSAP(
    () => animationFactory({ gsap, reducedMotion }),
    { scope: scopeRef, dependencies: [reducedMotion, ...dependencies], revertOnUpdate: true },
  );

  return reducedMotion;
}
