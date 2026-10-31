import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TakshaIcon } from '../../../components/BrandLogo';

// The chisel T from the logo, as polygons in its 64 unit viewBox.
const BEAM = [[7, 10], [57, 10], [47, 25], [17, 25]];
const BLADE_LEFT = [[23, 28.5], [32, 28.5], [32, 58], [23, 47]];
const BLADE_RIGHT = [[32, 28.5], [41, 28.5], [41, 47], [32, 58]];

const STAGE_LIGHT = { plan: '#FF8A4C', build: '#818CF8', test: '#FBBF24', fix: '#4ADE80' };
const STAGE_ORDER = ['plan', 'build', 'test', 'fix'];
const NODE_RADIUS = 2.45;

function polygonGeometry(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    const px = x - 32;
    const py = 34 - y;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 7,
    bevelEnabled: true,
    bevelThickness: 0.8,
    bevelSize: 0.55,
    bevelSegments: 4,
  });
  geometry.translate(0, 0, -3.5);
  return geometry;
}

function sparkField(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const ember = new THREE.Color('#FF8A4C');
  const indigo = new THREE.Color('#818CF8');
  for (let i = 0; i < count; i++) {
    const radius = 2.6 + Math.random() * 3.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.7;
    positions[i * 3 + 2] = radius * Math.cos(phi);
    (Math.random() > 0.35 ? ember : indigo).toArray(colors, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export default function LandingForge3D({ progressRef, stage }) {
  const hostRef = useRef(null);
  const stageRef = useRef(stage);
  const [supported] = useState(() => {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  });

  useEffect(() => { stageRef.current = stage; }, [stage]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !supported) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return undefined;
    }

    const small = window.innerWidth <= 900;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 0, 11);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;

    // Sits right of center on desktop, so the stage copy has the left side.
    const forge = new THREE.Group();
    forge.position.x = small ? 0 : 1.5;
    scene.add(forge);

    const faceMaterial = new THREE.MeshPhysicalMaterial({
      color: '#FF7A1F', metalness: 0.92, roughness: 0.24, clearcoat: 0.7, clearcoatRoughness: 0.2,
    });
    const shadeMaterial = new THREE.MeshPhysicalMaterial({
      color: '#B83A0A', metalness: 0.95, roughness: 0.3, clearcoat: 0.5,
    });

    const mark = new THREE.Group();
    [[BEAM, faceMaterial], [BLADE_LEFT, faceMaterial], [BLADE_RIGHT, shadeMaterial]].forEach(([points, material]) => {
      mark.add(new THREE.Mesh(polygonGeometry(points), material));
    });
    mark.scale.setScalar(0.062);
    forge.add(mark);

    const orbit = new THREE.Group();
    orbit.rotation.x = 1.22;
    forge.add(orbit);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#FF8A4C', transparent: true, opacity: 0.55 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(NODE_RADIUS, 0.012, 10, 220), ringMaterial);
    orbit.add(ring);

    const outerMaterial = ringMaterial.clone();
    outerMaterial.opacity = 0.2;
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(NODE_RADIUS + 0.62, 0.008, 8, 220), outerMaterial);
    outerRing.rotation.x = 0.34;
    orbit.add(outerRing);

    const nodeGeometry = new THREE.IcosahedronGeometry(0.09, 3);
    const nodes = STAGE_ORDER.map((id, i) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: STAGE_LIGHT[id], metalness: 0.5, roughness: 0.3, emissive: STAGE_LIGHT[id], emissiveIntensity: 0.3,
      });
      const node = new THREE.Mesh(nodeGeometry, material);
      const angle = (i / STAGE_ORDER.length) * Math.PI * 2;
      node.position.set(Math.cos(angle) * NODE_RADIUS, Math.sin(angle) * NODE_RADIUS, 0);
      orbit.add(node);
      return node;
    });

    const sparkMaterial = new THREE.PointsMaterial({
      size: 0.022, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false,
    });
    const sparks = new THREE.Points(sparkField(small ? 180 : 360), sparkMaterial);
    scene.add(sparks);

    const key = new THREE.DirectionalLight('#FFFFFF', 1.4);
    key.position.set(4, 6, 6);
    scene.add(key);
    const stageLight = new THREE.PointLight(STAGE_LIGHT.plan, 26, 14);
    stageLight.position.set(-2.6, 1.6, 3.2);
    scene.add(stageLight);

    const applyTheme = () => {
      const light = document.documentElement.classList.contains('light-theme');
      renderer.toneMappingExposure = light ? 1.02 : 1.2;
      sparkMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      sparkMaterial.opacity = light ? 0.5 : 0.7;
      sparkMaterial.needsUpdate = true;
      ringMaterial.color.set(light ? '#C2410C' : '#FF8A4C');
      outerMaterial.color.set(light ? '#4F46E5' : '#818CF8');
    };
    applyTheme();
    const themeWatch = new MutationObserver(applyTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const sizeWatch = new ResizeObserver(resize);
    sizeWatch.observe(host);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lightColor = new THREE.Color(STAGE_LIGHT.plan);
    const clock = new THREE.Clock();
    let smooth = 0;
    let frame = 0;
    let visible = false;

    const render = () => {
      const time = clock.getElapsedTime();
      const target = progressRef?.current ?? 0;
      smooth += (target - smooth) * 0.07;
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      forge.rotation.y = smooth * Math.PI * 2 + pointer.x * 0.32 + Math.sin(time * 0.45) * 0.14;
      forge.rotation.x = -0.1 + pointer.y * 0.18 + Math.sin(time * 0.6) * 0.03;
      forge.position.y = Math.sin(time * 0.9) * 0.07;
      orbit.rotation.z = time * 0.12 + smooth * Math.PI * 3;
      sparks.rotation.y = time * 0.03 - smooth * 1.2;
      camera.position.z = 12.5 - Math.sin(smooth * Math.PI) * 1.4;

      const activeIndex = STAGE_ORDER.indexOf(stageRef.current);
      nodes.forEach((node, i) => {
        const on = i === activeIndex;
        const scale = THREE.MathUtils.lerp(node.scale.x, on ? 1.7 : 1, 0.1);
        node.scale.setScalar(scale);
        node.material.emissiveIntensity = THREE.MathUtils.lerp(node.material.emissiveIntensity, on ? 0.75 : 0.12, 0.1);
      });
      lightColor.set(STAGE_LIGHT[stageRef.current] || STAGE_LIGHT.plan);
      stageLight.color.lerp(lightColor, 0.08);

      renderer.render(scene, camera);
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (visible && !document.hidden) render();
    };

    const inView = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.02 });
    inView.observe(host);

    if (reducedMotion) render();
    else loop();

    return () => {
      cancelAnimationFrame(frame);
      inView.disconnect();
      sizeWatch.disconnect();
      themeWatch.disconnect();
      window.removeEventListener('pointermove', onPointer);
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
        else object.material?.dispose();
      });
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progressRef, supported]);

  return (
    <div ref={hostRef} className="lp-forge__canvas" aria-hidden="true">
      {!supported && <div className="lp-forge__fallback"><TakshaIcon size={200} /></div>}
    </div>
  );
}
