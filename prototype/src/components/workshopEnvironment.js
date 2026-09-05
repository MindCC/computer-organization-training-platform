import { Group } from "three/src/objects/Group.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { BoxGeometry } from "three/src/geometries/BoxGeometry.js";
import { CylinderGeometry } from "three/src/geometries/CylinderGeometry.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";

/**
 * Add a compact engineering workbench around the assembly model.
 * The caller owns the scene and resource registry; every disposable resource
 * created here is added to that registry.
 */
export function createWorkshopEnvironment(scene, registry) {
  const root = new Group();
  root.name = "workshop-environment";
  scene.add(root);

  const material = (options) => registry.add(new MeshStandardMaterial(options));
  const navy = material({ color: "#142638", roughness: 0.72, metalness: 0.18 });
  const navyDark = material({ color: "#091722", roughness: 0.62, metalness: 0.3 });
  const steel = material({ color: "#698393", roughness: 0.38, metalness: 0.68 });
  const teal = material({ color: "#20a6a4", roughness: 0.4, metalness: 0.25 });
  const matSurface = material({ color: "#183746", roughness: 0.78, metalness: 0.08 });
  const grid = material({ color: "#2d6370", roughness: 0.6, metalness: 0.08 });
  const screen = material({
    color: "#0c2b35",
    emissive: "#11b9b1",
    emissiveIntensity: 0.08,
    roughness: 0.35,
  });

  function addBox(name, size, position, mat, rotation) {
    const mesh = new Mesh(registry.add(new BoxGeometry(...size)), mat);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }

  // Top surface is just below the shared assembly floor at y = -0.45.
  addBox("workbench-top", [3.3, 0.08, 2.25], [0, -0.51, -0.05], navy);
  addBox("assembly-mat", [1.72, 0.018, 1.2], [0, -0.458, 0], matSurface);

  // A restrained engraved grid gives scale without competing with part hotspots.
  for (let i = -4; i <= 4; i += 1) {
    addBox("mat-grid-z", [0.008, 0.004, 1.12], [i * 0.19, -0.447, 0], grid);
  }
  for (let i = -3; i <= 3; i += 1) {
    addBox("mat-grid-x", [1.64, 0.004, 0.008], [0, -0.447, i * 0.18], grid);
  }

  // Low monitor behind the computer, angled squarely toward the learner.
  addBox("monitor-shell", [1.02, 0.48, 0.055], [0.28, 0.16, -0.91], navyDark);
  const screenMesh = addBox("monitor-screen", [0.9, 0.37, 0.012], [0.28, 0.17, -0.876], screen);
  addBox("monitor-stand", [0.08, 0.32, 0.07], [0.28, -0.25, -0.91], steel);
  addBox("monitor-foot", [0.42, 0.035, 0.22], [0.28, -0.405, -0.84], navyDark);
  // Simple status rails suggest a live diagnostic view without requiring textures.
  addBox("screen-rail-1", [0.62, 0.012, 0.008], [0.22, 0.25, -0.866], teal);
  addBox("screen-rail-2", [0.38, 0.012, 0.008], [0.1, 0.17, -0.866], teal);
  addBox("screen-rail-3", [0.5, 0.012, 0.008], [0.16, 0.09, -0.866], teal);

  // Restrained desk props: a parts tray and an ESD tool at the right edge.
  addBox("parts-tray", [0.55, 0.035, 0.4], [1.18, -0.445, 0.35], navyDark);
  addBox("parts-tray-inset", [0.46, 0.014, 0.31], [1.18, -0.422, 0.35], steel);
  const tool = new Mesh(registry.add(new CylinderGeometry(0.025, 0.035, 0.48, 10)), navyDark);
  tool.name = "precision-driver";
  tool.position.set(1.22, -0.39, -0.27);
  tool.rotation.set(Math.PI / 2, 0, 0.45);
  tool.castShadow = true;
  root.add(tool);
  const tip = new Mesh(registry.add(new CylinderGeometry(0.01, 0.018, 0.22, 8)), steel);
  tip.name = "precision-driver-tip";
  tip.position.set(1.08, -0.4, -0.4);
  tip.rotation.copy(tool.rotation);
  tip.castShadow = true;
  root.add(tip);

  let isPowered = false;
  return {
    update(powered, time = 0, reducedMotion = false) {
      isPowered = Boolean(powered);
      screen.emissiveIntensity = isPowered
        ? (reducedMotion ? 0.7 : 0.66 + Math.sin(time * 1.8) * 0.06)
        : 0.08;
      screenMesh.visible = true;
    },
    dispose() {
      scene.remove(root);
    },
  };
}
